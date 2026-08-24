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
    // **pickStage 는 잠긴 판을 거절한다**(index.html: `i >= unlocked` 면 토스트만
    // 내고 되돌아간다). SEED_SCRIPT 가 localStorage 를 비우고 시작하므로 unlocked
    // 는 1 이고, 이 줄이 없으면 아래 pickStage(1) 이 통째로 no-op 이라 「2스테이지」
    // 라고 적어 둔 컷이 사실은 1스테이지를 찍는다. 오래 그 상태였다.
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
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

  // ── 넓은 보드 (⑤ 분수령 9x14) ──────────────────────────────
  // **8-mergeplace 와 같은 이유로 맨 뒤에 둔다.** 앞에 끼우면 여기서 뽑는 난수만큼
  // 뒤 컷의 fxRand 가 밀려 md5 가 통째로 갈린다.
  //
  // 이 컷에서 볼 것은 넷이다. 전부 셀이 52.9px → 41.1px 로 줄어서 생기는 문제라
  // 헤드리스로는 하나도 안 잡힌다.
  //   ① ★배지(round(cell*0.26) = 10.7px)가 셀 밖으로 안 나가고 스프라이트와 안 겹치는가
  //   ② 잠긴 구역 안내(고정 12px — 셀에 안 따라 줄어든다)가 안 잘리는가
  //   ③ 5성 2x2(82px)가 보드 안에 들어가는가
  //   ④ 9열이 화면 폭에 들어가는가 (가로가 병목이다 — 세로는 594/14 로 남는다)
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    // **인덱스를 못 박는다.** `STAGES.length - 1` 로 두면 판이 하나 붙는 순간 이 컷이
    // ⑤ 가 아니라 새 판을 찍는다 — 컷 이름이 가리키는 판이 통째로 옮겨 가는 것은
    // #33 의 S4 래칫과 같은 실패모드다. 아래 확인 함수가 9x14 와 `state.stage` 를
    // 직접 보므로 판이 또 늘어도 여기서 조용히 안 밀린다.
    pickStage(4);                     // ⑤ 분수령 (9x14)
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    // 성급을 손으로 깔아 ★배지를 1~5성까지 한 화면에 올린다. 합성으로 올리면
    // 분기 모달이 끼어들고, 소환은 성급을 못 고른다.
    let id = 7000;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 개방 행은 6~13. 행 10 과 열 0·8 은 경로라 비워 둔다.
    put('marksman', 5, 2, 6);         // 2x2. 열 2~3 x 행 6~7
    put('shredder', 4, 5, 6);
    put('frost',    3, 6, 6);
    put('shredder', 2, 5, 7);
    put('frost',    1, 6, 7);
    put('marksman', 4, 1, 8);
    put('shredder', 3, 2, 8);
    put('frost',    2, 3, 8);
    put('marksman', 1, 5, 8);
    put('shredder', 5, 6, 8);         // 2x2. 열 6~7 x 행 8~9
    put('frost',    3, 1, 11);
    put('marksman', 2, 6, 11);
    state.selected = null;
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('9-wideboard', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (CFG.BOARD_W !== 9 || CFG.BOARD_H !== 14)
      return '9x14 가 아니다: ' + CFG.BOARD_W + 'x' + CFG.BOARD_H;
    if (state.stage !== 4) return '⑤ 분수령이 아니다: ' + state.stage;
    // 잠긴 행이 남아 있어야 안내가 그려진다
    if (state.openRows >= CFG.BOARD_H) return '잠긴 행이 없다: openRows ' + state.openRows;
    if (!state.towers.some(t => t.star >= 5)) return '5성(2x2)이 없다';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 10열 보드 (⑥ 합수 10x14) ────────────────────────────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다(앞에 끼우면 뒤 컷의 난수가 밀린다).
  //
  // 이 컷에서 볼 것은 셋이고 전부 셀이 37.0px 로 줄어서 생기는 문제다. 9x14(41.1px)
  // 보다 한 칸 더 좁아진 **이 게임에서 가장 작은 셀**이라 여기가 진짜 하한이다.
  //   ① 10열이 화면 폭에 들어가는가 (가로가 병목이다 — 세로는 594/14 로 남는다)
  //   ② ★배지(round(cell*0.26) = 9.6px)가 셀 밖으로 안 나가고 스프라이트와 안 겹치는가
  //   ③ 두 갈래가 서로 구분되게 그려지고, 아래 합수 지점이 한 곳으로 읽히는가
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    // **인덱스를 못 박지 않는다.** 10열 판을 성질로 찾는다 — 판이 또 붙어도 안 밀린다.
    // **[#62] 레인 수까지 본다.** ⑩ 세물머리가 붙으면서 10열 판이 둘이 됐다.
    // `w === 10` 만으로는 배열 순서에 기대는 셈이라(앞의 것을 집는다) 아래 확인
    // 함수의 「2레인이 아니다」가 순서에 딸린 값이 된다 — 아래 15-trimerge 가 그
    // 짝이고, 둘이 같은 성질로 갈려야 어느 쪽이 밀려도 조용히 안 바뀐다.
    pickStage(STAGES.findIndex(s => s.w === 10 && s.lanes.length === 2));
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    let id = 7800;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 개방 행은 6~13. 두 갈래(왼쪽 x0 기둥 · 오른쪽 x9 기둥)와 합수 지점을 피한다.
    put('marksman', 5, 2, 6);         // 2x2. 열 2~3 x 행 6~7
    put('shredder', 4, 6, 6);
    put('frost',    3, 7, 7);
    put('shredder', 2, 6, 8);
    put('marksman', 1, 2, 9);
    put('frost',    2, 7, 9);
    state.selected = null;
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('11-tenwide', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (CFG.BOARD_W !== 10 || CFG.BOARD_H !== 14)
      return '10x14 가 아니다: ' + CFG.BOARD_W + 'x' + CFG.BOARD_H;
    if (lanes.length !== 2) return '2레인이 아니다: ' + lanes.length;
    // 10열이 폭 안에 들어가는가. 셀 왼쪽 모서리 + 한 칸이 캔버스 안이라야 한다.
    if (cellToPx(CFG.BOARD_W - 1, 0).x + view.cell > view.w)
      return '보드가 화면 밖으로 나간다: cell ' + view.cell.toFixed(1);
    if (state.openRows >= CFG.BOARD_H) return '잠긴 행이 없다: openRows ' + state.openRows;
    if (!state.towers.some(t => t.star >= 5)) return '5성(2x2)이 없다';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 제약 판의 덱 화면 (#54) ─────────────────────────────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다(앞에 끼우면 뒤 컷의 fxRand 가 밀려
  // md5 가 통째로 갈린다).
  //
  // **이 화면은 지금까지 한 번도 안 찍혔다.** `allowKinds` 기계는 #50 에 들어왔지만
  // 그걸 쓰는 판이 없어서 회색 카드도 안내 줄도 실물로는 안 그려졌다. 여기서 볼 것은
  // 헤드리스가 못 보는 것들이다:
  //   ① 금지 카드 셋이 회색으로 죽고 「이 판 금지」가 카드마다 붙는가
  //   ② 안내 줄(「박격포를 반드시 쓰는 판이다 …」)이 카드와 안 겹치고 안 잘리는가
  //   ③ 허용 카드 넷은 평소대로 사거리까지 그려지는가
  //   ④ 정원(3종)이 안 찼을 때 시작 버튼이 죽어 있는가
  //
  // `npm test` 의 「덱 제약」 블록이 이 셋을 전부 상태로 잠그고 있지만, 상태가
  // 맞으면서 그림이 깨지는 것이 정확히 이 리포가 세 번 데인 자리다.
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    // **인덱스를 못 박는다.** 제약이 걸린 첫 판을 성질로 찾는다 — 판이 앞뒤로
    // 늘어도 이 컷이 조용히 다른 판을 찍지 않는다(#33 의 S4 래칫과 같은 실패모드).
    pickStage(STAGES.findIndex(s => s.allowKinds));
    // 한 장만 골라 둔다. 0장이면 안내가 안 뜬 화면과 구분이 안 되고, 3장을 채우면
    // 시작 버튼이 살아나 ④ 를 못 본다.
    toggleDeckPick('shredder');
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('12-forceddeck', () => {
    if (state.phase !== 'deck') return '덱 화면이 아니다: ' + state.phase;
    const def = STAGES[state.stage];
    if (!def.allowKinds) return '제약 판이 아니다: ' + def.name;
    // 카드는 7장 그대로여야 한다. 금지 종류를 빼 버리면 「왜 못 고르는가」가 안 읽힌다.
    if (deckCardRects().length !== KIND_KEYS.length)
      return '카드가 7장이 아니다: ' + deckCardRects().length;
    if (!deckLimitNote()) return '안내 줄이 비었다';
    if (state.deckPick.length !== 1) return '한 장만 고른 상태가 아니다: ' + state.deckPick.length;
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 9x12 보드 (강제 판 · #54) ───────────────────────────────
  // **맨 뒤에 둔다** — 위와 같은 이유다.
  //
  // 이 게임에서 **처음 나오는 h = 12** 다. 폭 9 는 ⑤ 분수령과 같아 셀도 41.1px 로
  // 같지만, 세로가 14 → 12 로 줄면서 보드가 위아래로 남는다. 여기서 볼 것은 둘이다:
  //   ① 보드가 세로로 가운데 정렬되어 상단 HUD·하단 버튼과 안 겹치는가
  //   ② 개방 행이 8 이라 잠긴 행이 4 줄뿐인데 안내가 그 위에 제대로 얹히는가
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    // 9x12 는 이 판뿐이다. **성질로 찾는다** — 인덱스를 박으면 판이 밀릴 때 조용히 어긋난다.
    pickStage(STAGES.findIndex(s => s.h === 12));
    // 이 판은 박격포를 강제한다. 덱은 허용 목록에서 고른다 — 박아 두면 목록이
    // 바뀌었을 때 startRun 이 조용히 거절하고 컷이 덱 화면으로 남는다.
    const allow = allowedKinds();
    [allow.find(k => KINDS[k].group === 'attack'), 'shredder', 'frost']
      .forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    let id = 8600;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 개방 행은 4~11. 경로(행 7 의 x4~8 · 행 10 의 x1~8)를 피한다.
    put('mortar',   5, 1, 4);         // 2x2. 열 1~2 x 행 4~5
    put('shredder', 4, 5, 4);
    put('frost',    3, 6, 5);
    put('shredder', 2, 1, 6);
    put('mortar',   1, 6, 6);
    put('frost',    2, 0, 8);
    put('mortar',   3, 6, 8);
    put('shredder', 5, 1, 8);         // 2x2. 열 1~2 x 행 8~9
    state.selected = null;
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('13-knot', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (CFG.BOARD_W !== 9 || CFG.BOARD_H !== 12)
      return '9x12 가 아니다: ' + CFG.BOARD_W + 'x' + CFG.BOARD_H;
    if (!STAGES[state.stage].allowKinds) return '제약 판이 아니다';
    if (lanes.length !== 2) return '2레인이 아니다: ' + lanes.length;
    if (state.openRows >= CFG.BOARD_H) return '잠긴 행이 없다: openRows ' + state.openRows;
    if (!state.towers.some(t => t.star >= 5)) return '5성(2x2)이 없다';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 덱이 유일한 판의 덱 화면 (#56) ──────────────────────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다(앞에 끼우면 뒤 컷의 fxRand 가 밀려
  // md5 가 통째로 갈린다).
  //
  // 12-forceddeck 과 **같은 화면이 아니다.** 저기는 허용 4종이라 회색 카드가 셋이고,
  // 여기는 허용 3종이라 **넷**이다. 그러면서 안내 줄이 금지 종류를 전부 세므로
  // 문구가 한 종류만큼 길어진다(「… 침식자 · 박격포 · 마력로 · 조폐소는 못 고른다」).
  // 그 줄은 `fitText` 가 폭에 맞춰 글자를 줄이다 하한 9px 에서 말줄임으로 넘어가는데,
  // **어디서 잘렸는지는 헤드리스가 못 본다** — `npm test` 는 `deckLimitNote()` 문자열이
  // 그려졌는지만 보고, 말줄임이 되면 그 단언이 빨간불이 되지만 「줄었지만 안 잘린」
  // 상태(글자가 9px 로 뭉개짐)는 통과한다. 여기서 볼 것이 그것이다:
  //   ① 안내 줄이 안 잘리고 읽히는가 (셋일 때보다 확실히 작아진다)
  //   ② 회색 카드가 **넷**이고 「이 판 금지」가 넷 다 붙는가
  //   ③ 남은 석 장이 곧 덱 전부라 「고르는 화면」이 아니라 「받는 화면」으로 읽히는가
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    // **인덱스를 못 박는다.** 허용이 정확히 `DECK_SIZE` 인 판을 성질로 찾는다 —
    // 그게 곧 「덱이 유일한 판」이고, 판이 앞뒤로 늘어도 이 컷이 안 밀린다.
    pickStage(STAGES.findIndex(s => s.allowKinds && s.allowKinds.length === CFG.DECK_SIZE));
    // 한 장만 골라 둔다. 12-forceddeck 과 같은 이유다 — 0장이면 안내가 안 뜬 화면과
    // 구분이 안 되고, 정원을 채우면 시작 버튼이 살아나 「덜 골랐다」 상태를 못 본다.
    toggleDeckPick(allowedKinds()[0]);
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('14-uniquedeck', () => {
    if (state.phase !== 'deck') return '덱 화면이 아니다: ' + state.phase;
    const def = STAGES[state.stage];
    if (!def.allowKinds) return '제약 판이 아니다: ' + def.name;
    if (def.allowKinds.length !== CFG.DECK_SIZE)
      return '허용이 ' + def.allowKinds.length + '종이다 (덱이 유일한 판이 아니다)';
    if (deckCardRects().length !== KIND_KEYS.length)
      return '카드가 7장이 아니다: ' + deckCardRects().length;
    // 금지 종류가 넷이라야 이 컷이 12-forceddeck 과 다른 것을 본다.
    const blocked = KIND_KEYS.filter(k => !kindAllowed(k));
    if (blocked.length !== KIND_KEYS.length - CFG.DECK_SIZE)
      return '금지 종류가 ' + blocked.length + '종이다';
    if (!deckLimitNote()) return '안내 줄이 비었다';
    if (state.deckPick.length !== 1) return '한 장만 고른 상태가 아니다: ' + state.deckPick.length;
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 3레인 보드 (⑩ 세물머리 10x14) ─────────────────────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다(앞에 끼우면 뒤 컷의 fxRand 가 밀려
  // md5 가 통째로 갈린다).
  //
  // **이 게임에서 레인이 셋인 판은 이것뿐이다.** 11-tenwide 와 셀 크기(37.0px)는
  // 같고 그림이 다르다. 헤드리스가 못 보는 것이 여기 셋이다:
  //   ① 세 갈래가 서로 구분되게 그려지는가 — 두 갈래를 견주던 눈이 셋에서도 되는가
  //   ② `(4,10)` 합류 지점이 **한 곳으로** 읽히는가 (셋이 한 칸에 겹쳐 들어온다)
  //   ③ 입구가 세 변(왼·위·오른)에 하나씩 붙는데 세 갈래가 각자 제 변에서 들어오는
  //      것으로 읽히는가 — 관문(출구)은 반대로 **한 곳뿐**이라, 「셋이 들어와 하나로
  //      나간다」가 그림 하나에 같이 보여야 한다
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    // **인덱스를 못 박는다.** 3레인 판을 성질로 찾는다 — 판이 앞뒤로 늘어도 안 밀린다.
    pickStage(STAGES.findIndex(s => s.lanes.length === 3));
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    let id = 9400;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 개방 행은 6~13. 세 갈래와 합류 꼬리(행 10 의 x0~7 · 행 13 의 x0~3)를 피한다.
    put('marksman', 5, 1, 7);         // 2x2. 열 1~2 x 행 7~8
    put('shredder', 4, 4, 6);
    put('frost',    3, 5, 6);
    put('shredder', 2, 7, 6);
    put('frost',    1, 8, 6);
    put('marksman', 4, 8, 9);
    put('shredder', 3, 9, 9);
    put('frost',    2, 1, 11);
    put('marksman', 1, 2, 12);
    put('shredder', 5, 6, 11);        // 2x2. 열 6~7 x 행 11~12
    state.selected = null;
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('15-trimerge', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (CFG.BOARD_W !== 10 || CFG.BOARD_H !== 14)
      return '10x14 가 아니다: ' + CFG.BOARD_W + 'x' + CFG.BOARD_H;
    if (lanes.length !== 3) return '3레인이 아니다: ' + lanes.length;
    // 35덱 판이라야 한다. 제약이 붙으면 위 덱 세 장이 조용히 거절돼 덱 화면에 남는다.
    if (STAGES[state.stage].allowKinds) return '제약 판이다: ' + STAGES[state.stage].name;
    // 합류가 실제로 있는가. 세 레인의 출구가 한 칸이라야 「셋이 하나로」가 그림이 된다.
    const exits = new Set(lanes.map(L => {
      const p = L.points[L.points.length - 1];
      return p.x + ',' + p.y;
    }));
    if (exits.size !== 1) return '출구가 ' + exits.size + '곳이다 (합류가 없다)';
    if (state.openRows >= CFG.BOARD_H) return '잠긴 행이 없다: openRows ' + state.openRows;
    if (!state.towers.some(t => t.star >= 5)) return '5성(2x2)이 없다';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 방사형 소환 · 가운데 칸 (#68) ──────────────────────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다(앞에 끼우면 뒤 컷의 fxRand 가 밀려
  // md5 가 통째로 갈린다).
  //
  // 카드 석 장이 사라지고 아이콘 셋이 칸 둘레로 올라온 화면이다. 헤드리스는
  // 좌표만 보고 **읽히는가는 못 본다.** 이 컷에서 볼 것이 그것이다.
  //   ① 아이콘 셋이 10시·12시·2시로 읽히는가 — 세 개가 「부채꼴」로 보여야 한다
  //   ② 지름 48px 원 안에서 스프라이트와 비용(10px)이 서로 안 뭉개지는가
  //   ③ 길게 누른 하나의 사거리 사각형이 딤(0.78) 위에서 읽히는가
  //   ④ 안내 두 줄이 칸 아래에 들어가고 아이콘과 안 겹치는가
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    pickStage(0);
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    for (let i = 0; i < 6; i++) summon(state.deck[i % 3]);
    state.selected = null;
    // 보드 한가운데 근처의 빈 칸. 가장자리 컷(아래)과 갈리는 자리라 **가운데라야** 한다.
    const occ = occupancy();
    const mx = CFG.BOARD_W >> 1, my = (firstOpenRow() + CFG.BOARD_H) >> 1;
    let best = null, bestD = Infinity;
    for (let y = firstOpenRow(); y < CFG.BOARD_H; y++)
      for (let x = 0; x < CFG.BOARD_W; x++) {
        if (!canPlace(x, y, 1, occ)) continue;
        const d = Math.abs(x - mx) + Math.abs(y - my);
        if (d < bestD) { bestD = d; best = { gx: x, gy: y }; }
      }
    state.picker = { mode: 'summon', gx: best.gx, gy: best.gy, press: null };
    // 12시 아이콘을 길게 누른 상태로 얼린다. `pickerHold` 는 frame() 이 계속 감지만
    // 문턱을 넘은 뒤로는 그림이 안 바뀐다(불리언 하나만 본다) — 그래서 정지가 유효하다.
    const ic = pickerLayout().icons[1];
    pickerPressDown(ic.cx, ic.cy);
    pickerHold(PICK_HOLD + 0.01);
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('16-summonfan', () => {
    const s = pickerState();
    if (!s.open) return '소환 부채꼴이 안 열렸다';
    const L = pickerLayout();
    if (L.icons.length !== CFG.DECK_SIZE) return '아이콘이 ' + L.icons.length + '개다';
    const p = cellToPx(s.gx, s.gy);
    const cy = p.y + view.cell / 2;
    if (!L.icons.every(ic => ic.cy < cy)) return '부채꼴이 위쪽이 아니다 (가운데 칸인데 돌았다)';
    if (!s.peek) return '길게 누른 상태가 아니다 (사거리가 안 그려진다)';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 방사형 소환 · 가장자리 칸 (⑩ 세물머리 0열 · #68) ────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다.
  //
  // **이 티켓의 진짜 일이 이 컷이다.** 10열 판의 0열 칸은 중심이 보드 왼쪽 끝에서
  // `cell/2 = 18.5px` 밖에 안 떨어져 있어서, 돌리지 않으면 10시 아이콘이 화면 밖으로
  // 50px 나간다. `npm test` 는 좌표가 화면 안인지까지만 보고 **그림이 어떻게 읽히는지
  // 못 본다.** 여기서 볼 것이 그것이다.
  //   ① 돌아간 부채꼴이 여전히 「이 칸의 것」으로 읽히는가 — 셋이 칸을 감싸는가
  //   ② 아이콘이 보드 왼쪽 테두리를 물고 나가는 자리에서 잘려 보이지 않는가
  //   ③ 비용이 오른 상태(10G 초과)의 안내 세 줄이 칸 아래에 다 들어가는가
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    // **인덱스를 못 박지 않는다.** 3레인 10열 판을 성질로 찾는다(15-trimerge 와 같은 자).
    pickStage(STAGES.findIndex(s => s.w === 10 && s.lanes.length === 3));
    ['shredder', 'frost', 'marksman'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    // 행을 끝까지 연다. 0열이 배치 가능해지는 것은 행이 다 열린 뒤고, 거기가 이 컷의 목적지다.
    state.openRows = Math.min(CFG.BOARD_H, CFG.OPEN_ROWS + CFG.UNLOCK_AT.length);
    for (let i = 0; i < 6; i++) summon(state.deck[i % 3]);   // 소환값을 10G 위로 올린다
    state.selected = null;
    const occ = occupancy();
    let spot = null;
    for (let y = firstOpenRow(); y < CFG.BOARD_H && !spot; y++)
      if (canPlace(0, y, 1, occ)) spot = { gx: 0, gy: y };
    state.picker = { mode: 'summon', gx: spot.gx, gy: spot.gy, press: null };
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('17-summonedge', () => {
    const s = pickerState();
    if (!s.open) return '소환 부채꼴이 안 열렸다';
    if (s.gx !== 0) return '0열 칸이 아니다: ' + s.gx;
    if (CFG.BOARD_W !== 10) return '10열 판이 아니다: ' + CFG.BOARD_W;
    const L = pickerLayout();
    const p = cellToPx(s.gx, s.gy);
    const cx = p.x + view.cell / 2;
    // 돌아갔는가. 안 돌면 10시 아이콘이 칸 중심보다 50px 왼쪽에 있다.
    if (L.icons.some(ic => ic.cx < cx - 1)) return '부채꼴이 안 돌았다 (왼쪽으로 나간 아이콘이 있다)';
    const lo = 6 + PICK_ICON_R;
    if (!L.icons.every(ic => ic.cx >= lo && ic.cx <= view.w - lo && ic.cy >= lo && ic.cy <= view.h - lo))
      return '아이콘이 화면 밖이다';
    if (summonCost() <= 10) return '소환값이 안 올랐다 (안내 세 줄이 안 나온다): ' + summonCost();
    if (s.peek) return '길게 누른 상태다 (이 컷은 기본 상태여야 한다)';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 자음 모티프 보드 (⑪ 빗장 10x14) ──────────────────────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다(앞에 끼우면 뒤 컷의 fxRand 가 밀려
  // md5 가 통째로 갈린다).
  //
  // **이 컷이 있는 이유는 지형이 아니라 글자다.** 위 15-trimerge 와 보드 크기도
  // 레인 수도 같아서 헤드리스 단언은 둘을 거의 못 가른다 — 갈리는 것은 **그림이
  // ㅂ 으로 읽히는가** 하나뿐이고 그건 사람이 봐야 한다. 볼 것:
  //   ① 세로 획 둘(x0 · x8)이 **판을 세로로 가르는 두 기둥**으로 읽히는가
  //   ② 가로 획 둘(행 3 · 행 11)이 그 둘을 **가로지르는 빗장**으로 읽히는가 —
  //      행 13 은 출구지 글자가 아니다. 셋이 한 덩어리로 뭉쳐 보이면 실패다
  //   ③ 기둥 사이 빈 상자(행 4~10)가 **놓을 자리로** 보이는가. 이 판의 편차 2.07 이
  //      전부 거기서 나온다 — 벽에 붙이면 값이 있고 한복판은 아무 데도 못 닿는다
  //
  // **판을 성질로 찾는다.** 3레인 판이 둘이라 `lanes.length === 3` 만으로는 ⑩ 이
  // 걸린다 — 입구가 **위쪽 변에 둘**인 것이 이 판뿐이라(⑩ 은 하나) 그걸로 가른다.
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    pickStage(STAGES.findIndex(s => s.lanes.length === 3
      && s.lanes.filter(L => L[0].y < 0).length === 2));
    ['shredder', 'frost', 'arc'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    let id = 9600;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 개방 행은 6~13. 경로(x0 세로 · x8 세로 · 행 11 · 행 13)를 피한다.
    //
    // **다섯 대만 놓는다 — 위 컷들보다 적고 그게 의도다.** 이 컷이 답해야 하는
    // 질문은 「글자가 읽히는가」인데, 타워를 열 대 깔면 사거리 칠이 판을 덮어
    // 경로선이 안 보인다(15-trimerge 를 나란히 놓으면 그 차이가 바로 보인다).
    // 2x2 는 둘 다 남긴다 — 글자와 5성 자리의 크기 관계도 같이 봐야 한다.
    put('arc',      5, 1, 7);         // 2x2. 열 1~2 x 행 7~8 — 왼 기둥에 붙인 자리
    put('shredder', 5, 5, 9);         // 2x2. 열 5~6 x 행 9~10 — 아래 빗장에 붙인 자리
    put('frost',    2, 9, 7);         // 오른 기둥 바깥 — 기둥 하나만 보는 자리
    put('shredder', 3, 3, 12);        // 두 가로대 사이 — 아래 빗장과 출구를 같이 본다
    put('frost',    1, 4, 6);         // 상자 한복판 — 아무 데도 안 닿는 자리
    state.selected = null;
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('18-glyph', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (CFG.BOARD_W !== 10 || CFG.BOARD_H !== 14)
      return '10x14 가 아니다: ' + CFG.BOARD_W + 'x' + CFG.BOARD_H;
    if (lanes.length !== 3) return '3레인이 아니다: ' + lanes.length;
    // ⑩ 이 아니라 이 판인가. 위쪽 변 입구가 둘인 것이 이 판의 표식이다.
    const top = lanes.filter(L => L.points[0].y < 0).length;
    if (top !== 2) return '위쪽 변 입구가 ' + top + '개다 (⑩ 을 집었다)';
    // 35덱 판이라야 한다. 제약이 붙으면 위 덱 세 장이 조용히 거절돼 덱 화면에 남는다.
    if (STAGES[state.stage].allowKinds) return '제약 판이다: ' + STAGES[state.stage].name;
    // 빗장 둘이 실제로 있는가. 가로로 이어진 경로 칸이 폭의 절반을 넘는 행을 센다 —
    // 이 판은 행 3 · 11 · 13 이라 셋이고, 그중 둘이 글자다.
    const bars = [];
    for (let y = 0; y < CFG.BOARD_H; y++) {
      let n = 0;
      for (let x = 0; x < CFG.BOARD_W; x++) if (isPath(x, y)) n++;
      if (n > CFG.BOARD_W / 2) bars.push(y);
    }
    if (bars.length !== 3) return '가로 획이 ' + bars.length + '줄이다 (빗장 둘 + 출구 하나라야 한다): ' + bars;
    if (state.openRows >= CFG.BOARD_H) return '잠긴 행이 없다: openRows ' + state.openRows;
    if (state.towers.filter(t => t.star >= 5).length !== 2) return '5성(2x2)이 둘이 아니다';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 자음 모티프 둘째 판 (⑫ 턱 10x14) ────────────────────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다(앞에 끼우면 뒤 컷의 fxRand 가 밀려
  // md5 가 통째로 갈린다).
  //
  // **18-glyph 과 나란히 놓고 봐야 하는 컷이다.** 보드 크기도 레인 수도 같고
  // (10x14 · 3레인) 헤드리스가 가르는 것은 어귀 수뿐이라, **두 판이 서로 다른
  // 글자로 읽히는가**는 사람이 봐야 한다. 볼 것:
  //   ① 가로대 셋(행 5 · 9 · 11)이 **층층이 걸린 턱**으로 읽히는가 — 행 13 은
  //      출구지 글자가 아니다. 넷이 고르게 보이면 실패다(간격이 4·2·2 로 다르다)
  //   ② 왼쪽 기둥이 **두 줄(x1·x2)로 붙어** 한 덩어리로 보이는가. 이 판의 꼬리가
  //      0 인 이유가 그 두 줄이고, ⑪ 의 기둥은 판 양끝에 떨어져 있다
  //   ③ 오른쪽 반(x7~9)이 **비어 보이는가.** 편차 2.65 가 거기서 나온다 —
  //      가로대에 붙이면 값이 있고 오른쪽 끝은 아무 데도 안 닿는다
  //
  // **판을 성질로 찾는다.** 3레인 10x14 가 셋이라(⑩⑪⑫) 크기·레인 수로는 못
  // 가른다 — **어귀가 셋 다 위쪽 변인 판이 이것뿐**이라 그걸로 집는다(⑩ 은 하나 ·
  // ⑪ 은 둘).
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    pickStage(STAGES.findIndex(s => s.lanes.length === 3
      && s.lanes.filter(L => L[0].y < 0).length === 3));
    ['shredder', 'frost', 'arc'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    let id = 9700;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 개방 행은 6~13. 경로(x1·x2 기둥 · x4 줄기 · 행 5·9·11·13)를 피한다.
    // **다섯 대만 놓는다** — 18-glyph 과 같은 이유로 사거리 칠이 획을 덮지 않게 한다.
    put('arc',      5, 5, 6);         // 2x2. 열 5~6 x 행 6~7 — 가로대 하나와 줄기 사이
    put('shredder', 5, 7, 8);         // 2x2. 열 7~8 x 행 8~9 — 빈 오른쪽 반에 걸친 자리
    put('frost',    2, 0, 7);         // 기둥 바깥 — 붙은 두 줄을 한 대로 본다
    put('shredder', 3, 3, 7);         // 줄기 둘 사이 — 세로만 보는 자리
    put('frost',    1, 9, 10);        // 오른쪽 끝 — 아무 데도 안 닿는 자리
    state.selected = null;
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('19-tier', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (CFG.BOARD_W !== 10 || CFG.BOARD_H !== 14)
      return '10x14 가 아니다: ' + CFG.BOARD_W + 'x' + CFG.BOARD_H;
    if (lanes.length !== 3) return '3레인이 아니다: ' + lanes.length;
    // ⑩⑪ 이 아니라 이 판인가. 어귀가 셋 다 위쪽 변인 것이 이 판의 표식이다.
    const top = lanes.filter(L => L.points[0].y < 0).length;
    if (top !== 3) return '위쪽 변 입구가 ' + top + '개다 (⑩ 이나 ⑪ 을 집었다)';
    // 35덱 판이라야 한다. 제약이 붙으면 위 덱 세 장이 조용히 거절돼 덱 화면에 남는다.
    if (STAGES[state.stage].allowKinds) return '제약 판이다: ' + STAGES[state.stage].name;
    // 가로대 셋이 실제로 있는가. 가로로 이어진 경로 칸이 폭의 절반을 넘는 행을 센다 —
    // 이 판은 행 5 · 9 · 11 · 13 이라 넷이고, 그중 셋이 글자다.
    const bars = [];
    for (let y = 0; y < CFG.BOARD_H; y++) {
      let n = 0;
      for (let x = 0; x < CFG.BOARD_W; x++) if (isPath(x, y)) n++;
      if (n > CFG.BOARD_W / 2) bars.push(y);
    }
    if (bars.length !== 4) return '가로 획이 ' + bars.length + '줄이다 (가로대 셋 + 출구 하나라야 한다): ' + bars;
    // 기둥이 두 줄로 붙어 있는가 — 이 판의 꼬리가 0 인 이유이고 ⑪ 과 갈리는 자리다.
    if (!isPath(1, 7) || !isPath(2, 7)) return '기둥 두 줄(x1·x2)이 행 7 에 없다';
    if (state.openRows >= CFG.BOARD_H) return '잠긴 행이 없다: openRows ' + state.openRows;
    if (state.towers.filter(t => t.star >= 5).length !== 2) return '5성(2x2)이 둘이 아니다';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // ── 정지 화면 = 이 판의 유일한 출구 (#74) ───────────────────
  // **맨 뒤에 둔다** — 위 컷들과 같은 이유다(앞에 끼우면 뒤 컷의 fxRand 가 밀려
  // md5 가 통째로 갈린다).
  //
  // 이 화면은 헤드리스가 「글자를 그렸다」까지밖에 못 본다. 사람이 볼 것:
  //   ① 나가기 줄이 토글 두 줄과 **같은 모양**인가 — 이 화면에서 눌리는 줄이 셋인데
  //      하나만 다르게 생기면 나머지 둘도 눌리는 줄로 안 읽힌다
  //   ② 「이어하기로 저장됩니다」가 **누르기 전에** 읽히는가. 그 줄이 안 보이면
  //      나가기는 「눌러 봐야 아는 버튼」이 되고, 그러면 아무도 안 누른다
  //   ③ 아래 도움말 절이 그 줄 때문에 화면 밖으로 밀리지 않았는가(pausePlan 예산)
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    pickStage(0);
    ['shredder', 'frost', 'mint'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 1200;
    state.wave = 6;
    let id = 9800;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: null, b5: null, t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 조폐소를 반드시 한 대 세운다 — 「내 덱」 절의 수입 줄이 그때만 숫자를 낸다.
    put('mint',     3, 1, 9);
    put('shredder', 2, 3, 9);
    put('frost',    1, 5, 9);
    togglePause();
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('20-pause', () => {
    if (!state.paused) return '정지 화면이 아니다';
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (!exitRunState().rect) return '나가기 줄이 안 세워졌다';
    if (!exitRunNote().includes('이어하기')) return '준비 단계인데 이어하기라고 안 적는다: ' + exitRunNote();
    if (exitRunState().armed) return '확인 대기 상태다 (준비 단계는 한 번에 나간다)';
    return null;
  });

  // ── 웨이브 중 나가기 = 확인을 기다리는 줄 ────────────────────
  // 20-pause 와 **같은 화면인데 줄 하나만 다르다.** 나란히 놓고 볼 것:
  //   ① 확인 대기가 **색으로 갈리는가**(빨강 바탕 · 빨강 글자). 안 갈리면 두 번째
  //      탭이 무엇을 하는지가 화면에 없다
  //   ② 「이 판은 처음부터입니다」가 잃는 것을 **정확히** 말하는가. 이 컷은 첫
  //      웨이브 중이라 정말 판이 통째로 날아가는 자리다
  await page.evaluate(() => {
    state.phase = 'wave';
    state.wave = 1;
    exitRunTap();          // 첫 탭 = 확인만 받는다
  });
  await page.waitForTimeout(200);
  await shot('21-pauseexit', () => {
    if (!state.paused) return '정지 화면이 아니다';
    if (state.phase !== 'wave') return '웨이브 중이 아니다: ' + state.phase;
    if (!exitRunState().armed) return '확인 대기가 아니다 (첫 탭이 그냥 나갔다)';
    if (exitRunNote() !== '이 판은 처음부터입니다')
      return '첫 웨이브인데 문구가 다르다: ' + exitRunNote();
    return null;
  });


  // ── 자음 모티프 셋째·넷째 판 (⑬ 재 · ⑭ 후미) ─────────────────
  // **18·19 와 나란히 놓고 봐야 하는 두 컷이다.** 10x14 · 3레인이 이제 다섯이고
  // (⑩⑪⑫⑬⑭) 헤드리스가 가르는 것은 어귀 위치뿐이라, **다섯이 서로 다른 글자로
  // 읽히는가**는 사람이 봐야 한다.
  //
  // **맨 뒤에 붙인다.** 앞에 끼우면 뒤 컷의 fxRand 가 밀려 md5 가 통째로 갈린다
  // (20·21 이 「맨 뒤에 둔다」로 적어 둔 그 이유이고, 그래서 그 둘 뒤로 간다).
  //
  // **판을 성질로 찾는다.** 위쪽 변 어귀는 ⑩ 1 · ⑪ 2 · ⑫ 3 으로 다 찼으므로 이
  // 두 판은 **위쪽 변 어귀가 0** 이고, 둘을 다시 가르는 것은 옆변의 좌우다.
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    pickStage(STAGES.findIndex(s => s.lanes.length === 3
      && s.lanes.filter(L => L[0].y < 0).length === 0
      && s.lanes.filter(L => L[0].x >= s.w).length === 2));
    ['shredder', 'frost', 'arc'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    let id = 9900;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 개방 행은 6~13. 경로(x4 목 · x6 곁 · 행 4·10·12·13 · 다리 x1·x8)를 피한다.
    // **다섯 대만 놓는다** — 18·19 와 같은 이유로 사거리 칠이 획을 덮지 않게 한다.
    put('arc',      5, 1, 7);         // 2x2. 열 1~2 x 행 7~8 — 목 왼쪽의 빈 주머니
    put('shredder', 5, 7, 7);         // 2x2. 열 7~8 x 행 7~8 — 곁 갈래 오른쪽
    put('frost',    2, 5, 8);         // 목(x4)과 곁(x6) 사이 한 칸 — 둘을 같이 본다
    put('shredder', 3, 0, 11);        // 왼 다리 바깥 — 다리와 바닥을 같이 본다
    put('frost',    1, 9, 10);        // 오른쪽 끝 — 갈림 띠 끝만 스치는 자리
    state.selected = null;
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('22-jae', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (CFG.BOARD_W !== 10 || CFG.BOARD_H !== 14)
      return '10x14 가 아니다: ' + CFG.BOARD_W + 'x' + CFG.BOARD_H;
    if (lanes.length !== 3) return '3레인이 아니다: ' + lanes.length;
    // ⑩⑪⑫⑭ 가 아니라 이 판인가. 위쪽 변 0 + 오른쪽 변 둘이 이 판의 표식이다.
    const top = lanes.filter(L => L.points[0].y < 0).length;
    if (top !== 0) return '위쪽 변 입구가 ' + top + '개다 (⑩⑪⑫ 중 하나를 집었다)';
    const right = lanes.filter(L => L.points[0].x >= CFG.BOARD_W).length;
    if (right !== 2) return '오른쪽 변 입구가 ' + right + '개다 (⑭ 후미를 집었다)';
    if (STAGES[state.stage].allowKinds) return '제약 판이다: ' + STAGES[state.stage].name;
    // 가로 획이 넷인가 — 가로획(4) · 갈림(10) · 바닥(12) · 출구(13). 셋이면 목이
    // 안 그려진 것이고 다섯이면 곁 갈래가 띠가 된 것이다.
    const bars = [];
    for (let y = 0; y < CFG.BOARD_H; y++) {
      let n = 0;
      for (let x = 0; x < CFG.BOARD_W; x++) if (isPath(x, y)) n++;
      if (n > CFG.BOARD_W / 2) bars.push(y);
    }
    if (bars.length !== 4) return '가로 획이 ' + bars.length + '줄이다 (가로획·갈림·바닥·출구 넷이라야 한다): ' + bars;
    // 목(x4)이 가로획에서 갈림까지 한 줄로 내려오는가 — 이 판을 ㅈ 으로 읽게 하는 획이다.
    if (!isPath(4, 7) || isPath(3, 7) || isPath(5, 7)) return '목(x4)이 행 7 에서 한 줄이 아니다';
    if (state.openRows >= CFG.BOARD_H) return '잠긴 행이 없다: openRows ' + state.openRows;
    if (state.towers.filter(t => t.star >= 5).length !== 2) return '5성(2x2)이 둘이 아니다';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
    return null;
  });

  // 볼 것:
  //   ① 꼭지(x4 행 0~2) · 가로획(행 3) · 고리(행 9~11 x1~x8)가 **ㅎ 으로** 읽히는가
  //   ② 고리가 **닫힌 네모**로 보이는가 — 위아래 띠만 보이고 옆이 끊기면 실패다
  //   ③ 가로획과 고리를 잇는 두 세로줄(x1·x8 행 3~9)이 **글자로 안 읽히는가.**
  //      그 둘이 기둥처럼 도드라지면 ⑪ 빗장과 같은 판으로 보인다
  await page.evaluate(() => {
    __reseed();
    window.update = window.__update;
    restart();
    applyBundle({ v: 1, unlocked: STAGES.length, best: [], run: null });
    pickStage(STAGES.findIndex(s => s.lanes.length === 3
      && s.lanes.filter(L => L[0].y < 0).length === 0
      && s.lanes.filter(L => L[0].x < 0).length === 2));
    ['shredder', 'frost', 'arc'].forEach(k => toggleDeckPick(k));
    startRun();
    tuteMerged = true;
    state.gold = 99999;
    let id = 9950;
    const put = (kind, star, gx, gy) => state.towers.push({
      id: id++, gx, gy, kind, star, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: -Math.PI / 2, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    // 개방 행은 6~13. 경로(x1·x8 세로 · 행 3·9·11·13)를 피한다. **다섯 대만.**
    put('arc',      5, 3, 6);         // 2x2. 열 3~4 x 행 6~7 — 고리 위 빈 속
    put('shredder', 5, 5, 6);         // 2x2. 열 5~6 x 행 6~7 — 그 옆
    put('frost',    2, 4, 10);        // 고리 **안쪽** — 위아래 띠를 같이 본다
    put('shredder', 3, 0, 7);         // 고리 바깥 왼쪽 — 세로줄 하나만 본다
    put('frost',    1, 9, 12);        // 오른쪽 아래 — 출구만 스치는 자리
    state.selected = null;
    __freeze();
  });
  await page.waitForTimeout(200);
  await shot('23-humi', () => {
    if (state.phase !== 'build') return '배치 단계가 아니다: ' + state.phase;
    if (CFG.BOARD_W !== 10 || CFG.BOARD_H !== 14)
      return '10x14 가 아니다: ' + CFG.BOARD_W + 'x' + CFG.BOARD_H;
    if (lanes.length !== 3) return '3레인이 아니다: ' + lanes.length;
    const top = lanes.filter(L => L.points[0].y < 0).length;
    if (top !== 0) return '위쪽 변 입구가 ' + top + '개다 (⑩⑪⑫ 중 하나를 집었다)';
    const left = lanes.filter(L => L.points[0].x < 0).length;
    if (left !== 2) return '왼쪽 변 입구가 ' + left + '개다 (⑬ 재를 집었다)';
    if (STAGES[state.stage].allowKinds) return '제약 판이다: ' + STAGES[state.stage].name;
    // 가로 획이 넷인가 — 가로획(3) · 고리 위(9) · 고리 아래(11) · 출구(13).
    const bars = [];
    for (let y = 0; y < CFG.BOARD_H; y++) {
      let n = 0;
      for (let x = 0; x < CFG.BOARD_W; x++) if (isPath(x, y)) n++;
      if (n > CFG.BOARD_W / 2) bars.push(y);
    }
    if (bars.length !== 4) return '가로 획이 ' + bars.length + '줄이다 (가로획·고리 위아래·출구 넷이라야 한다): ' + bars;
    // 고리가 **닫혀** 있는가. 위아래 띠 사이(행 10)에 옆벽 둘이 있고 속은 비어야 한다.
    if (!isPath(1, 10) || !isPath(8, 10)) return '고리 옆벽(x1·x8)이 행 10 에 없다 — 고리가 안 닫혔다';
    if (isPath(4, 10)) return '고리 속(4,10)이 막혀 있다 — 고리로 안 읽힌다';
    // 꼭지가 있는가. 이 획 하나가 ⑭ 를 ㅁ 이 아니라 ㅎ 으로 읽게 한다.
    if (!isPath(4, 0)) return '꼭지(4,0)가 없다';
    if (state.openRows >= CFG.BOARD_H) return '잠긴 행이 없다: openRows ' + state.openRows;
    if (state.towers.filter(t => t.star >= 5).length !== 2) return '5성(2x2)이 둘이 아니다';
    if (state.toast) return '토스트가 떠 있다: ' + state.toast.text;
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
