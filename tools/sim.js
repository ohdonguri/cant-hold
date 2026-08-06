// index.html 을 Node 에서 헤드리스로 돌리기 위한 로더 + 그리디 플레이어.
// 밸런스 상수를 시뮬레이션으로 역산하는 데 쓴다. 렌더 결과는 검증하지 않는다.
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'index.html');

function stubCtx() {
  return new Proxy({}, {
    get(_, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return {};
      return () => {};
    },
    set() { return true; },
  });
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
  'waveHp', 'summon', 'summonCost', 'canPlace', 'occupancy', 'firstOpenRow',
  'canMerge', 'mergeTowers', 'applyChoice', 'rushWave', 'towerDmg', 'towerCd',
  'towerRange', 'towerFootprint', 'aimArc', 'posAt', 'PATH_LEN', 'buildSpawnQueue',
  'BRANCH', 'TRAITS', 'TRAIT_KEYS', 'mergeCost', 'isPath', 'PATH_CELLS',
  'applyStacks', 'debuffScale', 'effArmor', 'effMres',
  'applyArmor', 'spawnEnemy', 'rollDeck', 'damage',
  'render', 'restart', 'choiceRects', 'openChoice', 'selectedTower', 'buttons',
  'startRun', 'toggleDeckPick', 'deckCardRects', 'deckStartRect',
];

function load(overrides) {
  const html = fs.readFileSync(HTML, 'utf8');
  const js = patch(html.split('<script>')[1].split('</' + 'script>')[0], overrides);
  const canvas = { getContext: () => stubCtx(), addEventListener: () => {}, width: 0, height: 0, style: {} };
  const fn = new Function('document', 'window', 'performance', 'requestAnimationFrame',
    js + '\nreturn {' + EXPOSE.join(',') + '};');
  return fn(
    { getElementById: () => canvas },
    { innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener: () => {} },
    { now: () => 0 },
    () => {},
  );
}

// ── 그리디 플레이어 ──────────────────────────────────────────
// 실력 좋은 플레이어가 아니라 "평균 이하로 대충 하는 플레이어"를 흉내낸다.
// 이 플레이어가 클리어해버리면 게임이 너무 쉬운 것이고,
// 초반에 죽으면 너무 어려운 것이다.
function greedy(g, opts = {}) {
  const { state, CFG } = g;
  const branch3 = opts.branch3 || 'A';
  const branch5 = opts.branch5 || 'A1';

  // 덱 선택 화면을 건너뛴다. opts.deck 이나 미리 세팅된 state.deck 을 쓰고,
  // 둘 다 없으면 무작위로 뽑는다.
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
      if (c.tier === 3) pick = branch3;
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

  // 종류를 고를 수 있게 된 뒤의 플레이를 흉내낸다.
  // 가장 낮은 성급에서 짝이 안 맞는 종류를 골라 바로 합성으로 잇는다.
  function pickKind() {
    let best = null, bestStar = Infinity, bestCount = Infinity;
    for (const k of state.deck) {
      const own = state.towers.filter(t => t.kind === k);
      const byStar = {};
      for (const t of own) byStar[t.star] = (byStar[t.star] || 0) + 1;
      const odd = Object.keys(byStar).map(Number)
        .filter(s => byStar[s] % 2 === 1)
        .sort((a, b) => a - b)[0];
      const star = odd === undefined ? Infinity : odd;
      if (star < bestStar || (star === bestStar && own.length < bestCount)) {
        bestStar = star; bestCount = own.length; best = k;
      }
    }
    return best || state.deck[0];
  }

  function buildPhase() {
    let guard = 0;
    while (guard++ < 400) {
      const before = state.towers.length;
      if (state.gold >= g.summonCost()) g.summon(pickKind());
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

module.exports = { load, greedy, patch };
