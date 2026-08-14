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
// **2 를 고른 근거는 최소성이다.** ⑤ 분수령 조기 전멸(`w<10`)을 `npm test` 의 밸런스
// 덱(`shredder·arc·mint`)으로 **1000판씩** 재면 이렇다:
//
//   k    S5 w<10           8판 중 2판 이상이 무너질 확률(= 게이트가 걸린다)
//   1    17/1000 (1.7%)    0.756%
//   2     6/1000 (0.6%)    0.098%     ← 채택
//   3     2/1000 (0.2%)    0.011%
//
// 오른쪽 칸은 `1 - (1-p)^8 - 8p(1-p)^7` 이다. p=0.002 이면 0.0111% 로, 지배항
// `C(8,2)p²(1-p)⁶` 만 봐도 같은 값이 나온다(검산해 볼 것 — 한 번 틀리게 세어졌다).
//
// **꼬리는 0 이 아니다 — 얇아질 뿐이다.** 200판으로 재면 k=2 가 0/200 으로 나오는데
// 그건 0.6% 를 200판으로 보는 것이라 30% 확률로 그렇게 나오는 것뿐이고, 「없앴다」로
// 읽으면 안 된다. 2 를 고른 것은 **꼬리가 `npm test` 를 흔드는 것을 멈추는 데
// 필요한 최소한**이기 때문이다 — 0.76% → 0.10% 면 이 스위트의 다른 무작위 요인보다
// 한참 아래로 내려간다(PM 실측 무작위 실패율 약 3%). 3 으로 올려서 더 얻는 것은
// 0.09%p 인데, 그 대가로 그리디가 더 잘 놓아 판이 쉬워지고 `tune` 실배포 행의
// 진도 p 가 더 올라간다. **「대충」의 정의는 꼬리를 재우는 데 필요한 최소한의
// 실력이고 그 이상 잘하게 만들지 않는다.** 측정 표는 DESIGN §꼬리를 재는 자에 있다.
const SUMMON_SAMPLES = 2;

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
const { RANGE: COVER_RANGE } = require('./paths.js');

// 그리기 호출을 기록할 수 있는 캔버스 스텁.
// log 를 넘기면 호출한 메서드 이름이 순서대로 쌓인다. "무엇이 화면에 나왔나"를
// 헤드리스에서 볼 수 있는 유일한 창이다 — 상태만 검사하면 drawXxx() 호출을
// 통째로 지워도 테스트가 전부 통과한다(실제로 그랬다).
function stubCtx(log) {
  return new Proxy({}, {
    get(_, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return {};
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
  'SPR', 'sprite', 'snapshotRun', 'restoreRun', 'saveBundle', 'applyBundle', 'mergeBundle', 'STAGES', 'loadStage', 'lanes', 'pickStage', 'stageCardRects', 'laneLen',
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
];

function load(overrides) {
  const html = fs.readFileSync(HTML, 'utf8');
  const js = patch(html.split('<script>')[1].split('</' + 'script>')[0], overrides);
  // 본 화면만 기록한다. 스프라이트를 굽는 오프스크린 캔버스까지 세면
  // 처음 그릴 때 굽는 도트 수백 줄이 섞여서 못 쓴다.
  const drawLog = [];
  const canvas = { getContext: () => stubCtx(drawLog), addEventListener: () => {}, width: 0, height: 0, style: {} };

  const store = new Map();
  const localStorageStub = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };

  const audio = makeAudio();

  const fn = new Function('document', 'window', 'performance', 'requestAnimationFrame', 'localStorage',
    js + '\nreturn {' + EXPOSE.join(',') + '};');
  const api = fn(
    {
      getElementById: () => canvas,
      // 스프라이트를 오프스크린 캔버스에 굽는다
      createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx() }),
    },
    {
      innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener: () => {},
      AudioContext: audio.AudioContext,
    },
    { now: () => 0 },
    () => {},
    localStorageStub,
  );

  // 마지막 render 가 본 화면에 무엇을 그렸는지 세는 창.
  //   g.draws.reset(); g.render(); g.draws.count('fill')
  api.draws = {
    log: drawLog,
    reset() { drawLog.length = 0; },
    count(...names) { return drawLog.filter(n => names.includes(n)).length; },
  };
  // 오디오 시계를 앞으로 감는 창. 큐 쿨다운은 게임 dt 가 아니라 이 시계로 잰다.
  //   g.sfxUnlock(); g.audio.advance(0.06); g.sfx('shot')
  api.audio = audio.api;
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

// k-표본 최고. 후보에서 **복원추출로** `k` 칸을 뽑아 커버가 가장 큰 칸을 준다.
//
// 난수는 후보 수와 무관하게 **정확히 `k` 회**다. 후보가 1 개여도 `k` 회를 뽑는다 —
// 회계가 단순해야 `seedcheck` 의 「호출 지점별로 갈라 세기」가 성립한다.
// 후보가 0 개인 경우는 여기까지 오지 않는다(호출부가 먼저 걸러 낸다).
//
// 동점이면 **먼저 뽑힌 표본**이 이긴다(`>` 비교). `k = 1` 에서 뽑은 인덱스를 그대로
// 쓰는 것과 같아야 퇴화값이 옛 동작과 비트 단위로 같다.
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
  function summonOne() {
    if (state.gold < g.summonCost()) return;
    const spots = summonSpots(g);
    if (!spots.length) return;
    const [gx, gy] = pickSpot(spots, coverTable(g), samples);
    g.summon(pickKind(state.deck, state.towers), gx, gy);
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

module.exports = { load, greedy, patch, pickKind, summonSpots, coverTable, pickSpot, SUMMON_SAMPLES };
