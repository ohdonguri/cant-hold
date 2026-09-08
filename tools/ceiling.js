// 천장 시뮬 — **「무엇을 해도 못 깨는 판」이 있는가**를 재는 자다.
//
//   node tools/ceiling.js            한 판 (STAGE=17)
//   node tools/ceiling.js --all      스무 판
//   node tools/ceiling.js --stages=16,17,18   판을 골라서
//   CFG_OVERRIDE='{"HP_KNEE":26}' node tools/ceiling.js --all
//
// ── 왜 그리디로는 이걸 못 재는가 ──────────────────────────────
// `tools/curve.js` 의 `p` 도 `tools/test.js` 의 게이트도 **그리디가 어디서 죽는가**를
// 잰다. 그리디는 「대충 하는 플레이어」라 평균 w18~20 에서 죽으므로, 그 자로는
// **w40 에 벽이 서 있어도 아무것도 안 읽힌다** — 실제로 ⑯⑰⑱ 은 curve 표에서
// `p` 0.43~0.45 로 ⑮ 와 나란히 앉아 있었는데 사람이 최선을 다해도 못 깨는 판이었다.
// 「어렵다」와 「불가능하다」는 다른 축이고, 이 파일이 뒤쪽 축이다.
//
// ── 무엇을 「천장」이라 부르는가 ──────────────────────────────
// **골드가 무한하고 자리를 다 채운 보드**다. 매 빌드 페이즈마다 빈 칸이 없어질
// 때까지 소환하고 합칠 수 있는 것은 다 합친다. 사람이 이보다 잘할 수는 없다 —
// 골드는 유한하고 자리 선택도 이만큼 좋을 수 없다. 그래서 **이 보드가 못 깨면
// 아무도 못 깬다**가 성립하고, 반대로 이 보드가 깬다고 사람이 깬다는 뜻은 아니다.
// **이 자는 하한만 판정한다.** 난이도의 눈금은 여전히 `curve.js` 다.
//
// ── 표를 읽는 법: 「최악 도달」이 총웨이브에 닿았는가 ──────────
// 클리어가 8/8 이 아닌 줄은 두 가지로 갈린다. **「최악 도달」이 총웨이브보다 짧으면
// 벽이다** — 마지막 웨이브를 보지도 못했다는 뜻이라 아무도 못 깬다. 총웨이브에
// 닿았는데 실패했으면 **빠듯한 것이지 벽이 아니다** — 마지막 웨이브에서 갈렸고
// 배합·자리를 바꾸면 넘어간다. ③ 갈래길·④ 역류가 뒤쪽인데(30/30 에서 6~7/8),
// 보드가 작아 7성이 둘밖에 안 서는 판에 고정 배합을 그대로 씌운 탓이다.
// **그 둘은 `HP_KNEE` 와 무관하다** — 30웨이브 판이라 무릎이 한 번도 안 걸린다.
// 통계가 아니라 산술이다: `waveHp` 는 `min(wave, HP_KNEE)` 를 쓰므로 w1~w30 이
// **무릎 유무로 비트 단위까지 같고**, 갈리기 시작하는 것은 w31 부터다.
// 30웨이브 판의 어느 줄이 흔들려도 그건 이 자의 표본 노이즈이지 무릎이 아니다.
//
// ── 자리와 종류는 최선을 흉내 낸다 ────────────────────────────
// 자리는 `spotScore` 를 40회 뽑아 고르므로 사실상 최고 칸이다(그리디는 6회).
// 종류는 `--force` 비율로 채운다 — 기본값 `marksman:8,shredder:2` 는 여러 배합을
// 훑어 ⑰ 에서 가장 멀리 간 것이고(단일 8종 · 2종 · 3종 조합 다섯을 재서 w38~41),
// 나눗셈은 **성급이 아니라 소환 횟수**로 센다(7성 하나 = 1성 64개).
// `pickKind`(게임의 그리디 규칙)로 두면 서포트가 과하게 섞여 두 웨이브를 손해 본다.
//
// ── 이 자로 무엇을 고쳤는가 ──────────────────────────────────
// `CFG.HP_KNEE` · `CFG.HP_GROWTH_LATE`. 근거 표는 index.html 의 그 두 줄과
// `waveHp` 주석에 있다. **여기에 값을 베끼지 않는다** — 자와 눈금을 한 파일에 두면
// 값을 고쳤을 때 어느 쪽이 움직인 것인지 다음 사람이 못 가른다(sim.js §커버를 재는
// 사거리와 같은 규칙).
const { load, summonSpots, pickKind, pickSpot, spotScore } = require('./sim.js');

const CFG_OVERRIDE = process.env.CFG_OVERRIDE ? JSON.parse(process.env.CFG_OVERRIDE) : {};
const ALL = process.argv.includes('--all');
const argOf = name => {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : null;
};
const STAGE = Number(argOf('stage') || process.env.STAGE || 17) - 1;
const DECK = (argOf('deck') || process.env.DECK || 'marksman,shredder,eroder').split(',');
const FORCE = (argOf('force') || process.env.FORCE || 'marksman:8,shredder:2')
  .split(',').map(s => { const [kind, n] = s.split(':'); return { kind, n: Number(n || 1) }; });
// 판 배율을 덮어쓰고 재는 통로. `CFG_OVERRIDE` 와 같은 이유로 있다 —
// 손잡이를 고를 때 `index.html` 을 안 고치고 잰다(curve.js §CFG_OVERRIDE).
//   --hpmult=16:1.0,17:1.0     판 번호는 1부터다
const HP_MULT = Object.fromEntries((argOf('hpmult') || '').split(',').filter(Boolean)
  .map(s => { const [i, v] = s.split(':'); return [Number(i) - 1, Number(v)]; }));
const B3 = argOf('b3') || 'B';
const B5 = argOf('b5') || 'B1';
// **반드시 여러 번 돌린다.** `pickSpot` 이 `Math.random` 을 쓰므로(sim.js) 한 판이
// 한 번의 표본이다. ⑰ 톱날은 같은 설정에서 46/46 클리어와 46/46 실패가 둘 다 나온다 —
// 「깨지는가」를 한 번 돌려 읽으면 그 자리에서 틀린다. 「몇 번 중 몇 번 깨지는가」로 읽어라.
const TRIALS = Number(argOf('trials') || process.env.TRIALS || 8);

// 소환 횟수 기준으로 목표 비율에 가장 모자란 종류를 고른다. 성급으로 세면
// 7성 하나가 1성 하나와 같은 무게가 되어 비율이 뜻을 잃는다.
function forceKind(towers) {
  const have = {};
  for (const t of towers) have[t.kind] = (have[t.kind] || 0) + Math.pow(2, t.star - 1);
  const total = Object.values(have).reduce((a, b) => a + b, 0) || 1;
  const want = FORCE.reduce((a, f) => a + f.n, 0);
  let best = FORCE[0], gap = -Infinity;
  for (const f of FORCE) {
    const d = f.n / want - (have[f.kind] || 0) / total;
    if (d > gap) { gap = d; best = f; }
  }
  return best.kind;
}

function run(stage, deck) {
  const g = load(CFG_OVERRIDE);
  const { state } = g;
  for (const [i, v] of Object.entries(HP_MULT)) g.STAGES[i].hpMult = v;
  g.loadStage(stage);
  state.phase = 'deck';
  state.deckPick = deck.slice();
  g.startRun();
  if (state.phase === 'deck') throw new TypeError(`이 판이 안 받는 덱: ${deck.join(',')} (허용: ${g.allowedKinds().join(',')})`);

  const resolveChoice = () => {
    while (state.choice) {
      const c = state.choice;
      const pick = c.mode === 'inherit' ? 0
        : c.tier === 3 ? (c.options.includes(B3) ? B3 : c.options[0])
        : c.tier === 5 ? (c.options.includes(B5) ? B5 : c.options[0])
        : c.options[0];
      g.applyChoice(pick);
    }
  };
  const mergeAll = () => {
    let acted = true;
    while (acted) {
      acted = false;
      outer:
      for (let i = 0; i < state.towers.length; i++)
        for (let j = i + 1; j < state.towers.length; j++) {
          if (!g.canMerge(state.towers[i], state.towers[j])) continue;
          const before = state.towers.length;
          g.mergeTowers(state.towers[i], state.towers[j]);
          resolveChoice();
          if (state.towers.length < before) { acted = true; break outer; }
        }
    }
  };
  // 빈 칸이 없어질 때까지 소환한다. 합치면 자리가 다시 나므로 소환 횟수는 칸 수보다
  // 훨씬 많다(⑰ 에서 700 회 언저리) — guard 는 그 위로 넉넉히 둔다.
  const build = () => {
    for (let guard = 0; guard < 4000; guard++) {
      state.gold = 1e9;
      const spots = summonSpots(g);
      if (!spots.length) break;
      const before = state.towers.length;
      const kind = FORCE.length ? forceKind(state.towers) : pickKind(state.deck, state.towers);
      // 자를 종류마다 다르게 쓴다 — 종류를 먼저 정하고 그 종류의 `spotScore` 로 칸을
      // 고른다(sim.js §종류를 자리보다 먼저 정한다). 40 회는 그리디의 6 회와 달리
      // 사실상 최고 칸이고, 그게 「천장」의 뜻이다.
      g.summon(kind, ...pickSpot(spots, spotScore(g, kind), 40));
      if (state.towers.length === before) break;
      mergeAll();
    }
    mergeAll();
    state.gold = 1e9;
  };

  const dt = 1 / 30;
  let elapsed = 0;
  while (state.phase !== 'over' && state.phase !== 'clear' && elapsed < 20000) {
    if (state.phase === 'build') { build(); g.rushWave(); }
    g.update(dt);
    elapsed += dt;
  }
  const seven = state.towers.filter(t => t.star === g.CFG.STAR_MAX).length;
  return { result: state.phase, wave: state.wave, life: state.life, towers: state.towers.length, seven };
}

function runMany(stage, deck) {
  const rs = [];
  for (let i = 0; i < TRIALS; i++) rs.push(run(stage, deck));
  const clear = rs.filter(r => r.result === 'clear').length;
  const waves = rs.map(r => r.wave).sort((a, b) => a - b);
  const lives = rs.filter(r => r.result === 'clear').map(r => r.life);
  return {
    clear, trials: TRIALS,
    worst: waves[0], best: waves[waves.length - 1],
    life: lives.length ? Math.min(...lives) : 0,
    seven: Math.max(...rs.map(r => r.seven)),
  };
}

const g0 = load(CFG_OVERRIDE);
for (const [i, v] of Object.entries(HP_MULT)) g0.STAGES[i].hpMult = v;   // 표에도 실제로 쓴 값이 찍혀야 한다
const stages = argOf('stages') ? argOf('stages').split(',').map(n => Number(n) - 1)
  : ALL ? g0.STAGES.map((_, i) => i) : [STAGE];
let broken = 0;
console.log(`판          배율  총웨이브  클리어      최악도달  최소생명  7성   (${TRIALS}회)`);
for (const s of stages) {
  const st = g0.STAGES[s];
  // 제약 판은 못 고르는 덱을 주면 안 된다(curve.js §제약 판은 덱 수가 다르다).
  const deck = st.allowKinds
    ? DECK.filter(k => st.allowKinds.includes(k)).concat(st.allowKinds.filter(k => !DECK.includes(k))).slice(0, g0.CFG.DECK_SIZE)
    : DECK;
  const r = runMany(s, deck);
  if (r.clear < r.trials) broken++;
  console.log(
    (String(s + 1) + ' ' + st.name).padEnd(12) +
    String(st.hpMult).padEnd(6) +
    String(st.waves).padStart(4) + '  ' +
    (r.clear + '/' + r.trials).padStart(7) + '  ' +
    (r.clear === r.trials ? '  ' : '← ') +
    (String(r.worst) + '/' + st.waves).padStart(7) + '  ' +
    String(r.life).padStart(6) + '  ' + String(r.seven).padStart(4)
  );
}
const over = [];
if (Object.keys(CFG_OVERRIDE).length) over.push('CFG_OVERRIDE ' + JSON.stringify(CFG_OVERRIDE));
if (Object.keys(HP_MULT).length) over.push('배율 ' + Object.entries(HP_MULT).map(([i, v]) => (Number(i) + 1) + ':' + v).join(' '));
const tag = over.length ? over.join(' · ') + ' — **출시 값이 아니다**' : '출시 값';
console.log(`\n한 번이라도 못 깬 판 ${broken} · 덱 ${DECK.join('·')} · 배합 ${FORCE.map(f => f.kind + ':' + f.n).join(' ')} · ${tag}`);
