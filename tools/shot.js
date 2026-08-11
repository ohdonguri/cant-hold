// 레이아웃 확인용 스크린샷. 헤드리스 테스트로는 그림이 깨진 걸 못 잡는다.
// playwright 가 필요하다:  npx playwright install chromium
//   node tools/shot.js [출력디렉토리] [--repeat N]
//
// --repeat N 은 같은 캡처를 N 번 돌려 컷별 md5 가 전부 같은지 본다. 흔들리면
// 어느 컷이 어떤 값들 사이를 오갔는지 찍고 exit 1 한다. 사람이 매번 손으로 N 번
// 돌려 md5 를 눈으로 맞춰 보던 걸 하네스 안으로 들여놓은 것이다 — 재현이
// 확률적이라 2런·5런으로는 두 번이나 놓쳤다(TASK-28·TASK-30). 잡으려면 10런.
// 기본값은 1 이다. 평소 `npm run shot` 은 예전과 똑같이 한 번만 돈다.
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
let REPEAT = 1;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--repeat') REPEAT = Math.max(1, parseInt(argv[++i], 10) || 1);
  else if (a.startsWith('--repeat=')) REPEAT = Math.max(1, parseInt(a.slice(9), 10) || 1);
  else rest.push(a);
}
const OUT = rest[0] || path.join(__dirname, '..', '.shots');
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
  // 컷 그룹마다 난수 스트림을 원점으로 되돌린다. 이게 없으면 한 페이지에서 열 컷이
  // 같은 LCG 를 나눠 쓰기 때문에, 앞 컷이 난수를 몇 번 뽑느냐가 뒤 컷을 통째로
  // 밀어 버린다 — 새 컷을 중간에 끼웠더니 6-fire 의 스파크 분사각이 달라진 게
  // 그 증상이다(TASK-28). 판정용(Math.random)과 연출용(fxRand) 두 스트림을 같이
  // 되돌린다. 한쪽만 되돌리면 다음 사람이 나머지를 빠뜨린다.
  window.__reseed = () => { s = 12345; fxSeed = 0x9e3779b9; };
})();`;

let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('playwright 없음.  npm i -D playwright && npx playwright install chromium'); process.exit(1); }

// 한 번의 캡처. OUT 에 컷을 쓰고 [컷이름, md5] 표와 사고 목록을 돌려준다.
// --repeat 은 이걸 N 번 부르고 표끼리 맞춰 본다.
const capture = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // 아래에서 외부 요청을 일부러 끊기 때문에 그 실패가 콘솔 에러로 올라온다. 그건
  // 하네스가 만든 소음이라 세면 안 된다 — 진짜 페이지 에러가 그 속에 묻힌다.
  // 다만 file:// 것은 반드시 남긴다. 로컬 자산이 빠진 건 진짜 사고다.
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const from = (m.location() || {}).url || '';
    if (from && !from.startsWith('file://')) return;
    errors.push(m.text());
  });

  // 이 하네스는 네트워크를 쓰지 않는다. cloudPreload() 가 requestIdleCallback 으로
  // 받아 오는 firebase SDK 는 _generateCallbackName 에서 Math.random() 을 부르는데,
  // 그 한 번이 시드 LCG 를 한 칸 민다. 그게 소환 자리 뽑기(summon) **앞**에 떨어지는지
  // 뒤에 떨어지는지는 CDN 왕복 시간에 달린 경주라, 같은 코드가 판 배치가 통째로 다른
  // 두 그림을 무작위로 번갈아 냈다 — 2-towers 가 15764302 / 621d7e94 두 값을 오간
  // 원인이 정확히 이거다. 난수를 한 번만 밀어도 뒤 컷이 전부 딸려 간다.
  // file:// 이 아닌 요청은 전부 끊는다. import() 가 거절되면 cloudInit 의 catch 가
  // 받아 삼키므로 난수는 한 칸도 안 밀린다. 덤으로 CDN 버전이 바뀌든 오프라인이든
  // 하네스가 같은 그림을 낸다.
  await page.route('**/*', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());

  const hashes = [];

  // 컷마다 "무엇이 찍혀 있어야 하는가"를 판 상태로 확인한다. 이게 없으면 진입 코드가
  // 통째로 no-op 이 돼도 스크린샷은 멀쩡히 나온다 — 실제로 2·3·4 컷이 판에 들어간 적이
  // 없어서 스테이지 선택 화면만 세 장 찍고도 오래 조용히 통과했다.
  // 확인 함수는 어긋난 이유(문자열)를 돌려주고, 멀쩡하면 null 을 돌려준다.
  const bad = [];
  const shot = async (name, check) => {
    if (check) {
      const why = await page.evaluate(check);
      if (why) bad.push(`${name}: ${why}`);
    }
    const png = await page.screenshot({ path: path.join(OUT, name + '.png') });
    hashes.push([name, crypto.createHash('md5').update(png).digest('hex')]);
  };

  await page.addInitScript(SEED_SCRIPT);
  await page.goto(URL);
  await page.waitForTimeout(300);
  await shot('1-initial', () => state.phase === 'stage' ? null : '스테이지 선택이 아니다: ' + state.phase);

  // ── 판에 들어간다 ──────────────────────────────────────────
  // 로드 직후는 phase 'stage' 라 보드도 덱도 없다. 스테이지·덱을 실제로 고르고
  // startRun 까지 밟아야 summon 이 판에 타워를 올린다. 아래 컷들은 전부 이 상태를
  // 이어받으므로, 여기서 한 번만 들어가고 컷 사이에는 필요한 것만 건드린다.
  await page.evaluate(() => {
    __reseed();
    restart();
    pickStage(0);
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    // 합성 안내(drawTutorial)는 frameNow — 실시간 프레임 수 — 로 고동친다. 켜 둔 채
    // 찍으면 대기 동안 들어온 프레임 수만큼 링 위상이 달라져서 같은 코드로 두 번
    // 돌려도 md5 가 갈린다. 판 상태와 무관한 안내라 하네스에서는 끄고 간다.
    tuteMerged = true;
    state.gold = 999999;
    for (let i = 0; i < 12; i++) summon(state.deck[i % 3]);
    state.selected = state.towers[0].id;
    window.__update = update;         // 갱신을 껐다 켜기 위한 원본 보관

    // 그림을 영구 정지시킨다. **update 를 세우는 것만으로는 안 멈춘다** —
    // frame() 은 흔들림 감쇠(decayShake)와 누수 경고(leakWarnT)를 update 밖에서,
    // 그것도 실시간 dt 로 돌린다. 그래서 update 만 세워 두면 대기 동안 들어온 실제
    // rAF 프레임 수만큼 shake.t 가 남아 보드가 통째로 몇 픽셀 밀린 채 찍히고,
    // 프레임 수는 실행마다 달라지므로 같은 코드가 다른 md5 를 낸다.
    // (kill-physical 이 5런에 세 값을 낸 원인이 정확히 이거였다. 처치 흔들림
    //  0.22초와 컷 대기 0.12초+왕복 시간이 아슬아슬하게 겹치는 자리다.)
    // 셋을 한자리에서 끄는 이유는, 한 군데서만 끄면 다음 사람이 나머지를 빠뜨리기
    // 때문이다. 정지가 필요한 컷은 전부 이걸 부른다.
    window.__freeze = () => {
      window.update = () => {};
      shake.t = 0;                    // shakeOffset() 이 {0,0} 을 돌려준다
      leakWarnT = 0;                  // drawLeakWarn() 이 즉시 빠져나간다
    };
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('2-towers', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (state.towers.length < 12) return '타워가 ' + state.towers.length + '개뿐이다';
    if (!state.selected) return '선택된 타워가 없다(사거리 원이 안 그려진다)';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 웨이브 진행 중 ─────────────────────────────────────────
  // 실시간 대기로는 몇 프레임이 들어올지 모른다 — 고정 dt 로 직접 돌려야 같은 코드가
  // 항상 같은 그림을 낸다. wave 12 + timer 0 이면 첫 스텝에서 startWave 가 13 을 연다.
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    state.selected = null;
    state.wave = 12;
    state.timer = 0;
    for (let i = 0; i < 60; i++) update(1 / 30);   // 웨이브 시작 후 2초 지점
    __freeze();
  });
  await page.waitForTimeout(120);
  await shot('3-wave', () => {
    if (state.phase !== 'wave') return '웨이브 중이 아니다: ' + state.phase;
    if (!state.enemies.length) return '화면에 적이 없다';
    return null;
  });

  await page.evaluate(() => { __reseed(); openChoice(state.towers[0], 3); });
  await page.waitForTimeout(120);
  await shot('4-choice', () => {
    // render 는 'stage'·'deck' 에서 곧바로 빠져나가므로 state.choice 만 봐서는
    // 모달이 그려졌다고 말할 수 없다. 판 위에 있는지부터 확인한다.
    if (state.phase === 'stage' || state.phase === 'deck') return '판이 아니라 ' + state.phase + ' 화면이다';
    if (!state.choice) return '분기 모달이 안 떴다';
    if (state.choice.options.length !== 2) return '선택지가 ' + state.choice.options.length + '개다';
    return null;
  });

  await page.evaluate(() => { __reseed(); applyChoice('A'); state.phase = 'over'; });
  await page.waitForTimeout(120);
  await shot('5-over', () => {
    if (state.phase !== 'over') return '게임 오버 화면이 아니다: ' + state.phase;
    if (state.choice) return '분기 모달이 안 닫혔다';
    return null;
  });

  // ── 처치 연출 고정 프레임 ──────────────────────────────────
  // 판을 새로 깔고, 적 하나를 보드 한복판에 세워 원하는 딜 타입으로 죽인다.
  // state.paused 는 쓰면 안 된다 — drawPause() 가 화면을 95% 불투명으로 덮는다.
  await page.evaluate(() => {
    // window.__update 는 앞 컷(2-towers)이 원본을 잡아 뒀다. 여기서 다시 잡으면
    // 앞 컷이 세워 둔 스텁을 "원본"으로 저장해 버려서 이후 컷이 전부 정지한다.
    __reseed();
    window.update = window.__update;
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
  });

  // steps 는 처치 후 몇 프레임 지난 그림을 찍을지다. 기본 4(수명 0.3 의 40% 지점)는
  // 파편이 흩어진 자리인데, 잔상은 수명이 0.18 이라 그 지점에서 이미 알파 0.26 이라
  // 눈으로 못 본다. 잔상 컷만 1프레임(알파 0.81)으로 따로 찍는다.
  const killShot = async (name, kind, type, frozen, steps = 4) => {
    await page.evaluate(({ kind, type, frozen, steps }) => {
      __reseed();
      window.update = window.__update;
      resetParticles();
      resetCorpses();
      state.enemies.length = 0;
      state.beams.length = 0;
      spawnEnemy(kind);
      const e = state.enemies[0];
      e.x = 3; e.y = 6;               // 보드 한복판의 통로. 타워에 안 가린다
      if (frozen) e.frozen = 1;       // 빙결이 딜 타입보다 우선한다
      killEnemy(e, state.towers[0], type);
      // 파편은 수명(0.3초) 40% 지점이 흩어졌고 아직 안 사라진 자리다.
      for (let i = 0; i < steps; i++) update(1 / 30);
      __freeze();                     // 여기서 그림이 영구 정지한다
    }, { kind, type, frozen, steps });
    await page.waitForTimeout(120);   // rAF 가 정지된 그림을 한 번 그릴 시간
    await shot(name, () => {
      if (state.phase !== 'wave') return '웨이브가 끝나 버렸다: ' + state.phase;
      if (state.enemies.length) return '적이 안 죽었다';
      return null;
    });
  };

  await killShot('kill-physical', 'elite', 'physical', false);
  await killShot('kill-magic', 'elite', 'magic', false);
  await killShot('kill-frozen', 'elite', 'magic', true);

  // ── 발사 3박자 고정 프레임 ──────────────────────────────────
  // 세 박자의 수명이 다 다르다(화염 0.07 / 빔 0.09 / 스파크 0.20). 발사 직후
  // update 를 딱 한 번 돌린 프레임이 셋이 동시에 살아 있는 유일한 지점이다 —
  // 화염 0.037 · 빔 0.057 · 스파크 0.167 이 남는다. 두 번 돌리면 화염이
  // 0.003 만 남아서(알파 0.05) 사실상 안 찍힌다.
  // 표적은 안 죽여야 한다. 처치 파편이 같은 자리에 겹치면 무엇이 여파인지 못 가른다.
  const fireShot = async (name) => {
    await page.evaluate(() => {
      __reseed();
      window.update = window.__update;
      resetParticles();
      // 잔상도 같이 비운다. 앞 컷(kill-squash)의 잔상은 수명이 아직 남아 있어서,
      // 안 비우면 착탄 지점 옆에 죽은 적 실루엣이 같이 찍힌다 — 파편을 비우는 것과
      // 정확히 같은 이유다(무엇이 여파인지 못 가른다).
      resetCorpses();
      state.enemies.length = 0;
      state.beams.length = 0;
      // 이 프레임에는 딱 한 발만 나가게 한다. 여러 타워가 같이 쏘면 빔이 겹쳐서
      // 어느 화염이 어느 선의 뿌리인지가 안 읽힌다.
      for (const t of state.towers) { t.cd = 99; t.flash = 0; }
      const t = state.towers.find(v => v.kind === 'marksman');   // 사거리가 가장 길다
      t.cd = 0;

      // 사거리 안의 경로 칸 중 가장 먼 칸. 빔이 길게 누워서 2겹이 보인다.
      const c = towerCenter(t), R = towerRange(t);
      let spot = null, far = -1;
      for (let y = 0; y < CFG.BOARD_H; y++)
        for (let x = 0; x < CFG.BOARD_W; x++) {
          if (!isPath(x, y)) continue;
          const d = Math.max(Math.abs(x + 0.5 - c.x), Math.abs(y + 0.5 - c.y));
          if (d > R || d <= far) continue;
          far = d; spot = { x, y };
        }

      spawnEnemy('elite');            // 몸집이 커야 착탄면과 여파가 갈려 보인다
      const e = state.enemies[0];
      e.maxHp = e.hp = 1e9;           // 안 죽어야 처치 파편이 안 섞인다
      e.x = spot.x; e.y = spot.y;
      fireTower(t, 1 / 30);
      update(1 / 30);
      // update 안의 updateEnemies 가 적을 자기 레인 위치로 되돌려 놓는다. 그러면
      // 착탄점(스파크)과 적이 따로 떨어져서 여파로 안 읽힌다 — 다시 세워 준다.
      e.x = spot.x; e.y = spot.y;
      __freeze();                     // 여기서 그림이 영구 정지한다
    });
    await page.waitForTimeout(120);
    await shot(name, () => state.beams.length ? null : '빔이 안 나갔다');
  };

  await fireShot('6-fire');

  // 처치 잔상(squash) 전용 컷. **자리가 6-fire 뒤인 것이 중요하다** — 처치는 연출용
  // 난수(fxRand)를 한 번 더 밀어서, 앞에 두면 6-fire 의 스파크 분사각이 통째로
  // 달라진다. 앞 세 컷(kill-*)은 파편이 흩어진 지점이라 잔상이 이미 거의 투명하므로
  // 1프레임(알파 0.81) 지점을 따로 찍는다.
  // 여기서 볼 것은 하나다 — **적 실루엣이 가로로 퍼지고 세로로 눌린 채 남아 있는가.**
  await killShot('kill-squash', 'elite', 'physical', false, 1);
  // 상태로도 확인한다. 잔상이 이미 걷힌 뒤라면 이 컷은 파편만 찍힌 컷과 구별이 안 된다.
  {
    const why = await page.evaluate(() => {
      if (aliveCorpses() !== 1) return '잔상이 ' + aliveCorpses() + '개다';
      const s = corpseScale(state.corpses.find(c => c.alive));
      if (!(s.sx > 1 && s.sy < 1)) return `squash 가 안 걸렸다: sx ${s.sx} sy ${s.sy}`;
      if (s.alpha < 0.5) return '알파가 ' + s.alpha.toFixed(2) + ' 라 눈으로 못 본다';
      return null;
    });
    if (why) bad.push('kill-squash: ' + why);
  }

  // ── 화면 흔들림 고정 프레임 ──────────────────────────────────
  // 흔들림은 0.22초짜리다. shot.js 는 window.update 만 덮고 frame() 은 계속 돌리는데,
  // 감쇠(decayShake)는 update 가 아니라 frame 이 도므로 다른 컷에서는 반드시
  // 0 이 된 프레임이 찍힌다. 그래서 update 를 "매 프레임 최대 진폭으로 흔들림을
  // 되살리는" 스텁으로 덮는다 — 이게 없으면 흔들림을 눈으로 확인할 방법이 없다.
  //
  // 이 컷에서 볼 것은 하나다: **보드만 밀리고 상단 HUD·하단 버튼은 제자리인가.**
  // 흔들림 변환은 보드 클립보다 앞에 들어가므로 창째로 움직인다. 보드는 원래
  // 화면 중앙에 정렬되므로(resize), 좌우 여백이 비대칭이면 그게 곧 밀린 증거다.
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    pickStage(0);
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    state.gold = 99999;
    for (let i = 0; i < 12; i++) summon(state.deck[i % 3]);
    state.selected = null;
    setShakeEnabled(true);
    // 정예 처치 등급(가장 센 값)으로 되살린다. 감쇠가 프레임 앞에서 돌기 때문에
    // 여기서 t 를 dur 로 되돌리면 render 는 항상 최대 진폭 지점을 본다.
    window.update = () => { shake.amp = KILL_SHAKE_AMP; shake.dur = KILL_SHAKE_DUR; shake.t = KILL_SHAKE_DUR; };
  });
  await page.waitForTimeout(120);
  await shot('7-shake', () => {
    const o = shakeOffset();
    if (!o.x && !o.y) return '보드가 안 밀렸다(흔들림 0)';
    return null;
  });

  // ── 2x2 배치 모드 ──────────────────────────────────────────
  // **맨 뒤에 둔다.** 중간에 끼우면 여기서 뽑는 난수만큼 뒤 컷의 fxRand 가 밀려서
  // 아무 관계 없는 컷의 md5 가 통째로 갈린다.
  //
  // 이 컷에서 볼 것은 하나다: **후보 칸과 보드가 딤에 안 묻히는가.** 소환 피커의
  // 0.78 을 그대로 쓰면 골라야 할 대상이 통째로 사라진다 — 헤드리스는 알파를 못 보므로
  // 이건 눈으로만 잡힌다.
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    pickStage(1);                     // 2스테이지: 좋은 자리가 명확히 갈리는 판
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    // 4성 둘을 손으로 세운다. 합성으로 올리면 분기 모달이 끼어든다.
    let id = 5000;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    put('marksman', 4, 1, 8);
    put('marksman', 4, 3, 8);
    // 4 개까지만 채운다. 더 채우면 2x2 후보가 한두 곳으로 줄어서
    // "후보 칸이 딤에 묻히는가" 를 볼 수 있는 화면이 아니게 된다.
    for (let i = 0; i < 4; i++) summon('frost');
    state.gold = 99999;               // 소환값이 나간 뒤에 맞춘다 — 컷 판정이 "커밋 전 골드 불변" 이다
    const [a, b] = state.towers;
    beginMergePlace(a, b);
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('8-mergeplace', () => {
    const m = mergePlaceState();
    if (!m.open) return '배치 모드가 안 열렸다';
    if (!m.spots.length) return '후보 칸이 없다';
    if (!m.sel) return '기본 선택 자리가 없다';
    if (state.gold !== 99999) return '아직 커밋 전인데 골드가 나갔다: ' + state.gold;
    return null;
  });

  await page.close();
  return { hashes, errors, bad };
};

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const runs = [];
  for (let i = 0; i < REPEAT; i++) {
    const r = await capture(browser);
    runs.push(r);
    if (REPEAT > 1) console.log(`run ${i + 1}/${REPEAT}: ` + r.hashes.map(([n, h]) => `${n}=${h.slice(0, 8)}`).join(' '));
  }
  await browser.close();

  const errors = runs.flatMap(r => r.errors);
  const bad = runs.flatMap(r => r.bad);
  console.log(errors.length ? '페이지 에러:\n' + errors.join('\n') : '페이지 에러 없음 — ' + OUT);

  // 런끼리 컷별 md5 를 맞춰 본다. 컷 이름을 키로 모으므로, 어느 런에서 컷이
  // 통째로 빠져도(진입 코드가 no-op 이 되면 그럴 수 있다) 값 개수로 드러난다.
  const flaky = [];
  if (REPEAT > 1) {
    const names = runs[0].hashes.map(([n]) => n);
    for (const n of names) {
      const vals = new Set(runs.map(r => (r.hashes.find(([m]) => m === n) || [, '(없음)'])[1]));
      if (vals.size > 1) flaky.push(`${n}: ${[...vals].map(v => v.slice(0, 8)).join(' / ')}`);
    }
    console.log(flaky.length ? '' : `${REPEAT}런 전 컷 md5 동일`);
  }

  if (bad.length) console.error('컷이 의도한 화면이 아니다:\n  ' + bad.join('\n  '));
  if (flaky.length) console.error(`${REPEAT}런에서 md5 가 갈린 컷:\n  ` + flaky.join('\n  '));
  if (bad.length || flaky.length) process.exit(1);
})();
