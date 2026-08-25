// 스토어 등록물. 스크린샷 두 장과 피처 그래픽 한 장을 뽑는다.
//
//   node tools/store.mjs [출력디렉토리]      기본값 .store
//
// **`tools/shot.js` 와 목적이 다르다.** shot.js 는 레이아웃이 깨졌는지 보는 자라서
// 판을 일부러 극단으로 몰아 둔다 — 골드 99999, 웨이브 0, 적 없는 판. 그건 사람에게
// 보여줄 그림이 아니다. 여기서는 **플레이 중인 판처럼 보이는 상태**를 만든다.
// 그래서 두 스크립트를 합치지 않는다. 합치면 한쪽 목적이 반드시 진다.
//
// 부팅·시드·정지 방식은 shot.js 에서 그대로 가져왔다. 거기 주석에 이유가 다 있다
// (특히 `__freeze` 가 update 만으로는 안 멈추는 이유). 고칠 일이 생기면 그쪽을 먼저 읽어라.
//
// ── 크기를 720x1280 으로 잡은 이유 ───────────────────────────
// 두 스토어의 규칙을 **한 장으로 동시에** 만족시켜야 한다.
//
//   원스토어    가로세로 최대 1300px · 16:9 또는 9:16 권장 · 최대 1MB · 2~8장
//   구글플레이  긴 변이 짧은 변의 2배를 넘으면 거부
//
// 이 게임의 기준 뷰포트 390x844 는 2.16배라 구글플레이에서 거부된다. 처음에는
// 540x960 에 배율 2 를 걸어 1080x1920 을 냈는데, 그건 **원스토어의 1300px 상한을
// 넘는다**(1920). 360x640 에 배율 2 를 걸면 720x1280 — 9:16 정확히, 긴 변 1280 은
// 1300 아래, 2배 규칙도 1.78 로 통과다.
// **이 값을 바꿀 때는 위 네 줄을 전부 다시 확인해라.** 한쪽만 보면 다른 쪽에서 막힌다.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'store');
const URL = 'file://' + join(ROOT, 'index.html');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright 없음.  npm i -D playwright && npx playwright install chromium'); process.exit(1); }

// shot.js 와 같은 시드·가상 시계. 런마다 그림이 달라지면 「대충 한 장」 이 아니라
// 매번 다른 물건이 된다.
const SEED_SCRIPT = `(() => {
  try { localStorage.clear(); } catch {}
  let s = 12345;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const raf = window.requestAnimationFrame.bind(window);
  let vt = 0, realT = null;
  window.requestAnimationFrame = cb => raf(t => {
    if (t !== realT) { realT = t; vt += 1000 / 60; }
    cb(vt);
  });
  performance.now = () => vt;
  window.__reseed = () => { s = 12345; fxSeed = 0x9e3779b9; };
})();`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const bad = [];

// ── 게임 스크린샷 두 장 ────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
page.on('pageerror', e => bad.push('페이지 에러: ' + e));
await page.addInitScript(SEED_SCRIPT);
await page.goto(URL);
await page.evaluate(() => { const el = document.getElementById('ebIntro'); if (el) el.remove(); });

const shot = async (name, check) => {
  const why = await page.evaluate(check);
  if (why) bad.push(`${name}: ${why}`);
  await page.screenshot({ path: join(OUT, name + '.png') });
  // 피처 그래픽에서 PNG(241KB)가 「업로드 실패」로 거부당하고 JPG(46KB)가 올라간
  // 일이 있다(아래 피처 그래픽 절 주석). 스크린샷도 같은 창구로 올라가므로
  // **JPG 를 한 벌 더 낸다.** 원스토어 상한은 한 장당 1MB 다.
  await page.screenshot({ path: join(OUT, name + '.jpg'), type: 'jpeg', quality: 92 });
  console.log(`  ${name}.png + .jpg${why ? '   ⚠ ' + why : ''}`);
};

// 판에 들어가 성급이 섞인 보드를 만든다. **★1 만 늘어놓으면 이 게임이 머지 게임인
// 것이 안 보인다** — 스토어 이름이 「이웨이브는못막습니다」라도 첫인상은 타워 위의
// 별이 만든다. 그래서 1·2·3·5 를 섞고 5 를 둘 둔다.
await page.evaluate(() => {
  __reseed();
  restart();
  applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
  pickStage(0);
  ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
  startRun();
  tuteMerged = true;                  // 고동치는 안내는 런마다 위상이 달라진다
  window.__update = update;
  window.__freeze = () => { window.update = () => {}; shake.t = 0; leakWarnT = 0; };

  let id = 9800;
  window.__put = (kind, star, gx, gy) => state.towers.push({
    id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
    cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
});

// ── 1. 전투 중 ─────────────────────────────────────────────
// 적이 화면에 있어야 「디펜스」로 읽힌다. 웨이브를 실제로 돌려서 적을 통로에 올린다.
await page.evaluate(() => {
  __reseed();
  window.update = window.__update;
  // 자리는 게임 규칙으로 고른다. `canPlace` 는 점유 맵을 받고(occupancy),
  // **5성은 2x2 를 먹는다** — 한 칸만 보고 놓으면 이웃 위에 겹쳐 그려진다.
  // 타워를 하나 놓을 때마다 점유 맵을 다시 뜬다. 판 모양이 바뀌어도 안 깨진다.
  const plan = [['shredder', 5], ['frost', 3], ['marksman', 2], ['shredder', 1],
                ['frost', 1], ['marksman', 4], ['shredder', 2], ['frost', 1]];
  // 후보 칸을 통째로 모아 섞은 뒤 앞에서부터 집는다. 순서대로 훑으면 여덟 대가
  // **맨 아랫줄에 일렬로 붙는다** — 실제로 그렇게 두는 사람은 없고, 그림도 그렇게
  // 보인다. 시드가 고정이라 섞어도 매번 같은 배치가 나온다.
  const spots = [];
  for (let gy = firstOpenRow(); gy < CFG.BOARD_H; gy++)
    for (let gx = 0; gx < CFG.BOARD_W; gx++) spots.push({ gx, gy });
  for (let i = spots.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const [kind, star] of plan) {
    const occ = occupancy();
    const size = star >= 5 ? 2 : 1;      // 5성은 2x2 를 먹는다
    const c = spots.find(c => canPlace(c.gx, c.gy, size, occ));
    if (c) __put(kind, star, c.gx, c.gy);
  }
  state.selected = null;
  state.wave = 12;
  state.timer = 0;
  for (let i = 0; i < 210; i++) update(1 / 30);  // 웨이브 시작 7초 뒤 — 적이 타워 사거리 안까지 내려온다
  state.gold = 340;                              // 실제로 플레이한 사람의 지갑
  __freeze();
});
await page.waitForTimeout(200);
await shot('screenshot-1-wave', () => {
  if (state.phase !== 'wave') return '웨이브 중이 아니다: ' + state.phase;
  if (!state.enemies.length) return '화면에 적이 없다';
  if (!state.towers.some(t => t.star >= 5)) return '5성 타워가 없다';
  if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
  return null;
});

// ── 2. 배치 · 사거리 ───────────────────────────────────────
// 두 번째 장은 「무엇을 하는 게임인가」를 말한다. 타워를 하나 골라 사거리 원을 띄운다.
await page.evaluate(() => {
  __reseed();
  window.update = window.__update;
  state.phase = 'build';
  state.timer = 8;                 // 배치 단계는 남은 시간을 센다. 안 맞추면 「-0.0s」 가 찍힌다
  state.enemies.length = 0;
  state.beams.length = 0;
  const five = state.towers.find(t => t.star >= 5);
  state.selected = five ? five.id : state.towers[0].id;
  state.gold = 340;
  __freeze();
});
await page.waitForTimeout(200);
await shot('screenshot-2-build', () => {
  if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
  if (!state.selected) return '선택된 타워가 없다(사거리 원이 안 그려진다)';
  if (state.enemies.length) return '적이 남아 있다';
  return null;
});
await page.close();

// ── 피처 그래픽 1024x578 ───────────────────────────────────
// 원스토어 「그래픽 이미지」 규격이다. 구글플레이의 피처 그래픽은 1024x500 이라
// 크기가 다르다 — 필요해지면 아래 W/H 만 바꿔 한 장 더 뽑는다.
const FEAT = readFileSync(join(ROOT, 'store', 'feature.svg'), 'utf8');
const fp = await browser.newPage({ viewport: { width: 1024, height: 578 } });
await fp.setContent(`<style>html,body{margin:0;padding:0;background:#0d1117}</style>${FEAT}`);
await fp.waitForTimeout(150);
await fp.screenshot({ path: join(OUT, 'feature-1024x578.png') });
console.log('  feature-1024x578.png');
// **원스토어에는 JPG 를 올려라.** 등록 화면은 「JPG, PNG」를 둘 다 받는다고
// 적어 놓지만, 이 그림의 PNG(241KB)는 「업로드 실패」로 거부당했고 같은 그림의
// JPG(46KB)는 한 번에 올라갔다. 규격·메타데이터는 두 파일이 완전히 같았다 —
// 1024x578 · 8-bit RGB · 알파 없음 · non-interlaced · DPI 72. 성공한 형제
// 리포(fruit-smash)의 것이 82KB 였다. **남은 변수는 용량뿐이었다.**
//
// PNG 가 큰 것은 배경 그라데이션 두 겹과 후광 때문이다. 무손실이라 부드러운
// 색 변화에서 용량이 튄다 — JPG 는 그게 강점이라 같은 그림이 5분의 1이 된다.
// 품질 92 는 이 그림(평면 색 + 격자)에서 눈으로 차이가 안 나는 가장 낮은 값이다.
//
// PNG 도 계속 낸다. 스토어마다 받는 형식이 다르고, 원본 확인용으로도 쓴다.
await fp.screenshot({ path: join(OUT, 'feature-1024x578.jpg'), type: 'jpeg', quality: 92 });
console.log('  feature-1024x578.jpg');
await fp.close();

await browser.close();
if (bad.length) { console.error('\n어긋난 것:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`\n${OUT} 에 6장.`);
