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
const SEED_SCRIPT = `(() => {
  let s = 12345;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const raf = window.requestAnimationFrame.bind(window);
  let vt = 0;
  window.requestAnimationFrame = cb => raf(() => cb(vt += 1000 / 60));
  performance.now = () => vt;
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

async function shoot(browser, url) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(SEED_SCRIPT);
  await page.goto(url);
  await page.waitForTimeout(300);
  await page.evaluate(DRIVE);
  // 프레임 수를 맞추기 위해 rAF 를 세어 가며 진행시킨다
  await page.evaluate(() => new Promise(res => {
    let n = 0;
    const tick = () => (++n < 120 ? requestAnimationFrame(tick) : res());
    requestAnimationFrame(tick);
  }));
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
const a = await shoot(browser, pathToFileURL(join(ROOT, 'index.html')).href);
const b = await shoot(browser, pathToFileURL(join(ROOT, 'dist', 'games', 'canthold', 'index.html')).href);
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
