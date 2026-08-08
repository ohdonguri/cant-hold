// 원본과 압축본을 같은 조건으로 돌려 화면이 같은지 본다.
//
//   node tools/verify-build.mjs
//
// build.mjs 의 검사는 "문법이 성립하고 핵심 문자열이 남았나"까지다. 압축이 조용히
// 동작을 바꾸는 경우는 그걸로 못 잡는다. 그래서 실제로 렌더해서 비교한다.
//
// 게임에 난수가 있으므로 두 쪽 모두 같은 시드의 PRNG 로 Math.random 을 갈아끼운다.
// playwright 는 개발용이라 없으면 그냥 건너뛴다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.log('playwright 없음 — 렌더 비교는 건너뛴다 (npm i -D playwright)');
  process.exit(0);
}

// 두 페이지를 같은 조건으로 만든다.
// 난수는 시드로 고정하고, 프레임 시각도 가상 시계로 고정한다 —
// 실제 시각을 쓰면 빔·피격 표시 같은 짧은 효과가 프레임마다 어긋나서
// 픽셀 비교가 늘 실패한다.
// 둘 다 file:// 라 같은 오리진이다. 앞 실행이 남긴 세이브를 뒤가 읽으면
// 시작 상태부터 달라진다.
// 가상 시계는 콜백당이 아니라 "실제 프레임당" 한 번만 돌아야 한다.
// 프레임 수를 세는 아래의 rAF 루프도 같은 rAF 를 타므로, 콜백마다 시계를 밀면
// 세는 쪽이 게임의 시간을 훔쳐 간다. 그러면 게임이 받는 dt 가 1/60 과 2/60 사이에서
// 실행마다 달라지고, 같은 파일을 두 번 띄워도 결과가 갈린다(실측 3회 중 2회 불일치).
// 같은 프레임의 콜백은 브라우저가 주는 실제 타임스탬프가 같으므로 그걸로 묶는다.
const SEED_SCRIPT = `(() => {
  try { localStorage.clear(); } catch {}
  let s = 12345;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const raf = window.requestAnimationFrame.bind(window);
  let vt = 0, realT = null, frozen = false;
  window.requestAnimationFrame = cb => raf(t => {
    if (!frozen && t !== realT) { realT = t; vt += 1000 / 60; }
    cb(vt);
  });
  performance.now = () => vt;
  // 찍기 직전에 시계를 세운다. 프레임 수를 다 센 뒤에도 캡처가 끝날 때까지
  // rAF 는 계속 도는데, 그 사이 몇 장이 더 그려지는지는 매번 다르다.
  // 시계를 세우면 dt 가 0 이라 판이 안 흐르고 같은 그림만 다시 그린다.
  window.__freezeClock = () => { frozen = true; };
})();`;

// 같은 순서로 판을 만든다
const DRIVE = `(() => {
  pickStage(0);
  ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
  startRun();
  state.gold = 99999;
  for (let i = 0; i < 14; i++) summon(state.deck[i % 3]);
  state.selected = state.towers[0].id;
  state.wave = 9;
  rushWave();
})();`;

// 게임 루프가 정확히 n 프레임 돌 때까지 기다린다.
//
// 예전에는 rAF 체인을 따로 하나 걸어서 셌는데, 그건 게임의 rAF 와 나란히 도는
// 별개의 체인이라 "게임이 몇 프레임 굴렀나"를 못 센다. 등록 순서에 따라 120 이
// 되기도 121 이 되기도 했다. waitForTimeout 도 같은 이유로 못 쓴다 — 실제 시각에
// 좌우돼서 판이 몇 프레임 굴렀는지가 실행마다 다르다.
// 게임 자신의 render 를 세면 그 수가 곧 게임이 돈 프레임 수다.
//
// render 가 터져도 카운트는 올린다. 안 그러면 promise 가 영원히 안 풀려서
// "다르다"가 아니라 "멈춤"으로 끝난다. 예외는 pageerror 로 따로 잡힌다.
//
// 루프가 전역 render 를 안 부르게 바뀌면 이 대기는 영원히 안 풀린다. 그건 "다르다"가
// 아니라 "멈춤"이라서, 검사가 실패를 못 알리고 CI 를 타임아웃까지 끌고 간다.
// 그래서 벽시계 상한을 걸고 넘기면 던진다.
const runFrames = (page, n, freeze) => page.evaluate(({ n, freeze }) => new Promise((res, rej) => {
  let i = 0;
  const orig = window.render;
  const done = () => { window.render = orig; clearTimeout(timer); };
  const timer = setTimeout(() => {
    done();
    rej(new Error(`프레임 ${n} 대기 시간 초과 (${i} 프레임에서 멈춤). 루프가 전역 render 를 안 부른다`));
  }, 15000);
  window.render = () => {
    try { orig(); }
    finally {
      if (++i >= n) { done(); if (freeze) window.__freezeClock(); res(); }
    }
  };
}), { n, freeze });

async function shoot(browser, url) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(SEED_SCRIPT);
  await page.goto(url);
  await runFrames(page, 10, false);     // 시작 화면에서 같은 지점까지 맞춘다
  await page.evaluate(DRIVE);
  await runFrames(page, 120, true);     // 마지막 프레임에서 시계를 세우고 찍는다
  const shot = await page.screenshot();
  const snap = await page.evaluate(() => ({
    wave: state.wave, life: state.life, gold: Math.round(state.gold),
    towers: state.towers.map(t => t.kind + t.star).sort().join(','),
    enemies: state.enemies.length,
  }));
  await page.close();
  return { shot, snap, errors };
}

const browser = await chromium.launch();
let a, b;
try {
  a = await shoot(browser, pathToFileURL(join(ROOT, 'index.html')).href);
  b = await shoot(browser, pathToFileURL(join(ROOT, 'dist', 'games', 'canthold', 'index.html')).href);
} catch (err) {
  await browser.close();
  console.error('검사를 못 돌렸다:\n  ' + err.message);
  process.exit(1);
}
await browser.close();

const problems = [];
if (a.errors.length) problems.push('원본 에러: ' + a.errors.join(' / '));
if (b.errors.length) problems.push('압축본 에러: ' + b.errors.join(' / '));

for (const k of Object.keys(a.snap))
  if (a.snap[k] !== b.snap[k]) problems.push(`${k}: 원본 ${a.snap[k]} vs 압축본 ${b.snap[k]}`);

// 픽셀 비교
if (a.shot.length !== b.shot.length || !a.shot.equals(b.shot)) {
  // PNG 바이트가 다르면 실제로 다른 픽셀이 몇 개인지까지는 안 세고 실패로 본다
  problems.push('렌더 결과가 다르다');
}

if (problems.length) {
  console.error('압축본이 원본과 다르다:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('원본과 압축본의 상태·렌더가 동일하다', JSON.stringify(a.snap));
