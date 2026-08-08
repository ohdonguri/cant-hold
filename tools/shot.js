// 레이아웃 확인용 스크린샷. 헤드리스 테스트로는 그림이 깨진 걸 못 잡는다.
// playwright 가 필요하다:  npx playwright install chromium
//   node tools/shot.js [출력디렉토리]
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', '.shots');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

// 처치 연출은 0.3초짜리라 waitForTimeout 으로는 절대 못 잡는다. 난수를 시드로
// 고정하고(verify-build.mjs 와 같은 스크립트) 프레임 시각도 가상 시계로 묶은 뒤,
// 원하는 시점에서 update 를 통째로 끊어 그 프레임을 영구 정지시킨다.
// 갱신이 멈춰도 rAF 는 계속 같은 그림을 그리므로 스크린샷이 반드시 잡는다.
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
})();`;

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

  await page.addInitScript(SEED_SCRIPT);
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

  // ── 처치 연출 고정 프레임 ──────────────────────────────────
  // 판을 새로 깔고, 적 하나를 보드 한복판에 세워 원하는 딜 타입으로 죽인다.
  // state.paused 는 쓰면 안 된다 — drawPause() 가 화면을 95% 불투명으로 덮는다.
  await page.evaluate(() => {
    restart();
    pickStage(0);
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    state.gold = 99999;
    for (let i = 0; i < 12; i++) summon(state.deck[i % 3]);
    state.wave = 9;
    state.phase = 'wave';
    // 큐를 통째로 비우면 죽인 순간 웨이브가 끝나 버려서(update 안의 종료 판정)
    // 준비 단계 화면이 대신 찍힌다. 안 올 적 하나를 남겨 웨이브를 붙잡아 둔다.
    state.spawnQueue = [{ kind: 'grunt', at: 9999 }];
    window.__update = update;         // 갱신을 껐다 켜기 위한 원본 보관
  });

  const killShot = async (name, kind, type, frozen) => {
    await page.evaluate(({ kind, type, frozen }) => {
      window.update = window.__update;
      resetParticles();
      state.enemies.length = 0;
      state.beams.length = 0;
      spawnEnemy(kind);
      const e = state.enemies[0];
      e.x = 3; e.y = 6;               // 보드 한복판의 통로. 타워에 안 가린다
      if (frozen) e.frozen = 1;       // 빙결이 딜 타입보다 우선한다
      killEnemy(e, state.towers[0], type);
      // 수명(0.3초) 40% 지점. 파편이 흩어졌고 아직 안 사라진 자리다.
      for (let i = 0; i < 4; i++) update(1 / 30);
      window.update = () => {};       // 여기서 그림이 영구 정지한다
    }, { kind, type, frozen });
    await page.waitForTimeout(120);   // rAF 가 정지된 그림을 한 번 그릴 시간
    await shot(name);
  };

  await killShot('kill-physical', 'elite', 'physical', false);
  await killShot('kill-magic', 'elite', 'magic', false);
  await killShot('kill-frozen', 'elite', 'magic', true);

  await browser.close();
  console.log(errors.length ? '페이지 에러:\n' + errors.join('\n') : '페이지 에러 없음 — ' + OUT);
})();
