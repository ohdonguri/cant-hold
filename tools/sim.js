// index.html 을 Node 에서 헤드리스로 돌리기 위한 로더 + 그리디 플레이어.
// 밸런스 상수를 시뮬레이션으로 역산하는 데 쓴다. 렌더 결과는 검증하지 않는다.
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'index.html');

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

// ── 그리디 플레이어 ──────────────────────────────────────────
// 실력 좋은 플레이어가 아니라 "평균 이하로 대충 하는 플레이어"를 흉내낸다.
// 이 플레이어가 클리어해버리면 게임이 너무 쉬운 것이고,
// 초반에 죽으면 너무 어려운 것이다.
function greedy(g, opts = {}) {
  const { state, CFG } = g;
  const branch3 = opts.branch3 || 'A';
  const branch5 = opts.branch5 || 'A1';

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

  // 자리를 sim 쪽에서 고른다. **동작은 안 바뀐다** — 후보 열거도 뽑는 식도
  // index.html 의 무좌표 분기와 같으므로 난수 소비 지점·횟수·인덱스가 전부 그대로다
  // (`tools/seedcheck.js` 세 케이스가 `expect`·`rand` 한 글자도 안 움직이는 것이
  // 그 증거다). 여기로 옮기는 것 자체가 목적이다 — 배치 규칙은 **밸런스 시뮬의
  // 성질**이지 게임의 성질이 아니고, `index.html` 은 이 티켓에서 한 줄도 안 고친다.
  //
  // 후보가 0 개면 `summon` 을 **아예 안 부른다.** 현행도 그 경우 난수를 안 뽑고
  // 「빈 칸 없음」 토스트만 내므로 등가이고, 뒤에 붙을 정책(표본 k 회)이 없는
  // 후보에서 난수를 뽑아 스트림을 밀지 않게 하는 자리이기도 하다.
  function summonOne() {
    if (state.gold < g.summonCost()) return;
    const spots = summonSpots(g);
    if (!spots.length) return;
    const [gx, gy] = spots[(Math.random() * spots.length) | 0];
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

module.exports = { load, greedy, patch, pickKind, summonSpots };
