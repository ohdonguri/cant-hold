// index.html 을 Node 에서 헤드리스로 돌리기 위한 로더 + 그리디 플레이어.
// 밸런스 상수를 시뮬레이션으로 역산하는 데 쓴다. 렌더 결과는 검증하지 않는다.
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'index.html');

// ── 배치 정책 노브 (#35) ──────────────────────────────────────
// 그리디가 소환 자리를 고를 때 **후보 칸에서 복원추출로 몇 칸을 보고** 그중 커버가
// 가장 큰 칸에 놓는가. 「대충 한다」를 주의력의 한계로 옮긴 것이다 — 몇 군데만
// 눈으로 보고 나은 데 놓는다.
//
// `1` 은 퇴화값이고 「아무 데나」와 **비트 단위로 같다**(난수 한 번 뽑아 그 인덱스).
// 값을 고르는 규칙은 목적함수가 아니라 **제약 + 최소성**이다: S5 조기 전멸 꼬리가
// `npm test` 를 흔들지 않을 만큼 얇아지고 기존 밸런스 게이트가 통과하는 `k` 중
// **가장 작은 값**. 그 이상 잘하게 만들지 않는다.
//
// 기대 백분위가 `k/(k+1)` 로 해석적으로 정해지는 것이 이 규칙을 고른 이유다(순서
// 통계량). 백분위는 손으로 고르는 값이 아니라 `k` 에서 따라 나오는 값이고,
// `tools/place.js` 와 `tools/test.js` 의 게이트는 「실측이 `k/(k+1)` 과 맞는가」를 본다.
//
// ── [2026-08 #64] **옛 근거(k=2)는 무효다. 그 사실부터 적는다.** ────────────
// 이 자리에는 오래 이런 표가 박혀 있었다:
//
//   k    S5 w<10           8판 중 2판 이상이 무너질 확률
//   1    17/1000 (1.7%)    0.756%
//   2     6/1000 (0.6%)    0.098%     ← 그때 채택
//   3     2/1000 (0.2%)    0.011%
//
// **그 1000판은 `openRows` 6 으로 돌던 시절 값이다.** `#60` 이 「시작 열린 행 수가
// 직전 판을 따라간다」를 고치기 전까지 시뮬은 `restart()` 가 되돌린 값을 써서 큰 판을
// 전부 6 으로 돌고 있었다(정의는 8). 즉 **여섯 판이 다른 판으로 측정되고 있었고**,
// 위 표의 「S5 0.6%」도 그 다른 판의 수다. 같은 자리를 지금 재면 **1.10%** 다.
//
// **`#60` 은 `hpMult` 눈금만 옮긴 게 아니라 이 표까지 같이 무효로 만들었다.** 눈금이
// 틀린 것과 자가 바뀐 것을 다음 사람이 못 가르는 것이 이 리포가 반복해 데인 자리라
// (§난이도의 눈금 「절대 숫자는 그리디 능력 세대에 묶인다」), 지우지 않고 남긴다.
//
// ── 그래서 규칙의 두 조항이 서로 모순이 됐다 ────────────────────────────────
// 위 최소성 규칙은 조항이 둘이다: **(a) 꼬리가 얇을 것**, **(b) 기존 게이트가 통과할
// 것**. (b) 에는 `tools/test.js` 의 배치 백분위 **상한**이 들어 있고, 그 상한은
// 「최적으로 가지 마라」를 숫자로 적은 줄이라 `k` 를 위에서 누른다. `#60` 이후 두
// 조항이 겹치는 `k` 가 **없어졌다** — (a) 는 6 이상을 요구하고 (b) 는 2 만 허용했다.
//
// 실측(무시드 · 밸런스 덱 `shredder·arc·mint` · ⑨ 는 그 판의 유일 덱 · 2800판):
//
//   k   ⑤ w<10   ⑥ w<10   ⑨ w<10   ⑥ 게이트/런   백분위 상한 0.72
//   1     —      29.67%    8.57%      99.9%        pass
//   2    1.10%   10.62%    4.24%      20.6%        pass   ← 옛 채택값
//   3    0.68%    4.54%    2.25%       5.0%        FAIL (8/9 판)
//   4    0.14%    2.82%    1.93%       2.0%        FAIL (9/9)
//   5    0.00%    1.71%    1.00%       0.8%        FAIL (9/9)
//   6    0.00%    0.46%    0.57%       0.06%       FAIL (9/9)  ← 채택
//
// **`k=2` 는 상한이 강제한 값이지 꼬리가 골라 준 값이 아니었다.** 옛 채택 근거가
// 0.098%/런인데 `#60` 이후 실제 위험은 ⑥ 20.6%/런 — **200배**다. 유저가 상한 쪽을
// 옮기기로 정했고(`tools/test.js` §배치 백분위 상한), 그래서 (a) 로 다시 고른다.
//
// **6 을 고른 근거는 여전히 최소성이다.** ⑥⑨ 의 꼬리가 게이트를 흔들지 않는 최소
// `k` 다 — 5 는 ⑥ 이 1.71%(0.8%/런)라 40런에 27% 로 샌다. 6 에서 밸런스 블록을
// **1200런** 돌려 빨간불 **1건**(0.08%/런)이고, 그건 옛 채택 근거 0.098%/런과 같은
// 자리수다. **7 이상으로 올리지 마라** — 더 얻는 것이 0.0x%p 인데 그리디가 더 잘
// 놓아 판이 쉬워진다(이 표의 대가는 아래 문단).
//
// **대가는 판이 쉬워지는 것이고, 그건 `hpMult` 로 되돌렸다.** k=2 → 6 에서 진도 `p`
// 가 ④ 0.993→0.995 · ⑤ 0.755→0.797 · ⑥ 0.650→0.790 · ⑨ 0.826→0.889 로 올랐다.
// ④ 를 0.8 → **0.95**, ⑤ 를 0.8 → **0.72** 로 옮겨 계단을 다시 세웠다(index.html).
// **「대충」의 정의는 꼬리를 재우는 데 필요한 최소한의 실력이고 그 이상 잘하게
// 만들지 않는다** — 그 문장은 그대로다. 바뀐 것은 「필요한 최소한」이 얼마인가뿐이고,
// 그 값을 움직인 것은 이 파일이 아니라 판(`openRows`)이다.
//
// **꼬리는 0 이 아니다 — 얇아질 뿐이다.** ⑥ 0.46% 는 200판으로 재면 0/200 이 30%
// 확률로 나온다. 「없앴다」로 읽지 마라. 측정 표는 DESIGN §꼬리를 재는 자에 있다.
const SUMMON_SAMPLES = 6;

// 커버를 재는 사거리. **`tools/paths.js` 에서 그대로 가져온다 — 값을 여기 안 적는다.**
// 자가 둘이면 DESIGN §스테이지의 커버 편차 표와 이 시뮬이 서로 다른 것을 재게 되고,
// 그때는 「편차 1.79 인 판을 골랐다」와 「그리디가 그 편차를 쓰고 있다」가 말이 안 맞는다.
// 예전에는 여기에 `2.2` 를 베껴 뒀는데, 그러면 **`paths.js` 쪽만 고쳤을 때 아무것도
// 안 깨진 채로** 두 자가 갈렸다. import 하나가 그걸 구조로 막는다.
//
// **종류별 `KINDS[k].range`(2.0~4.5)를 안 쓴다.** 커버 표를 종류마다 따로 만들면
// 위 표와 다른 것을 재게 되고, 게다가 `pickKind` 가 종류를 먼저 정하므로 종류별
// 커버는 「이 종류를 어디에 놓나」만 바꾸지 「대충 한다」의 정의를 바꾸지 않는다.
// 사람도 타워마다 사거리를 재고 놓지는 않는다 — 통로 옆인지만 본다.
//
// **#48 이 이 문단의 뒷부분을 뒤집었다 — 앞부분은 그대로다.** 「종류별로 재면 어디에
// 놓나만 바뀐다」는 맞는 말인데, 박격포와 마력로는 **어디에 놓나가 곧 성능**이라
// 그게 바로 고쳐야 할 것이었다(아래 §종류별 자리 점수). 다만 **이 커버 표 자체는
// 한 줄도 안 고쳤다** — DESIGN §스테이지의 커버 편차 표와 이어지는 자는 여전히
// 이 `COVER_RANGE` 하나이고, 종류별 점수는 그 옆에 따로 붙인 것이다.
const { RANGE: COVER_RANGE } = require('./paths.js');

// 그리기 호출을 기록할 수 있는 캔버스 스텁.
// log 를 넘기면 호출한 메서드 이름이 순서대로 쌓인다. "무엇이 화면에 나왔나"를
// 헤드리스에서 볼 수 있는 유일한 창이다 — 상태만 검사하면 drawXxx() 호출을
// 통째로 지워도 테스트가 전부 통과한다(실제로 그랬다).
// **`fillText` 만 인자를 같이 남긴다.** 이름만 세면 「한 줄 그렸다」까지밖에 못 보고,
// 문구를 통째로 딴 것으로 바꿔도 통과한다 — 「막힌 이유를 보여준다」처럼 **글자가
// 곧 기능인 자리**를 잠그려면 무엇을 그렸는지가 필요하다. 나머지 메서드는 그대로
// 이름만 센다(인자를 전부 남기면 도트 굽기 한 판에 수천 줄이 쌓인다).
//
// **선 긋기는 좌표까지 남긴다**(#58). 이름만 세면 「선을 그었다」까지밖에 못 보고,
// **보드 클립 밖에 그어도 통과한다** — 관문 선이 정확히 그랬다. 아홉 판 어디서도
// 화면에 없었는데 그리는 코드는 멀쩡히 있었고 검사는 전부 통과했다. 어디에
// 그었는지가 있어야 「그렸다」와 「보인다」가 갈린다.
// `beginPath`/`stroke` 도 같이 남기는 것은 **한 번의 stroke 로 그은 선분 하나**를
// 복원하기 위해서다 — moveTo/lineTo 만 모으면 여러 점을 이은 경로와 구분이 안 된다.
// 도트 굽기는 fillRect 라 여기 안 걸린다(한 판에 몇십 줄이다).
// `arc` 도 좌표를 남긴다(#68). 방사형 소환 아이콘이 관문 선과 같은 함정 자리다 —
// 이름만 세면 「원을 그렸다」까지밖에 못 보고, 보드 밖이나 화면 밖에 그려도 통과한다.
// 반지름까지 남겨야 「그 아이콘」인지 튜토리얼 링인지 갈린다.
// **좌표 변환도 인자를 남긴다.** 스프라이트 좌우 뒤집기(index.html drawSprite)가
// 이름만으로는 「뒤집었다」까지밖에 못 보고, **엉뚱한 자리에 뒤집어 놔도 통과한다** —
// 뒤집기는 그린 자리를 그대로 두고 좌우만 바꿔야 하는데 그게 순수한 그림 문제라
// 스크린샷 말고는 볼 창이 없었다. `geom` 이 아니라 따로 담는 이유는 segments() 가
// beginPath→moveTo→lineTo→stroke 네 줄이 **붙어 있는 것**으로 선분을 복원하기
// 때문이다. 거기 변환이 끼면 멀쩡한 선이 선분으로 안 읽힌다.
const GEOM = ['beginPath', 'moveTo', 'lineTo', 'stroke', 'arc'];
const XFORM = ['translate', 'scale'];
function stubCtx(log, texts, geom, images, xform) {
  return new Proxy({}, {
    get(_, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return {};
      if (texts && p === 'fillText') return s => { log.push(p); texts.push(String(s)); };
      if (geom && GEOM.includes(p)) return (...a) => { log.push(p); geom.push({ m: p, a }); };
      if (images && p === 'drawImage') return (...a) => { log.push(p); images.push(a); };
      if (xform && XFORM.includes(p)) return (...a) => { log.push(p); xform.push({ m: p, a }); };
      if (log) return () => { log.push(p); };
      return () => {};
    },
    set() { return true; },
  });
}

// 오디오 노드 스텁. 호출도 되고 속성 접근도 되는 만능 no-op 이라야 한다 —
// 게임 코드가 `o.frequency.setValueAtTime(...)` 처럼 중첩으로 파고들기 때문이다.
function stubAudioNode() {
  const f = () => stubAudioNode();
  return new Proxy(f, {
    get: () => stubAudioNode(),
    set: () => true,
    apply: () => stubAudioNode(),
  });
}

// AudioContext 스텁. draws 와 같은 취지지만 오디오에는 프록시 로그를 걸 자리가 없다
// (§2.9 는 게임 코드 안의 sfxStats() 카운터로 대신한다). 이 스텁이 하는 일은
// **시계를 들고 있는 것**뿐이다 — 큐 쿨다운을 actx.currentTime 으로 재므로
// 테스트가 시간을 앞으로 감을 수 있어야 게이트를 검사할 수 있다.
function makeAudio() {
  let now = 0;
  const AudioContext = function () {
    return {
      get currentTime() { return now; },
      state: 'running',
      destination: stubAudioNode(),
      createGain: () => stubAudioNode(),
      createOscillator: () => stubAudioNode(),
      createDynamicsCompressor: () => stubAudioNode(),
      resume: () => {},
      close: () => {},
    };
  };
  return {
    AudioContext,
    api: {
      advance(s) { now += s; },
      set(s) { now = s; },
      now() { return now; },
    },
  };
}

// 세션 히스토리 스텁(#74). 게임이 화면 전이를 `history.pushState` 로 쌓고
// `popstate` 로 되돌리므로, 그 왕복을 헤드리스가 그대로 밟을 수 있어야 한다 —
// 상태만 검사하면 pushState 를 통째로 지워도 전부 통과한다(draws 와 같은 취지).
//
// **popstate 를 즉시 안 쏜다.** 브라우저에서 `back()` 은 큐에 들어가고 이벤트는
// 나중에 오는데, 그 사이에 게임이 새 항목을 쌓는 경우가 실제로 있다
// (`tools/shot.js` 가 컷마다 `restart(); pickStage(...)` 를 한 태스크에 부른다).
// 여기서 동기로 쏘면 그 순서가 재현이 안 되고, 그 자리에서만 나는 「뒤로가기가
// 화면을 한 칸 더 먹는」 버그를 검사가 영영 못 본다. `flush()` 가 그 나중이다.
function makeHistory() {
  const stack = [{ s: null }];   // 문서가 처음 실린 항목. 그 앞은 이 문서 밖이다
  let i = 0;
  const pending = [];
  let exited = false;            // 항목이 없는데 뒤로 갔다 = 페이지를 나갔다
  let fire = () => {};           // 지금 실려 있는 페이지의 리스너. 새로고침하면 갈린다
  const api = {
    get state() { return stack[i].s; },
    pushState(s) { stack.length = i + 1; stack.push({ s }); i = stack.length - 1; },
    replaceState(s) { stack[i].s = s; },
    back() {
      if (i > 0) { i--; pending.push(stack[i].s); }
      else exited = true;
    },
  };
  return {
    api,
    ctl: {
      // 브라우저 뒤로가기 한 번. 우리 문서의 항목이 남아 있으면 popstate 가 오고,
      // 없으면 페이지를 나간다 — 그 갈림이 이 게임의 요구사항 전부다.
      pressBack() { api.back(); this.flush(); },
      flush() { while (pending.length) fire('popstate', { state: pending.shift() }); },
      depth() { return i; },
      exited() { return exited; },
      // **새로고침.** 항목은 그대로 두고 페이지만 새로 싣는다(`load(null, {history})`).
      // 그 항목 위에서 다시 시작하는 것이 모바일에서 탭이 되살아날 때 실제로 벌어지는
      // 일이고, 게임이 그걸 이어받는지가 「목록에서 뒤로가기가 한 번에 나가는가」다.
      bind(f) { fire = f; },
    },
  };
}

// CFG 안의 숫자 상수를 덮어쓴 소스를 만든다.
function patch(src, overrides) {
  let out = src;
  for (const [k, v] of Object.entries(overrides || {})) {
    const re = new RegExp('(\\b' + k + ':\\s*)[-\\d.]+');
    if (!re.test(out)) throw new Error('CFG 에 없는 키: ' + k);
    out = out.replace(re, '$1' + v);
  }
  return out;
}

const EXPOSE = [
  'CFG', 'state', 'update', 'KINDS', 'KIND_KEYS', 'ENEMY', 'WAVES', 'STAR_MULT',
  'waveHp', 'summon', 'summonCost', 'canPlace', 'occupancy', 'firstOpenRow', 'nextUnlockWave',
  'canMerge', 'mergeAllowed', 'mergeTowers', 'mergeablePair', 'mergeResultSize', 'mergeSpot', 'drawMergePreview',
  // 2x2 자리 고르기. 핸들러(pointerdown/pointerup)에 로직을 안 남기고 이 함수들만
  // 부르므로, 헤드리스가 탭 없이 모드를 열고 고르고 커밋·취소까지 전부 밟을 수 있다.
  // mergePlaceState 는 2.8 의 hitstopState() 와 같은 읽기용 게터다.
  'mergeSpots', 'beginMergePlace', 'mergePlaceSelect', 'mergePlaceCommit', 'mergePlaceCancel', 'mergePlaceState',
  'cycleSpeed', 'togglePause', 'pauseHelp', 'wrapLines',
  'applyChoice', 'branchChain', 'choiceLabel', 'clearChoices', 'mergeCost', 'mergeIsFree',
  'rushWave', 'endWave', 'towerDmg', 'towerCd',
  // enemySpeed: 박격포 탄막 테스트가 착탄 지점을 posAt 으로 직접 재계산한다.
  // 리드(착탄 지연 0.5초만큼 앞을 겨냥)를 손으로 베끼면 BASE_SPEED 를 고쳤을 때
  // 테스트만 옛 값을 지키며 통과한다.
  'towerRange', 'towerFootprint', 'posAt', 'buildSpawnQueue', 'enemySpeed',
  // 종류별 자리 점수(#48)가 쓰는 판정 원본. **하나도 베끼지 않으려고 내보낸다.**
  //   towerCenter/distTo  사거리가 원이 아니라 **정사각형**이라는 규칙(index.html
  //                       distTo 주석)까지 따라온다. 커버 표는 원(hypot)이라 둘이 다르다
  //   BEAM_HALF           마력로 관통 판정의 수직거리 한계
  //   BLAST_RADIUS        박격포 무분기 폭발 반경
  'towerCenter', 'distTo', 'BEAM_HALF', 'BLAST_RADIUS',
  'BRANCH', 'TRAITS', 'TRAIT_KEYS', 'mergeCost', 'isPath', 'pathCells',
  'applyStacks', 'debuffScale', 'effArmor', 'effMres',
  'applyArmor', 'spawnEnemy', 'rollDeck', 'damage', 'killEnemy',
  'spawnKillFx', 'aliveParticles', 'resetParticles', 'drawParticles', 'PARTICLE_CAP', 'fireTower',
  'PARTICLE_LIFE', 'MUZZLE_LIFE', 'SPARK_LIFE',
  // 처치 잔상. sprCache 까지 내보내는 건 "색을 매 프레임 새로 만들면 캐시가 무한히
  // 커진다"를 테스트가 실측으로 잠그기 위해서다 — 상태만 봐서는 못 잡는 회귀다.
  'aliveCorpses', 'resetCorpses', 'corpseScale', 'drawCorpses',
  'CORPSE_LIFE', 'CORPSE_CAP', 'sprCache',
  // 충격 등급. 상수까지 내보내는 건 PARTICLE_LIFE 와 같은 이유다 — 테스트가 숫자를
  // 손으로 베끼면 값을 고쳤을 때 테스트만 옛 값을 지키며 통과한다.
  // hitstopT / leakWarnT 는 모듈 레벨 원시값이라 객체처럼 못 넘긴다. 읽기용 게터를 둔다.
  // setHitstop 은 "히트스톱이 로직에 안 샌다"를 재는 용도로만 있다 — 게임 코드는 bumpHitstop 만 쓴다.
  // decayShake 는 frame() 이 도는 감쇠다. frame 은 시뮬에 안 새게 일부러 안 내보내므로
  // 테스트가 흔들림 시간을 앞으로 감을 수 있는 통로는 이것뿐이다.
  'shake', 'shakeOffset', 'bumpShake', 'bumpHitstop', 'decayShake', 'resetImpact',
  'hitstopState', 'leakWarnState', 'setHitstop',
  'setShakeEnabled', 'pxToCell', 'cellToPx', 'view',
  // 관문 선(#58). 좌표를 돌려주는 함수와 굵기를 **둘 다** 내보낸다 — 검사가 좌표식을
  // 베끼면 자가 두 벌이 되고, 굵기 4 를 베끼면 굵기만 고쳤을 때 검사가 옛 값으로
  // 「굵기 전체가 보드 안」을 재게 된다.
  'gateLines', 'GATE_W',
  'BLAST_SHAKE_AMP', 'BLAST_SHAKE_DUR', 'BLAST_SHAKE_CD', 'KILL_SHAKE_AMP', 'KILL_SHAKE_DUR',
  'HITSTOP', 'LEAK_WARN_DUR',
  // 사운드(2.9). SFX 와 SFX_VOICE_CAP 까지 내보내는 건 위 상수들과 같은 이유다 —
  // 테스트가 쿨다운·상한을 손으로 베끼면 값을 고쳤을 때 테스트만 옛 값을 지키며 통과한다.
  // sfxUnlock 은 테스트가 **명시적으로** 부른다. 게임에서는 pointerdown 이 부르는데
  // canvas.addEventListener 가 여기서는 no-op 이라 greedy/tune/seedcheck 는
  // AudioContext 스텁이 있어도 actx 가 null 인 채로 돈다(밸런스 경로 영향 0).
  'sfx', 'sfxUnlock', 'sfxStats', 'SFX', 'SFX_VOICE_CAP', 'setSoundEnabled', 'toggleSound', 'fxState',
  'render', 'restart', 'drawPause', 'choiceRects', 'openChoice', 'selectedTower', 'buttons',
  'startRun', 'toggleDeckPick', 'deckCardRects', 'deckStartRect', 'deckLayout', 'GROUPS', 'AURA_KINDS', 'pickerRects', 'pickerHit', 'pickerLayout',
  // 방사형 소환(#68 · 두 단계 탭은 #83). 핸들러(pointerdown)에 로직을 안 남기고
  // `pickerTap` 하나만 부르므로, 헤드리스가 손가락 없이 「첫 탭 · 옮겨 탭 · 둘째 탭」을
  // 전부 밟을 수 있다 — mergePlace 와 같은 규칙이다.
  // 치수 상수까지 내보내는 건 PARTICLE_LIFE 와 같은 이유다 — 검사가 58·24·28·6 을
  // 손으로 베끼면 값을 고쳤을 때 검사만 옛 값을 지키며 통과한다.
  'pickerTap', 'pickerSel', 'pickerState',
  'PICK_R', 'PICK_ICON_R', 'PICK_HIT_R', 'PICK_SEL_R', 'PICK_STEP', 'PICK_EDGE',
  // 판이 덱을 제한하는 기계(#50). **계측 도구가 이걸 안 보면 제약 판을 못 잰다** —
  // `tools/affinity.js`·`tools/curve.js` 는 35덱을 고정으로 돌던 것이라 제약 판에서는
  // 못 고르는 덱을 재게 된다. 허용 목록을 도구 쪽에 베끼면 자가 두 벌이 되므로
  // 살아 있는 판 정의에서 그대로 가져다 쓴다.
  'allowedKinds', 'kindAllowed', 'deckLimitNote',
  // 방향별 그림. 검사가 「어느 방향이 어느 파일로 떨어지나」를 손으로 베끼면 표를
  // 고쳤을 때 검사만 옛 표를 지키며 통과한다 — 체인과 이름 목록을 살아 있는 채로
  // 내보내고, 경로도 `dirPath` 로 게임과 같은 자를 쓴다.
  // `towerFacing`/`enemyFacing` 은 이력(경계 떨림)을 밖에서 밟는 유일한 통로다.
  'TOWER_DIRS', 'TOWER_DIR_FILES', 'ENEMY_DIR_FILES', 'TOWER_FACE_CHAIN', 'ENEMY_FACE_CHAIN',
  'towerFacing', 'enemyFacing', 'facingAsset', 'dirPath', 'muzzle',
  'FACE_STEP', 'FACE_MARGIN', 'FACE_AXIS_BIAS',
  'SPR', 'SPR_ASSET_PATH', 'sprite', 'drawSprite', 'snapshotRun', 'restoreRun', 'saveBundle', 'applyBundle', 'mergeBundle', 'STAGES', 'loadStage', 'lanes', 'pickStage', 'stageCardRects', 'laneLen',
  // 세이브 형식 버전과 「뜻이 안 바뀐 인덱스 수」. 테스트가 리터럴 3·5 를 베껴 두면
  // 판을 또 붙여 경계가 움직였을 때 테스트만 옛 값을 지키며 통과한다.
  'SAVE_VERSION', 'SAVE_V2_STABLE', 'migrateBundle',
  // 「이 판을 지금 고를 수 있는가」. 테스트가 조건을 베끼면 자가 두 벌이 된다.
  'stageUnlocked',
  // 카드 높이 하한 두 벌(full/compact). 테스트가 72·51 을 베껴 두면 하한을 고쳤을 때
  // 테스트만 옛 값을 지키며 통과한다 — 아래 resumeRect/cloudRect 와 같은 이유다.
  'STAGE_CARD_MIN',
  // 스테이지 선택 화면의 아래 두 줄. 카드 높이 하한(index.html stageCardRects)이
  // 좁은 화면에서 이 둘을 화면 밖으로 밀어내지 않는지 테스트가 봐야 하는데,
  // 좌표식을 테스트에 베껴 두면 레이아웃을 고쳤을 때 테스트만 옛 값을 지키며 통과한다.
  'resumeRect', 'cloudRect',
  // 목록 스크롤(#50). `stageListMetrics` 는 「칸이 얼마고 얼마나 넘치는가」의 정본이라
  // 테스트가 좌표식을 베끼지 않게 내보낸다. `stageTap` 은 핸들러 대신 부르는 정문이고
  // (헤드리스가 탭 없이 밟는다), `setStageScroll` 은 스크롤을 감는 유일한 통로다 —
  // 모듈 레벨 원시값이라 객체처럼 못 넘긴다(hitstopT 와 같은 사정).
  'stageListMetrics', 'stageCardVisible', 'stageTap', 'setStageScroll', 'stageScrollState',
  // 뒤로 가기(#74). `navBack` 은 **화면의 뒤로 버튼이 부르는 것 그대로**다 —
  // pointerdown 에 로직을 안 남기므로 헤드리스가 탭 없이 그 버튼을 누를 수 있다.
  // (ESC 와 브라우저 뒤로가기는 window 리스너로 들어오므로 `g.key`·`g.nav` 가 그 문이고,
  // 셋 다 결국 `goBack()` 하나를 지난다.) `navState` 는 「지금 항목을 들고 있나」를 보는
  // 게터고(모듈 레벨 원시값이라 객체처럼 못 넘긴다), `deckBackRect` 는 좌표식을 검사에
  // 베끼지 않으려고 내보낸다 — deckStartRect 와 같은 이유다.
  'navBack', 'navState', 'deckBackRect',
  // 이어하기. 나갔다 들어오는 왕복을 검사가 끝까지 밟으려면 목록 쪽 문도 필요하다 —
  // `restoreRun` 만으로는 「목록에서 눌렀을 때」가 안 걸린다(navArm 이 거기 있다).
  'resumeRun',
  // 판 나가기. 핸들러(pointerdown)에 로직을 안 남기고 이 함수들만 부르므로 헤드리스가
  // 탭 없이 「눌렀다 · 한 번 더 눌렀다」를 밟을 수 있다(mergePlace 와 같은 규칙).
  'exitRun', 'exitRunTap', 'exitRunNote', 'exitRunState',
];

// `opts.history` 는 **새로고침**을 흉내내는 통로다. 앞선 페이지가 쓰던 히스토리를
// 그대로 물려주면(항목은 남고 페이지만 새로 실린다) 모바일에서 탭이 되살아나는 상황이
// 그대로 재현된다 — 그 상황에서 목록의 뒤로가기가 한 번에 나가는지가 #74 의 마지막 조항이다.
function load(overrides, opts) {
  const html = fs.readFileSync(HTML, 'utf8');
  const js = patch(html.split('<script>')[1].split('</' + 'script>')[0], overrides);
  // 본 화면만 기록한다. 스프라이트를 굽는 오프스크린 캔버스까지 세면
  // 처음 그릴 때 굽는 도트 수백 줄이 섞여서 못 쓴다.
  const drawLog = [];
  const drawTexts = [];
  const drawGeom = [];
  const drawImages = [];
  const drawXform = [];
  const canvas = { getContext: () => stubCtx(drawLog, drawTexts, drawGeom, drawImages, drawXform), addEventListener: () => {}, width: 0, height: 0, style: {} };

  // PNG 스프라이트의 로딩 전/완료/실패를 브라우저와 같은 속성으로 밟는다.
  // 테스트는 이 가짜를 단언하지 않고, 실제 drawImage 가 무엇을 받았는지만 본다.
  const imageBySrc = new Map();
  class StubImage {
    constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; this._src = ''; }
    set src(v) { this._src = String(v); imageBySrc.set(this._src, this); }
    get src() { return this._src; }
  }

  const store = new Map();
  const localStorageStub = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };

  const audio = makeAudio();

  // window 리스너를 받아 둔다. 예전에는 no-op 이라 keydown(ESC)·popstate 로 들어오는
  // 경로를 헤드리스가 **한 줄도 못 밟았다** — 뒤로 가기가 그 둘로 들어온다(#74).
  const listeners = new Map();
  const fire = (type, ev) => {
    for (const fn of listeners.get(type) || []) fn(Object.assign({ preventDefault() {} }, ev));
  };
  const history = (opts && opts.history && opts.history.__h) || makeHistory();
  history.ctl.bind(fire);

  const fn = new Function('document', 'window', 'performance', 'requestAnimationFrame', 'localStorage', 'history',
    js + '\nreturn {' + EXPOSE.join(',') + '};');
  const api = fn(
    {
      getElementById: () => canvas,
      // 스프라이트를 오프스크린 캔버스에 굽는다
      createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx() }),
    },
    {
      innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
      addEventListener: (t, fn) => {
        if (!listeners.has(t)) listeners.set(t, []);
        listeners.get(t).push(fn);
      },
      Image: StubImage,
      AudioContext: audio.AudioContext,
    },
    { now: () => 0 },
    () => {},
    localStorageStub,
    history.api,
  );

  // 마지막 render 가 본 화면에 무엇을 그렸는지 세는 창.
  //   g.draws.reset(); g.render(); g.draws.count('fill')
  //   g.draws.reset(); g.render(); g.draws.text.some(s => s.includes('금지'))
  api.draws = {
    log: drawLog,
    text: drawTexts,
    geom: drawGeom,
    images: drawImages,
    xform: drawXform,
    reset() { drawLog.length = 0; drawTexts.length = 0; drawGeom.length = 0; drawImages.length = 0; drawXform.length = 0; },
    count(...names) { return drawLog.filter(n => names.includes(n)).length; },
    // 한 번의 stroke 로 그은 **직선 하나**만 골라 낸다. beginPath → moveTo → lineTo →
    // stroke 가 정확히 그 모양이고, 점이 더 붙은 경로(roundRect 등)는 안 걸린다.
    segments() {
      const out = [];
      for (let i = 0; i + 3 < drawGeom.length; i++) {
        const [p, m, l, s] = drawGeom.slice(i, i + 4).map(e => e.m);
        if (p !== 'beginPath' || m !== 'moveTo' || l !== 'lineTo' || s !== 'stroke') continue;
        out.push({
          x1: drawGeom[i + 1].a[0], y1: drawGeom[i + 1].a[1],
          x2: drawGeom[i + 2].a[0], y2: drawGeom[i + 2].a[1],
        });
      }
      return out;
    },
    // 화면에 그린 **원**을 전부 골라 낸다(#68). segments() 와 같은 취지고,
    // 여기서는 순서를 안 본다 — 원 하나가 arc 한 번이라 그 호출이 곧 그 원이다.
    circles() {
      return drawGeom.filter(e => e.m === 'arc')
        .map(e => ({ x: e.a[0], y: e.a[1], r: e.a[2] }));
    },
  };
  api.images = {
    get(src) { return imageBySrc.get(src) || null; },
    load(src) {
      const im = imageBySrc.get(src);
      if (!im) return null;
      im.complete = true; im.naturalWidth = 256; im.naturalHeight = 256;
      return im;
    },
    fail(src) {
      const im = imageBySrc.get(src);
      if (!im) return null;
      im.complete = true; im.naturalWidth = 0; im.naturalHeight = 0;
      return im;
    },
  };
  // 오디오 시계를 앞으로 감는 창. 큐 쿨다운은 게임 dt 가 아니라 이 시계로 잰다.
  //   g.sfxUnlock(); g.audio.advance(0.06); g.sfx('shot')
  api.audio = audio.api;
  // 브라우저 뒤로가기와 키보드(#74). 게임 코드는 window 리스너로만 이 둘을 받으므로
  // 검사도 같은 문으로 들어가야 한다 — 핸들러 안의 분기를 베끼면 자가 두 벌이 된다.
  //   g.nav.pressBack();  g.key('Escape');  g.nav.entries()
  api.nav = history.ctl;
  // 새로고침 때 이 히스토리를 그대로 물려주기 위한 손잡이(load 의 opts.history).
  history.ctl.__h = history;
  api.key = k => fire('keydown', { key: k });
  // 기기 로컬 플래그(cant-hold-shake / -sound / -tute)가 실제로 그 키에 들어갔는지
  // 테스트가 볼 수 있어야 한다. 세이브 번들과 섞이지 않았다는 증거가 이것뿐이다.
  api.storage = localStorageStub;
  return api;
}

// ── 소환할 종류 고르기 ────────────────────────────────────────
// 종류를 고를 수 있게 된 뒤의 플레이를 흉내낸다.
// 가장 낮은 성급에서 짝이 안 맞는 종류를 골라 바로 합성으로 잇는다.
//
// **아직 한 대도 없는 종류가 최우선이다.** 예전에는 「짝이 안 맞는 최저 성급」이
// 없으면 무조건 Infinity 로 떨어뜨렸는데, 한 대도 없는 종류(own=[])가 정확히
// 그 경우라 덱의 셋째 종류가 항상 꼴찌였다 — 「덱 3종」으로 재던 수치가 전부
// 사실상 2종을 재고 있었다(#31). 갈라내는 것은 `own.length === 0` 하나뿐이고,
// 타워는 있는데 짝이 다 맞는 종류(2x2 자리가 없어 5성 둘이 남은 경우 등)는
// 그대로 Infinity 다 — 그건 더 지어도 이을 데가 없는 종류라 후순위가 맞다.
//
// 동점은 개수가 적은 쪽이 먹는다. 셋 다 0개일 때는 덱 순서대로 하나씩 착수하고,
// 그 뒤로는 개수가 뒤처진 종류로 자연스럽게 돌아간다.
//
// greedy 클로저 밖에 둔 이유는 하나다 — 난수를 한 번도 안 뽑고 규칙만 단언할 수
// 있어야 하기 때문이다(tools/test.js 「소환 종류 선택」).
function pickKind(deck, towers) {
  let best = null, bestStar = Infinity, bestCount = Infinity;
  for (const k of deck) {
    const own = towers.filter(t => t.kind === k);
    const byStar = {};
    for (const t of own) byStar[t.star] = (byStar[t.star] || 0) + 1;
    const odd = Object.keys(byStar).map(Number)
      .filter(s => byStar[s] % 2 === 1)
      .sort((a, b) => a - b)[0];
    const star = own.length === 0 ? -1 : (odd === undefined ? Infinity : odd);
    if (star < bestStar || (star === bestStar && own.length < bestCount)) {
      bestStar = star; bestCount = own.length; best = k;
    }
  }
  return best || deck[0];
}

// ── 소환할 자리 고르기 ────────────────────────────────────────
// 놓을 수 있는 칸을 전부 센다. **index.html `summon()` 의 무좌표 분기(:492-495)와
// 순서도 술어도 같아야 한다** — 어긋나면 두 방향으로 조용히 틀린다. 게임이 못
// 놓는 칸을 고르면 `summon` 의 `canPlace` 재검증에 걸려 토스트만 내고 소환이 통째로
// 빠지고(그리디는 `towers.length` 가 안 늘어 그 웨이브의 배치를 거기서 그만둔다),
// 반대로 좁게 세면 놓을 수 있는 칸을 영영 안 쓴다.
//
// `firstOpenRow()`(= `CFG.BOARD_H - state.openRows`)를 베끼지 않고 그대로 부른다.
// 개방 행 계산이 두 곳에 있으면 한쪽만 고쳤을 때 이 함수가 말없이 어긋난다.
//
// greedy 클로저 밖에 둔 이유는 `pickKind` 와 같다 — 난수를 한 번도 안 뽑고 규칙만
// 단언할 수 있어야 하기 때문이다.
function summonSpots(g) {
  const { state, CFG } = g;
  const occ = g.occupancy();
  const spots = [];
  for (let y = g.firstOpenRow(); y < CFG.BOARD_H; y++)
    for (let x = 0; x < CFG.BOARD_W; x++)
      if (g.canPlace(x, y, 1, occ)) spots.push([x, y]);
  return spots;
}

// 커버 = 사거리 안에 들어오는 경로 칸 수. `tools/paths.js` 의 `spread()` 와 같은
// 정의다. 경로 칸은 `g.pathCells`(게임이 `loadStage` 에서 만든 것)를 그대로 쓴다 —
// 레인을 여기서 다시 펴면 걷는 규칙이 두 벌이 되고, 한쪽만 고쳤을 때 조용히 갈린다.
// 보드 밖은 잘라낸다(레인 시작점이 `x = -1` 이라 실제로 섞여 있다).
//
// **캐시는 `g` 인스턴스마다다. 모듈 전역에 두면 안 된다** — `tune.js`·`test.js` 가
// 한 프로세스에서 `load()` 를 수백 번 부르며 스테이지를 바꾸므로, 전역이면 스테이지
// 1 의 커버로 스테이지 5 를 놓는다. 조용히 틀리고 아무 테스트도 안 걸린다.
// `state.stage` 를 같이 들고 있는 것은 같은 `g` 로 판을 갈아탈 수 있어서다.
//
// 행 개방(w8/w15)은 **후보 목록만** 바꾸고 커버 값은 안 바꾸므로 판당 1회로 충분하다.
// 커버를 후보 목록과 같이 캐시하면 개방 직후 새 행이 영영 안 뽑힌다.
const coverCache = new WeakMap();

function coverTable(g) {
  const hit = coverCache.get(g);
  if (hit && hit.stage === g.state.stage) return hit.cov;

  const { BOARD_W, BOARD_H } = g.CFG;
  const inBoard = [];
  for (const key of g.pathCells) {
    const [x, y] = key.split(',').map(Number);
    if (x >= 0 && x < BOARD_W && y >= 0 && y < BOARD_H) inBoard.push([x, y]);
  }
  const table = new Int32Array(BOARD_W * BOARD_H);
  for (let y = 0; y < BOARD_H; y++)
    for (let x = 0; x < BOARD_W; x++) {
      let n = 0;
      for (const [px, py] of inBoard) if (Math.hypot(px - x, py - y) <= COVER_RANGE) n++;
      table[y * BOARD_W + x] = n;
    }

  const cov = (x, y) => table[y * BOARD_W + x];
  coverCache.set(g, { stage: g.state.stage, cov });
  return cov;
}

// ── 종류별 자리 점수 (#48) ───────────────────────────────────
// 일곱 종이 커버 하나로 자리를 고르면 **자리 선택이 곧 성능인 타워**만 손해를 본다.
// `npm run affinity`(35덱 x 8회 · seed 12345)로 재면 판이 어려워질수록 정확히 둘만
// 음수로 벌어졌다 — ③ −.060/−.022 · ⑤ −.111/−.058 · ⑥ **−.175/−.069**(박격포/마력로).
// 나머지 다섯은 0 이거나 양수다. 그 둘이 KINDS 의 `how` 가 자리를 지정하는 종류다:
//
//   박격포  '적이 줄지어 오는 직선을 덮는다'    폭발 반경 0.8 · 원 판정
//   마력로  '통로와 나란히 놓아야 한 줄을 꿴다'  blurb '직선 관통. 배치 각도가 곧 성능'
//
// **판정식을 여기서 다시 쓰지 않는다.** 게임에서 불러 온다 — 폭발은 `BLAST_RADIUS`
// 와 `updateShells` 의 원 판정, 관통은 `BEAM_HALF` 와 마력로 분기의 투영·수직거리
// 판정, 사거리는 `towerRange`·`distTo` 다. 베끼면 게임과 시뮬이 갈리고, 그건 이
// 파일이 `COVER_RANGE` 로 이미 한 번 데인 자리다(위 주석).
//
// **관측소·오라·조폐소는 커버 그대로 둔다.** 바꿀 근거가 없다 — affinity 에서 그
// 넷은 음수가 아니고, 관측소의 how(「뒤쪽 안전한 칸」)는 커버가 이미 대충 맞춘다.
// 조폐소가 공격도 안 하면서 통로 옆 좋은 칸을 먹는 문제는 그대로 남아 있다
// (tools/place.js 머리). 이 티켓이 잰 것은 「자를 바꾼 둘」이라 나머지를 같이 만지면
// affinity 전후 비교에서 원인 귀속이 안 된다.

// 경로를 칸보다 잘게 뜬 표본. 진행 거리 `PATH_STEP` 칸마다 `posAt` 을 부른다.
//
// **박격포는 칸 단위로는 원리적으로 아무것도 못 잰다.** 폭발 반경 0.8 이 칸 간격
// 1.0 보다 **작아서**, 경로 칸 중심만 세면 어느 칸에 떨어져도 걸리는 칸이 자기
// 자신 하나뿐이라 모든 자리의 점수가 똑같아진다. 이건 튜닝이 아니라 격자 해상도의
// 문제라 표본을 잘게 뜨는 것 말고 방법이 없다.
//
// **레인마다 따로 뜨고 겹치는 구간을 합치지 않는다.** `coverTable` 이 쓰는
// `pathCells` 는 Set 이라 ④ 역류처럼 두 레인이 같은 칸을 지나면 한 번만 세는데,
// 폭발과 관통에 걸리는 것은 칸이 아니라 **그 자리를 지나는 적**이라 레인이 겹치면
// 실제로 두 배다. 두 자가 다른 것을 재는 게 맞고, 그래서 표도 따로 둔다.
//
// **보드 밖도 안 자른다.** 레인 시작점이 `x = -1` 인데 적은 거기에 진짜로 있고
// `enemiesInRange` 도 보드 경계를 안 본다. 커버 표는 `paths.js` 와 맞추려고 자르지만
// 이쪽은 게임 판정을 따라간다.
const PATH_STEP = 0.2;

function pathSamples(g) {
  const xs = [], ys = [];
  for (let lane = 0; lane < g.lanes.length; lane++) {
    const len = g.laneLen(lane);
    for (let d = 0; d <= len; d += PATH_STEP) {
      const p = g.posAt(d, lane);
      xs.push(p.x); ys.push(p.y);
    }
  }
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys), n: xs.length };
}

// 점수 표는 **`g` 인스턴스마다 · 스테이지마다** 다시 만든다. `coverTable` 과 같은
// 규칙이고 이유도 같다 — 모듈 전역에 두면 스테이지 1 의 표로 스테이지 5 를 놓는다.
function memo(cache, g, build) {
  const hit = cache.get(g);
  if (hit && hit.stage === g.state.stage) return hit.score;
  const score = build(g);
  cache.set(g, { stage: g.state.stage, score });
  return score;
}

// 「1성 무분기」로 재는 이유: 자리는 소환 시점에 정해지는데 그때 성급도 분기도 1/무다.
// 분기 계수(폭발 A 0.8 / B 1.4, 사거리 오라군 A 1.5 / B 0.85)는 나중에 곱해지므로
// 자리끼리의 **순위**를 안 바꾼다 — 순위만 쓰는 자라 여기서 안 본다.
const probeTower = (kind, gx, gy) => ({ kind, star: 1, gx, gy });

// ── 박격포: 폭발이 경로를 얼마나 덮는가 ───────────────────────
// 포탄은 **적이 있는 자리**에 떨어진다(`targets[0]` 을 겨냥). 그러니 자리의 값은
// 「사거리 안에 적이 얼마나 있나」x「그 자리에 떨어졌을 때 몇을 같이 덮나」이고,
// 적이 경로를 따라 고르게 있다고 보면 그대로
//
//   점수(x,y) = Σ (사거리 안 표본 i) 폭발크기(i)
//   폭발크기(i) = |{ j : hypot(p_j − p_i) <= BLAST_RADIUS }|      ← updateShells 와 같은 식
//
// 가 된다. 사거리 안 표본이 없으면 0 이라 커버처럼 통로에서 먼 칸을 자동으로 버린다.
//
// **「직선이 좋다」는 가설이었고 이 식은 그 반대를 낸다.** 곧은 통로에서는 반경 0.8
// 짜리 원이 경로를 1.6칸만 덮는데, 직각으로 꺾이는 자리에 떨어지면 두 팔을 비스듬히
// 물어 2.0칸 넘게 덮는다(원 중심을 모서리 안쪽으로 조금 밀면 팔마다 1.04칸). 즉
// 이 식이 실제로 상을 주는 것은 **직선이 아니라 꺾임과 레인이 겹치는 곳**이다.
// KINDS.mortar.how 의 「줄지어 오는 직선」은 5성 탄막(A1)이 세 발을 경로를 따라
// 늘어놓는 것을 말하는 것이고(index.html 박격포 주석), **무분기 1발의 자리값과는
// 다른 이야기**다. 가설과 다르게 나왔으므로 가설을 안 따랐다.
const blastCache = new WeakMap();

function blastTable(g) {
  return memo(blastCache, g, () => {
    const { xs, ys, n } = pathSamples(g);
    const R = g.BLAST_RADIUS;
    const size = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = 0; j < n; j++)
        if (Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) <= R) c++;
      size[i] = c;
    }

    const { BOARD_W, BOARD_H } = g.CFG;
    const range = g.towerRange(probeTower('mortar', 0, 0));
    const table = new Float64Array(BOARD_W * BOARD_H);
    for (let y = 0; y < BOARD_H; y++)
      for (let x = 0; x < BOARD_W; x++) {
        const t = probeTower('mortar', x, y);
        let s = 0;
        for (let i = 0; i < n; i++)
          if (g.distTo(t, { x: xs[i], y: ys[i] }) <= range) s += size[i];
        table[y * BOARD_W + x] = s;
      }
    return (x, y) => table[y * BOARD_W + x];
  });
}

// ── 마력로: 빔이 실제로 꿰는 양 ──────────────────────────────
// 게임은 **사거리 안의 적 하나하나를 향해 쏴 보고 가장 많이 꿰는 방향을 고른다**
// (index.html 마력로 분기). 그 루프를 그대로 두고 적 자리에 경로 표본을 넣는다:
//
//   점수(x,y) = max (겨냥 표본 a) |{ j : 0 <= proj_j <= r, |cross_j| <= BEAM_HALF }|
//
// `proj`·`cross` 도 게임 식 그대로다. 겨냥 후보는 **사거리 안**(`distTo`, 정사각형)
// 표본이고, 맞는 쪽은 사거리 밖이어도 된다 — 게임도 `state.enemies` 전체를 훑고
// 투영 길이 `r` 로만 자른다.
//
// **겨냥은 `AIM_STRIDE` 칸마다만 해 본다.** 표본마다 다 해 보면 표본수의 제곱이라
// 판마다 수천만 번이 되는데, 겨냥 표본을 경로 1칸 간격으로 줄여도 각도 후보가
// 통로 방향을 다 훑는다(빔 반폭 0.7 이 그보다 넓다). 맞는 쪽은 안 줄인다.
const AIM_STRIDE = Math.max(1, Math.round(1 / PATH_STEP));
const beamCache = new WeakMap();

function beamTable(g) {
  return memo(beamCache, g, () => {
    const { xs, ys, n } = pathSamples(g);
    const H = g.BEAM_HALF;
    const r = g.towerRange(probeTower('arc', 0, 0));
    // 빔에 걸릴 수 있는 가장 먼 거리. proj <= r 이고 |cross| <= H 이므로 hypot(r, H) 다.
    const reach2 = r * r + H * H;

    const { BOARD_W, BOARD_H } = g.CFG;
    const table = new Float64Array(BOARD_W * BOARD_H);
    for (let y = 0; y < BOARD_H; y++)
      for (let x = 0; x < BOARD_W; x++) {
        const t = probeTower('arc', x, y);
        const c = g.towerCenter(t);
        const aim = [], pool = [];
        for (let i = 0; i < n; i++) {
          const vx = xs[i] + 0.5 - c.x, vy = ys[i] + 0.5 - c.y;
          if (vx * vx + vy * vy <= reach2) pool.push(i);
          if (g.distTo(t, { x: xs[i], y: ys[i] }) <= r) aim.push(i);
        }
        let best = 0;
        for (let a = 0; a < aim.length; a += AIM_STRIDE) {
          const i = aim[a];
          const ax = xs[i] + 0.5 - c.x, ay = ys[i] + 0.5 - c.y;
          const len = Math.hypot(ax, ay);
          // 겨냥점이 타워 중심과 정확히 겹치면 **방향이 없다.** 게임은 `|| 1` 로
          // 0 을 피하는데 그러면 dx=dy=0 이라 투영도 수직거리도 전부 0 이 되어
          // 「보드 전체를 꿴다」가 나온다. 게임에서는 적이 연속 좌표라 사실상 못
          // 일어나지만 경로 표본은 격자점을 정확히 밟으므로 실제로 걸린다.
          // 그런 칸은 전부 경로 칸이라 애초에 못 놓는다 — 방향이 아닌 것에
          // 점수를 주느니 그 겨냥은 건너뛴다.
          if (len === 0) continue;
          const dx = ax / len, dy = ay / len;
          let cnt = 0;
          for (const j of pool) {
            const vx = xs[j] + 0.5 - c.x, vy = ys[j] + 0.5 - c.y;
            const proj = vx * dx + vy * dy;
            if (proj < 0 || proj > r) continue;
            if (Math.abs(vx * dy - vy * dx) > H) continue;
            cnt++;
          }
          if (cnt > best) best = cnt;
        }
        table[y * BOARD_W + x] = best;
      }
    return (x, y) => table[y * BOARD_W + x];
  });
}

// 이 종류는 어느 자로 자리를 고르는가. **여기가 유일한 분배 지점이다** —
// `tools/place.js` 의 계측과 `tools/test.js` 의 백분위 게이트도 이 함수를 부른다.
// 두 벌이 되면 「고르는 자」와 「재는 자」가 갈려서 백분위가 아무것도 안 잠근다
// (place.js 머리가 강제 선택 처리로 이미 한 번 겪은 자리다).
//
// 자 **이름**도 여기서 나눈다. 계측 쪽에서 따로 이름을 매기면 「표에는 커버라고
// 적혀 있는데 실제로는 폭발 표로 골랐다」가 조용히 성립한다.
const SPOT_RULER = { mortar: '폭발', arc: '관통' };
function spotRuler(kind) { return SPOT_RULER[kind] || '커버'; }

function spotScore(g, kind) {
  const ruler = spotRuler(kind);
  if (ruler === '폭발') return blastTable(g);
  if (ruler === '관통') return beamTable(g);
  return coverTable(g);
}

// k-표본 최고. 후보에서 **복원추출로** `k` 칸을 뽑아 점수가 가장 큰 칸을 준다.
//
// 난수는 후보 수와 무관하게 **정확히 `k` 회**다. 후보가 1 개여도 `k` 회를 뽑는다 —
// 회계가 단순해야 `seedcheck` 의 「호출 지점별로 갈라 세기」가 성립한다.
// 후보가 0 개인 경우는 여기까지 오지 않는다(호출부가 먼저 걸러 낸다).
//
// 동점이면 **먼저 뽑힌 표본**이 이긴다(`>` 비교). `k = 1` 에서 뽑은 인덱스를 그대로
// 쓰는 것과 같아야 퇴화값이 옛 동작과 비트 단위로 같다.
//
// **점수 함수는 인자로 받는다** — `cov` 라는 이름은 커버 하나뿐이던 시절의 것이고,
// #48 부터 박격포·마력로는 다른 표가 들어온다(위 `spotScore`). 이 함수가 아는 것은
// 「뽑은 것 중 큰 쪽」뿐이라 자를 바꿔도 여기는 안 움직인다.
//
// 복원추출이라 「전역 최고 칸」으로 뭉치지 않는다. 항상 최고 칸을 고르게 하면(k→∞)
// 최고 칸이 차고 그 옆이 다음 최고라 한 주머니에 겹겹이 쌓이고, 경로의 나머지가
// 무방비가 된다 — PM 실측으로 그쪽이 오히려 나쁘다. 흩어짐이 남는 것이 이 규칙의
// 성질이고, 최악 칸을 뽑을 확률이 `(1-q)^k` 로만 줄어드는 것도 같은 이야기다.
function pickSpot(spots, cov, k) {
  let bestIdx = 0, bestCov = -Infinity;
  for (let i = 0; i < k; i++) {
    const idx = (Math.random() * spots.length) | 0;
    const c = cov(spots[idx][0], spots[idx][1]);
    if (c > bestCov) { bestCov = c; bestIdx = idx; }
  }
  return spots[bestIdx];
}

// ── 그리디 플레이어 ──────────────────────────────────────────
// 실력 좋은 플레이어가 아니라 "평균 이하로 대충 하는 플레이어"를 흉내낸다.
// 이 플레이어가 클리어해버리면 게임이 너무 쉬운 것이고,
// 초반에 죽으면 너무 어려운 것이다.
function greedy(g, opts = {}) {
  const { state, CFG } = g;
  const branch3 = opts.branch3 || 'A';
  const branch5 = opts.branch5 || 'A1';
  // 배치 정책 노브. **계측 전용 통로다** — 출시 값은 위 `SUMMON_SAMPLES` 하나이고,
  // `tools/place.js` 가 k 를 훑거나 `tools/seedcheck.js` 가 퇴화값(1)으로 옛 동작과의
  // 동일성을 재는 데만 넘긴다. 밸런스 수치를 뜰 때 여기에 값을 넘기면 그 표는
  // 출시되는 시뮬을 잰 게 아니다.
  //
  // **오용은 시끄럽게 죽는다.** 주석만으로 막으면 전부 조용히 틀린 표가 된다:
  //   `0`·`NaN`  `||` 폴백이라 조용히 2 가 되고 「k=0 행」에 k=2 숫자가 찍힌다
  //   `-1`       `pickSpot` 루프가 0회라 **항상 `spots[0]` · 난수 0회**. S5 가
  //              w18 → w5 로 무너지는데 예외도 경고도 없다
  //   `2.5`      3회 뽑으면서 헤더는 「기대 백분위 0.71」이라고 거짓말을 한다
  // 그래서 `??` 로 0 을 살려 받은 뒤 정수 1 이상만 통과시킨다.
  const samples = opts.samples ?? SUMMON_SAMPLES;
  if (!Number.isInteger(samples) || samples < 1)
    throw new TypeError(`opts.samples 는 1 이상의 정수라야 한다 (받은 값: ${opts.samples})`);

  // 스테이지/덱 선택 화면을 건너뛴다.
  if (state.phase === 'stage') {
    g.loadStage(opts.stage || 0);
    state.phase = 'deck';
    state.deckPick = [];
  }
  if (state.phase === 'deck') {
    const deck = opts.deck || (state.deck.length ? state.deck : null);
    if (deck) state.deckPick = deck.slice(0, CFG.DECK_SIZE);
    else { g.rollDeck(); state.deckPick = state.deck.slice(); }
    g.startRun();
    // **오용은 시끄럽게 죽는다** — 위 `samples` 검사와 같은 규칙이다. 제약 판
    // (`allowKinds`)에 못 고르는 덱을 주면 `startRun` 이 조용히 거절하고, 그러면
    // 아래 while 이 `phase === 'deck'` 인 채로 4000초를 돌다 **웨이브 0 짜리 결과**를
    // 낸다. 그 수가 표에 그대로 찍히면 「제약 판은 진도가 0 이구나」로 읽힌다.
    if (state.phase === 'deck') {
      const allow = g.allowedKinds();
      const bad = state.deckPick.filter(k => !allow.includes(k));
      throw new TypeError(bad.length
        ? `이 판이 안 받는 종류: ${bad.join(',')} (허용: ${allow.join(',')})`
        : `덱이 ${CFG.DECK_SIZE}종이 아니다: ${state.deckPick.join(',')}`);
    }
  }

  function resolveChoice() {
    while (state.choice) {
      const c = state.choice;
      let pick;
      // 물려받기는 첫 부모를 고른다 — 조용히 a 를 취했던 옛 동작과 같은 결과라
      // 밸런스 시뮬 숫자가 이 변경으로 흔들리지 않는다.
      if (c.mode === 'inherit') pick = 0;
      else if (c.tier === 3) pick = branch3;
      else if (c.tier === 5) pick = c.options.includes(branch5) ? branch5 : c.options[0];
      else pick = c.options[0];
      g.applyChoice(pick);
    }
  }

  function mergeAll() {
    let acted = true;
    while (acted) {
      acted = false;
      outer:
      for (let i = 0; i < state.towers.length; i++) {
        for (let j = i + 1; j < state.towers.length; j++) {
          const a = state.towers[i], b = state.towers[j];
          if (!g.canMerge(a, b)) continue;
          const before = state.towers.length;
          g.mergeTowers(a, b);
          resolveChoice();
          if (state.towers.length < before) { acted = true; break outer; }
        }
      }
    }
  }

  // 자리를 sim 쪽에서 고른다. 배치 규칙은 **밸런스 시뮬의 성질**이지 게임의 성질이
  // 아니고, `index.html` 은 이 티켓에서 한 줄도 안 고쳤다(무좌표 분기는 그대로
  // 남아 있고 `tools/shot.js`·`tools/test.js` 가 여전히 쓴다).
  //
  // **난수 소비는 소환당 정확히 `samples` 회다 — 옛 동작(1회)과 다르다.**
  // `k = 1` 로 두었을 때에만 옛 스트림과 비트 단위로 같고(뽑은 인덱스를 그대로
  // 쓰는 것과 같은 식이 된다), **그 성질은 `tools/seedcheck.js` 의 퇴화값 블록이
  // 잠근다.** 출시값 `k = 2` 에서는 세 케이스가 전부 움직였다
  // (rand 205 → 401 · 131 → 305 · 595 → 734). 스트림을 다시 만질 사람은
  // seedcheck 의 「호출 지점별로 갈라 센 표」를 먼저 볼 것.
  //
  // 후보가 0 개면 `summon` 을 **아예 안 부른다.** 옛 동작도 그 경우 난수를 안 뽑고
  // 「빈 칸 없음」 토스트만 냈으므로 등가이고, 없는 후보에서 `k` 회를 뽑아 스트림을
  // 미는 것을 막는 자리이기도 하다.
  //
  // **종류를 자리보다 먼저 정한다(#48).** 자를 종류마다 다르게 쓰려면 순서가 이래야
  // 한다. `pickKind` 는 난수를 한 번도 안 뽑고 상태도 안 바꾸므로 **이 자리바꿈만으로는
  // 난수 스트림이 안 움직인다** — 움직이는 것은 `spotScore` 가 다른 표를 줄 때뿐이고,
  // 그래서 자를 안 바꾼 덱(seedcheck 0번 `파쇄·관측·조폐`)은 rand 401 이 그대로다.
  function summonOne() {
    if (state.gold < g.summonCost()) return;
    const spots = summonSpots(g);
    if (!spots.length) return;
    const kind = pickKind(state.deck, state.towers);
    const [gx, gy] = pickSpot(spots, spotScore(g, kind), samples);
    g.summon(kind, gx, gy);
  }

  function buildPhase() {
    let guard = 0;
    while (guard++ < 400) {
      const before = state.towers.length;
      summonOne();
      if (state.towers.length === before) break;
      mergeAll();
    }
    mergeAll();
  }

  const dt = 1 / 30;
  let elapsed = 0;
  while (state.phase !== 'over' && state.phase !== 'clear' && elapsed < 4000) {
    if (state.phase === 'build') {
      buildPhase();
      g.rushWave();
    }
    g.update(dt);
    elapsed += dt;
  }

  return {
    result: state.phase,
    wave: state.wave,
    life: state.life,
    towers: state.towers.map(t => t.kind + t.star).sort(),
    maxStar: state.towers.reduce((m, t) => Math.max(m, t.star), 0),
    gold: Math.round(state.gold),
  };
}

module.exports = {
  load, greedy, patch, pickKind, summonSpots, coverTable, pickSpot, SUMMON_SAMPLES,
  // 종류별 자리 점수(#48). `spotScore` 가 계측·게이트가 부르는 정문이고, 표 둘은
  // `tools/test.js` 가 게임 판정으로 독립 계산한 값과 칸마다 대조하려고 같이 낸다.
  spotScore, spotRuler, blastTable, beamTable, PATH_STEP,
};
