// 레이아웃 확인용 스크린샷. 헤드리스 테스트로는 그림이 깨진 걸 못 잡는다.
// playwright 가 필요하다:  npx playwright install chromium
//   node tools/shot.js [출력디렉토리]
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', '.shots');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.error('playwright 없음.  npm i -D playwright && npx playwright install chromium'); process.exit(1); }

  require('fs').mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });

  await page.goto(URL);
  await page.waitForTimeout(300);
  await shot('1-initial');

  await page.evaluate(() => {
    state.gold = 999999;
    for (let i = 0; i < 12; i++) summon();
    state.selected = state.towers[0].id;
  });
  await page.waitForTimeout(200);
  await shot('2-towers');

  await page.evaluate(() => { state.selected = null; state.timer = 0.05; state.wave = 13; });
  await page.waitForTimeout(2500);
  await shot('3-wave');

  await page.evaluate(() => { openChoice(state.towers[0], 3); });
  await page.waitForTimeout(200);
  await shot('4-choice');

  await page.evaluate(() => { applyChoice('A'); state.phase = 'over'; });
  await page.waitForTimeout(200);
  await shot('5-over');

  await browser.close();
  console.log(errors.length ? '페이지 에러:\n' + errors.join('\n') : '페이지 에러 없음 — ' + OUT);
})();
