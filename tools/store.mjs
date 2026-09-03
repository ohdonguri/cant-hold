// 스토어 등록물. 원스토어(스크린샷 2 + 피처 그래픽)와 앱인토스(세로 3 + 가로 1 + 썸네일)를 뽑는다.
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

// ── 게임 스크린샷 ──────────────────────────────────────────
// 같은 장면을 스토어마다 다른 크기로 찍는다. 장면을 함수로 묶고 크기별로 페이지를
// 새로 연다 — 뷰포트만 바꾸면 레이아웃이 그 크기로 다시 흐르므로, 찍은 그대로가
// 그 기기에서 보이는 화면이다(늘리거나 자르지 않는다).
//
//   원스토어    720x1280   viewport 360x640 @2 — 위 「크기를 720x1280 으로」 주석의 네 규칙
//   앱인토스    636x1048   viewport 318x524 @2 — 콘솔 요구 규격 그대로. 세로형 최소 3장
//
const openGamePage = async (w, h, { cloudUi = true } = {}) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  page.on('pageerror', e => bad.push('페이지 에러: ' + e));
  await page.addInitScript(SEED_SCRIPT);
  // 토스판 화면을 찍을 때는 CLOUD_UI 를 끈 본문을 먹인다 — 토스판이 실제로 그렇다
  // (toss/sync.mjs · tools/android-sync.mjs 가 같은 값을 끈다). 스테이지 목록의
  // 「구글로 로그인」 줄이 빠지는 것이 눈에 보이는 차이의 전부다. 콘솔의
  // 「자체등급분류 게임물 화면 = 앱인토스 게임물 화면」 대조도 이 컷으로 낸다 —
  // 실물과 다른 화면을 심사에 내면 안 된다.
  if (!cloudUi) await page.route('**/index.html', route => route.fulfill({
    body: readFileSync(join(ROOT, 'index.html'), 'utf8')
      .replace('const CLOUD_UI = true;', 'const CLOUD_UI = false;'),
    contentType: 'text/html',
  }));
  await page.goto(URL);
  await page.evaluate(() => { const el = document.getElementById('ebIntro'); if (el) el.remove(); });
  await page.evaluate(bootScene);
  return page;
};

const mkShot = page => async (name, check) => {

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
const bootScene = () => {
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
};

// ── 1. 전투 중 ─────────────────────────────────────────────
// 적이 화면에 있어야 「디펜스」로 읽힌다. 웨이브를 실제로 돌려서 적을 통로에 올린다.
const sceneWave = page => page.evaluate(() => {
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
const checkWave = () => {
  if (state.phase !== 'wave') return '웨이브 중이 아니다: ' + state.phase;
  if (!state.enemies.length) return '화면에 적이 없다';
  if (!state.towers.some(t => t.star >= 5)) return '5성 타워가 없다';
  if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
  return null;
};

// ── 2. 배치 · 사거리 ───────────────────────────────────────
// 두 번째 장은 「무엇을 하는 게임인가」를 말한다. 타워를 하나 골라 사거리 원을 띄운다.
const sceneBuild = page => page.evaluate(() => {
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
const checkBuild = () => {
  if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
  if (!state.selected) return '선택된 타워가 없다(사거리 원이 안 그려진다)';
  if (state.enemies.length) return '적이 남아 있다';
  return null;
};

// ── 3. 스테이지 목록 (토스 세 번째 장) ──────────────────────
// 판 스무 개가 「콘텐츠 양」을 말한다 — 전투·배치 다음에 보여줄 것은 그것이다.
// bootScene 이 전 판 해금 번들을 넣어 두었으므로 restart 로 목록에 돌아가기만 하면
// 잠긴 자물쇠 없이 스무 판이 선다.
const sceneStages = page => page.evaluate(() => {
  __reseed();
  window.update = window.__update;
  restart();
  __freeze();
});
const checkStages = () => state.phase === 'stage' ? null : '스테이지 목록이 아니다: ' + state.phase;

// 원스토어 두 장
let page = await openGamePage(360, 640);
let shot = mkShot(page);
await sceneWave(page);
await page.waitForTimeout(200);
await shot('screenshot-1-wave', checkWave);
await sceneBuild(page);
await page.waitForTimeout(200);
await shot('screenshot-2-build', checkBuild);
await page.close();

// 앱인토스 세 장
page = await openGamePage(318, 524, { cloudUi: false });
shot = mkShot(page);
await sceneWave(page);
await page.waitForTimeout(200);
await shot('toss-screen-1-wave', checkWave);
await sceneBuild(page);
await page.waitForTimeout(200);
await shot('toss-screen-2-build', checkBuild);
await sceneStages(page);
await page.waitForTimeout(200);
await shot('toss-screen-3-stages', checkStages);
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

// ── 앱인토스 썸네일 1932x828 ───────────────────────────────
// 피처 그래픽과 같은 모티프인데 비율이 달라(2.33:1) 원본을 따로 둔다
// (store/thumb-toss.svg 머리 주석). JPG 도 같이 낸다 — 피처 그래픽이 PNG 용량으로
// 업로드를 거부당한 전적이 있어서다(위 주석). 토스가 PNG 를 받으면 PNG 를 쓴다.
const THUMB = readFileSync(join(ROOT, 'store', 'thumb-toss.svg'), 'utf8');
const tp = await browser.newPage({ viewport: { width: 1932, height: 828 } });
await tp.setContent(`<style>html,body{margin:0;padding:0;background:#0d1117}</style>${THUMB}`);
await tp.waitForTimeout(150);
await tp.screenshot({ path: join(OUT, 'thumb-1932x828.png') });
console.log('  thumb-1932x828.png');
await tp.screenshot({ path: join(OUT, 'thumb-1932x828.jpg'), type: 'jpeg', quality: 92 });
console.log('  thumb-1932x828.jpg');
await tp.close();

// ── 앱인토스 가로형 1504x741 ───────────────────────────────
// 세로 게임이라 가로로 찍을 화면이 없다. 대신 방금 찍은 세로 컷 셋을 썸네일과 같은
// 배경(그라데이션 + 격자) 위에 나란히 얹는다 — 게임 화면 그대로라 과장이 없고,
// 글자는 안 넣는다(store/thumb-toss.svg 머리 주석과 같은 이유).
// 액자 388x640 은 원본 636x1048 과 비율이 0.0006 차이라 slice 로 깎여도 픽셀 한 줄이다.
const b64 = f => readFileSync(join(OUT, f)).toString('base64');
const frame = (x, file) => `
  <g>
    <rect x="${x - 6}" y="44" width="400" height="652" rx="26" fill="#222b3a"/>
    <clipPath id="c${x}"><rect x="${x}" y="50" width="388" height="640" rx="20"/></clipPath>
    <image x="${x}" y="50" width="388" height="640" clip-path="url(#c${x})"
           href="data:image/png;base64,${b64(file)}" preserveAspectRatio="xMidYMid slice"/>
  </g>`;
const WIDE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1504 741" width="1504" height="741">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#1d2533"/><stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
  </defs>
  <rect width="1504" height="741" fill="url(#bg)"/>
  <g stroke="#222b3a" stroke-width="2" opacity="0.5">
    ${Array.from({ length: 16 }, (_, i) => `<path d="M${(i + 1) * 92} 0V741"/>`).join('')}
    ${Array.from({ length: 8 }, (_, i) => `<path d="M0 ${(i + 1) * 92}H1504"/>`).join('')}
  </g>
  ${frame(114, 'toss-screen-1-wave.png')}
  ${frame(558, 'toss-screen-2-build.png')}
  ${frame(1002, 'toss-screen-3-stages.png')}
</svg>`;
const wp = await browser.newPage({ viewport: { width: 1504, height: 741 } });
await wp.setContent(`<style>html,body{margin:0;padding:0;background:#0d1117}</style>${WIDE}`);
await wp.waitForTimeout(150);
await wp.screenshot({ path: join(OUT, 'toss-screen-wide.png') });
console.log('  toss-screen-wide.png');
await wp.screenshot({ path: join(OUT, 'toss-screen-wide.jpg'), type: 'jpeg', quality: 92 });
console.log('  toss-screen-wide.jpg');
await wp.close();

await browser.close();
if (bad.length) { console.error('\n어긋난 것:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`\n${OUT} 에 16장.`);
