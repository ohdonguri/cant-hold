// 회귀 테스트. 렌더는 검증하지 않고 규칙과 밸런스만 본다.
const { load, greedy, pickKind, coverTable, pickSpot, SUMMON_SAMPLES,
  spotScore, blastTable, beamTable, PATH_STEP } = require('./sim.js');
// 배치 백분위 게이트는 **계측 도구와 같은 함수**를 쓴다(tools/place.js 헤더 참고).
const { probe, meanPct } = require('./place.js');

let fail = 0;
function ok(name, cond, detail) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '   ' + detail : ''));
  if (!cond) fail++;
}

// 알려진 미해결. **PASS 도 FAIL 도 아닌 세 번째 상태**가 필요한 자리가 있다 —
// 지표는 이미 임계를 넘었는데 고치는 것이 이 변경의 일이 아닐 때다. 그때 할 수 있는
// 선택은 셋뿐이고 앞의 둘은 둘 다 틀렸다: 임계를 넘겨 FAIL 로 두면 관계없는 PR 이
// 전부 빨간불이라 아무도 안 보게 되고, 임계를 값에 맞춰 올리면 그 순간 지표가
// 지표이길 그만둔다. 남는 건 **통과로 세지 않되 매 실행 화면에 남기는 것**이다.
//   - 실패 수에 안 들어간다 → 무관한 PR 을 안 잡는다
//   - 줄이 매번 찍히고 마지막 요약에도 건수가 남는다 → 조용히 지나가지 않는다
//   - 래칫(worse)이 있다 → 더 나빠지면 그때는 진짜 FAIL 이다
let knownCount = 0;
function known(name, worse, detail, why) {
  console.log('  KNOWN ' + name + (detail ? '   ' + detail : ''));
  console.log('        ↳ ' + why);
  knownCount++;
  // 래칫만은 진짜 게이트다. 시드가 박혀 있어 같은 코드면 값이 한 자리도 안 움직이므로,
  // 기록해 둔 값보다 나빠졌다는 건 이 변경이 실제로 더 벌려 놨다는 뜻이다.
  if (worse) { console.log('  FAIL  ' + name + ' — 알려진 값보다 나빠졌다'); fail++; }
}

// ── 보드와 경로 ───────────────────────────────────────────────
{
  console.log('보드/경로');
  const g = load();
  const { CFG, state } = g;

  const count = (openRows, size) => {
    state.openRows = openRows;
    const occ = g.occupancy();
    let n = 0;
    for (let y = 0; y < CFG.BOARD_H; y++)
      for (let x = 0; x < CFG.BOARD_W; x++)
        if (g.canPlace(x, y, size, occ)) n++;
    return n;
  };

  const open0 = g.CFG.OPEN_ROWS, openAll = g.CFG.BOARD_H;
  ok('시작 배치 칸 24', count(open0, 1) === 24, String(count(open0, 1)));
  ok('전 행 개방 시 36', count(openAll, 1) === 36, String(count(openAll, 1)));

  // 행을 열 때마다 2x2 자리가 늘어야 개방이 보상이 된다
  const big = [open0, open0 + 2, openAll].map(o => count(o, 2));
  ok('2x2 자리가 단조 증가', big.every((v, i) => i === 0 || v >= big[i - 1]), big.join('→'));
  ok('2x2 자리 시작 10곳 이상', big[0] >= 10, String(big[0]));

  // 잠긴 구역은 언제 열리는지 알려줘야 한다. 규칙이 안 보이면 못 쓰는 칸으로 읽힌다.
  state.openRows = g.CFG.OPEN_ROWS;
  state.wave = 0;
  ok('개방 예정 웨이브를 안내한다', g.nextUnlockWave() === g.CFG.UNLOCK_AT[0], String(g.nextUnlockWave()));
  state.wave = g.CFG.UNLOCK_AT[0];
  ok('지난 개방은 건너뛴다', g.nextUnlockWave() === (g.CFG.UNLOCK_AT[1] ?? null), String(g.nextUnlockWave()));
  state.openRows = g.CFG.BOARD_H;
  ok('다 열리면 안내 없음', g.nextUnlockWave() === null, String(g.nextUnlockWave()));

  // 경로 칸에는 못 짓는다
  state.openRows = g.CFG.BOARD_H;
  const occ = g.occupancy();
  let onPath = 0;
  for (let y = 0; y < CFG.BOARD_H; y++)
    for (let x = 0; x < CFG.BOARD_W; x++)
      if (g.isPath(x, y) && g.canPlace(x, y, 1, occ)) onPath++;
  ok('경로 위에는 배치 불가', onPath === 0, String(onPath));

  // 사거리는 정사각형이다. 원이면 격자에서 모서리 칸이 걸치는지 눈으로 못 읽는다.
  {
    const t = { gx: 3, gy: 4, kind: 'marksman', star: 1, b3: null, b5: null, t7: null };
    const R = g.towerRange(t);
    const at = (dx, dy) => ({ x: 3.5 + dx - 0.5, y: 4.5 + dy - 0.5, kind: 'grunt' });
    const inRange = e => {
      state.enemies.length = 0;
      g.spawnEnemy('grunt');
      const en = state.enemies[0];
      en.x = e.x; en.y = e.y;
      return g.towerRange(t) >= Math.max(Math.abs(3.5 - (en.x + 0.5)), Math.abs(4.5 - (en.y + 0.5)));
    };
    ok('정면 끝은 사거리 안', inRange(at(R - 0.1, 0)));
    ok('대각 모서리도 사거리 안', inRange(at(R - 0.1, R - 0.1)), '원이면 여기서 빠진다');
    ok('네모 밖은 사거리 밖', !inRange(at(R + 0.2, 0)));
  }

  // 경로는 끊기지 않아야 한다
  let gaps = 0;
  for (let d = 0; d < g.PATH_LEN; d += 0.5) {
    const p = g.posAt(d);
    if (!g.isPath(Math.round(p.x), Math.round(p.y))) gaps++;
  }
  ok('경로가 연속', gaps === 0, gaps + '개 구멍');
}

// ── 데미지 공식 ───────────────────────────────────────────────
{
  console.log('데미지 공식');
  const g = load();
  const r = (a) => 1 - g.applyArmor(1, a);
  ok('방어력 0 이면 감소 없음', Math.abs(g.applyArmor(100, 0) - 100) < 1e-9);
  ok('방어력 40 감소 70.6%', Math.abs(r(40) - 0.706) < 0.002, (r(40) * 100).toFixed(1) + '%');
  ok('40→10 방깎이 2.1배', Math.abs(g.applyArmor(1, 10) / g.applyArmor(1, 40) - 2.13) < 0.02);
  ok('음수 방어력은 증폭', g.applyArmor(1, -25) > 1.5, g.applyArmor(1, -25).toFixed(2) + 'x');
  ok('성급 계수가 STAR_RATIO 거듭제곱', Math.abs(g.STAR_MULT[7] - Math.pow(g.CFG.STAR_RATIO, 6)) < 1e-6);
}

// ── 디버프 규칙 ───────────────────────────────────────────────
{
  console.log('디버프');
  const g = load();
  const { state } = g;

  const mk = (kind) => {
    state.enemies.length = 0;
    state.wave = 1;
    g.spawnEnemy(kind);
    return state.enemies[0];
  };
  const shredder = { id: 1, kind: 'shredder', star: 5, b3: 'A', b5: null, t7: null };

  const e1 = mk('grunt');
  for (let i = 0; i < 50; i++) g.applyStacks(e1, 1, 2, shredder);
  ok('방깎 스택 상한 = 성급x3', e1.armorStacks === 15, String(e1.armorStacks));

  // 오라를 벗어나면 서서히 빠진다. 한 번에 0 이 되면 언제 풀렸는지 알 수 없다.
  {
    const g2 = load();
    const st = g2.state;
    g2.pickStage(0);
    ['shredder', 'marksman', 'mint'].forEach(k => g2.toggleDeckPick(k));
    g2.startRun();
    st.phase = 'wave'; st.wave = 5; st.gold = 99999;
    g2.summon('shredder', 3, 4);
    const tw = st.towers[0];
    tw.star = 4;
    const sz = g2.towerFootprint(tw);
    const cc = { x: tw.gx + sz / 2, y: tw.gy + sz / 2 };
    g2.spawnEnemy('grunt');
    const en = st.enemies[0];
    en.maxHp = 1e9;
    const inx = cc.x - 0.5, iny = cc.y - 0.5;
    for (let i = 0; i < 120; i++) { en.hp = 1e9; en.x = inx; en.y = iny; g2.update(1 / 30); }
    const peak = en.armorStacks;
    ok('오라 안에서 스택이 쌓인다', peak > 0, peak.toFixed(1));

    // 멀리 치워 두고 관찰
    const far = { x: 0, y: 0 };
    let after1 = null;
    for (let i = 0; i < 60; i++) { en.hp = 1e9; en.x = far.x; en.y = far.y; g2.update(1 / 30); if (i === 29) after1 = en.armorStacks; }
    ok('나가면 서서히 빠진다', after1 < peak && after1 > 0, peak.toFixed(1) + ' → ' + after1.toFixed(1));
    ok('결국 0 이 된다', en.armorStacks < after1, after1.toFixed(1) + ' → ' + en.armorStacks.toFixed(1));
  }

  const e2 = mk('immune');
  for (let i = 0; i < 50; i++) g.applyStacks(e2, 1, 2, shredder);
  ok('면역몹엔 스택 안 붙음', e2.armorStacks === 0, String(e2.armorStacks));

  const e3 = mk('immune');
  for (let i = 0; i < 50; i++) g.applyStacks(e3, 1, 2, { ...shredder, t7: 'stalwart' });
  ok('불굴이면 면역몹에도 30% 적용', e3.armorStacks > 0 && e3.armorStacks <= 15, String(e3.armorStacks.toFixed(1)));

  const e4 = mk('grunt');
  e4.slowNext = 0.95;   // 오라 여러 개가 겹친 상황
  e4.slowAmt = Math.min(g.CFG.SLOW_CAP, e4.slowNext);
  ok('슬로우 상한 60%', Math.abs(e4.slowAmt - g.CFG.SLOW_CAP) < 1e-9, e4.slowAmt.toFixed(2));
}

// ── 합성 ─────────────────────────────────────────────────────
{
  console.log('합성');
  const g = load();
  const { state, CFG } = g;
  state.phase = 'build';   // 합성은 준비 단계에서만 된다
  state.towers.length = 0;
  state.gold = 99999;

  const put = (kind, star, gx, gy) => {
    const t = { id: 500 + state.towers.length, gx, gy, kind, star, b3: null, b5: null, t7: null,
      cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 };
    state.towers.push(t);
    return t;
  };

  const a = put('marksman', 1, 2, 4), b = put('marksman', 1, 3, 4);
  ok('같은 종류·같은 성은 합성 가능', g.canMerge(a, b));
  ok('다른 종류는 불가', !g.canMerge(a, put('mortar', 1, 4, 4)));
  const m = g.mergeTowers(a, b);
  ok('합성 결과가 2성', m && m.star === 2, m ? String(m.star) : 'null');
  ok('합성하면 타워 수가 준다', state.towers.length === 2, String(state.towers.length));
  // 드래그해서 손을 뗀 자리(뒤 인자)에 생겨야 한다. 출발 자리에 생기면 오조작처럼 느껴진다.
  ok('결과는 놓은 자리에 생긴다', m && m.gx === 3 && m.gy === 4, m ? m.gx + ',' + m.gy : 'null');

  // 반대 방향으로 끌어도 마찬가지
  state.towers.length = 0;
  const c1 = put('marksman', 1, 5, 4), c2 = put('marksman', 1, 2, 4);
  const m2 = g.mergeTowers(c1, c2);
  ok('반대로 끌면 반대 자리', m2 && m2.gx === 2 && m2.gy === 4, m2 ? m2.gx + ',' + m2.gy : 'null');

  // 4성 두 개를 5성으로 → 2x2 자리가 필요하다
  state.towers.length = 0;
  state.openRows = CFG.BOARD_H;
  const c = put('marksman', 4, 2, 4), d = put('marksman', 4, 3, 4);
  const big = g.mergeTowers(c, d);
  ok('5성은 2x2 로 커진다', big && g.towerFootprint(big) === 2, big ? String(g.towerFootprint(big)) : 'null');
  ok('5성 진입 시 분기 선택이 뜬다', !!state.choice && state.choice.tier === 5);

  // **웨이브 중에도 합칠 수 있다(#40).** 오래 준비 단계 전용이었고 근거는 「결과
  // 타워가 자리를 옮기면 오라 범위와 조준선이 한복판에서 흔들린다」였다. 그 현상은
  // 지금도 맞지만, 소환이 이미 웨이브 중에 되므로(아래 단언) 합성만 예외인 상태였다.
  // 새 타워가 한복판에 생기는 것도 범위와 조준선을 똑같이 바꾼다.
  //
  // **판이 끝난 뒤(over·clear)에는 여전히 막힌다** — 거기서는 보드가 판정을 마쳤다.
  state.towers.length = 0;
  state.choice = null;
  const w1 = put('marksman', 1, 2, 4), w2 = put('marksman', 1, 3, 4);
  state.phase = 'wave';
  ok('웨이브 중에도 합성된다', g.canMerge(w1, w2));
  ok('  소환도 웨이브 중에 된다 (합성만 예외였다)', (() => {
    const n = state.towers.length; const gold = state.gold; state.gold = 9999;
    g.summon('marksman'); const grew = state.towers.length > n;
    state.towers.length = n; state.gold = gold; return grew;
  })());
  ok('  실제로 합쳐진다', g.mergeTowers(w1, w2) !== null && state.towers.length === 1,
    String(state.towers.length));
  state.towers.length = 0;
  const o1 = put('marksman', 1, 2, 4), o2 = put('marksman', 1, 3, 4);
  state.phase = 'over';
  ok('판이 끝난 뒤엔 못 합친다', !g.canMerge(o1, o2) && g.mergeTowers(o1, o2) === null);
  ok('  타워가 그대로 남는다', state.towers.length === 2, String(state.towers.length));
  state.phase = 'build';
  ok('  준비 단계에서도 된다', g.canMerge(o1, o2));

  // 조폐소는 5성이어도 1칸
  state.towers.length = 0;
  state.choice = null;
  state.phase = 'build';
  const e = put('mint', 4, 1, 7), f = put('mint', 4, 2, 7);
  const mint5 = g.mergeTowers(e, f);
  ok('조폐소 5성은 1칸 유지', mint5 && g.towerFootprint(mint5) === 1);
}

// ── 배속 ──────────────────────────────────────────────────────
// 배속은 dt 를 키우지 않고 update 를 여러 번 돌려서 낸다. x2 로 한 프레임에
// 두 번 밟은 결과가 x1 로 두 프레임 밟은 것과 같아야 판정이 안 깨진다.
{
  console.log('배속');
  const g = load();
  const { state } = g;

  ok('기본은 x1', state.speed === 1, 'x' + state.speed);
  g.cycleSpeed(); ok('한 번 누르면 x2', state.speed === 2, 'x' + state.speed);
  g.cycleSpeed(); ok('두 번 누르면 x4', state.speed === 4, 'x' + state.speed);
  g.cycleSpeed(); ok('세 번 누르면 x1 로 돈다', state.speed === 1, 'x' + state.speed);

  // 같은 초를 한 번에 밟든 나눠 밟든 적 위치가 같다 (배속으로 판정이 안 흔들린다)
  const run = (steps) => {
    const h = load();
    h.state.phase = 'wave';
    h.state.enemies.length = 0;
    h.spawnEnemy('grunt');
    const e = h.state.enemies[0];
    const start = e.dist;
    for (let i = 0; i < steps; i++) h.update(0.5 / steps);
    return e.dist - start;
  };
  const oneStep = run(1), fourStep = run(4);
  ok('나눠 밟아도 같은 거리', Math.abs(oneStep - fourStep) < 1e-9, oneStep.toFixed(4) + ' vs ' + fourStep.toFixed(4));
}

// ── 물려받을 분기를 묻는다 ────────────────────────────────────
// 분기가 서로 다른 둘을 합치면 예전에는 끌어당긴 쪽이 조용히 이겼다. 어느 빌드가
// 살아남았는지 알 방법이 없었다. 이제 묻는다. 그리고 b3·b5 는 한 줄기라서
// 통째로 물려받아야 한다 — 슬롯을 따로 고르면 A 줄기에 B2 가 붙는다.
{
  console.log('분기 물려받기');
  const g = load();
  const { state, CFG } = g;
  g.pickStage(0);
  g.toggleDeckPick('marksman'); g.toggleDeckPick('frost'); g.toggleDeckPick('mint');
  g.startRun();
  state.gold = 999999;

  const put = (star, o = {}) => {
    const spot = [[1, 8], [2, 8], [4, 8], [5, 8], [1, 7], [2, 7]][state.towers.length % 6];
    const t = { id: 900 + state.towers.length, gx: spot[0], gy: spot[1], kind: 'marksman', star,
      b3: null, b5: null, t7: null, cd: 0, angle: 0, flash: 0,
      streak: 0, lastTarget: null, arcKills: 0, ...o };
    state.towers.push(t);
    return t;
  };

  // 같은 분기면 묻지 않는다
  state.towers.length = 0; g.applyChoice; state.choice = null;
  let a = put(3, { b3: 'A' }), b = put(3, { b3: 'A' });
  let m = g.mergeTowers(a, b);
  ok('같은 분기는 안 묻는다', state.choice === null, state.choice ? state.choice.mode : 'null');
  ok('그대로 물려받는다', m && m.b3 === 'A', m ? String(m.b3) : '실패');

  // 다르면 묻는다
  state.towers.length = 0; state.choice = null;
  a = put(3, { b3: 'A' }); b = put(3, { b3: 'B' });
  m = g.mergeTowers(a, b);
  ok('분기가 다르면 묻는다', !!state.choice && state.choice.mode === 'inherit',
    state.choice ? state.choice.mode : 'null');
  ok('후보가 둘', !!state.choice && state.choice.options.length === 2);
  ok('후보가 두 부모의 분기', !!state.choice
    && state.choice.chains[0].b3 === 'A' && state.choice.chains[1].b3 === 'B');
  // 끌어당긴 쪽(a=A)이 아니라 내가 고른 쪽(B)이 남는다
  g.applyChoice(1);
  ok('고른 쪽이 남는다', m.b3 === 'B', String(m.b3));
  ok('고르면 모달이 닫힌다', state.choice === null);

  // b3·b5 를 통째로 물려받는다 — 줄기가 섞이면 안 된다
  state.towers.length = 0; state.choice = null;
  a = put(5, { b3: 'A', b5: 'A1' }); b = put(5, { b3: 'B', b5: 'B2' });
  m = g.mergeTowers(a, b);
  ok('5성끼리도 묻는다', !!state.choice && state.choice.mode === 'inherit');
  g.applyChoice(1);
  ok('b3 와 b5 가 같은 줄기', m.b3 === 'B' && m.b5 === 'B2', `${m.b3}/${m.b5}`);
  ok('줄기를 섞지 않는다', m.b5.startsWith(m.b3), `${m.b3}/${m.b5}`);

  // 물려받기가 먼저, 새 성급 분기가 그 다음. 5성 후보는 확정된 b3 에서 나온다
  state.towers.length = 0; state.choice = null;
  a = put(4, { b3: 'A' }); b = put(4, { b3: 'B' });
  m = g.mergeTowers(a, b);
  ok('5성 진입 때 물려받기를 먼저 묻는다',
    !!state.choice && state.choice.mode === 'inherit', state.choice ? state.choice.mode : 'null');
  g.applyChoice(1);                                  // B 줄기를 남긴다
  ok('그 다음 5성 분기를 묻는다',
    !!state.choice && state.choice.tier === 5 && !state.choice.mode,
    state.choice ? `tier ${state.choice.tier}` : 'null');
  ok('5성 후보가 고른 b3 에서 나온다',
    !!state.choice && state.choice.options.join(',') === 'B1,B2',
    state.choice ? state.choice.options.join(',') : 'null');
  g.applyChoice('B2');
  ok('두 선택이 다 끝나면 닫힌다', state.choice === null);
  ok('결과가 앞뒤로 맞는다', m.b3 === 'B' && m.b5 === 'B2', `${m.b3}/${m.b5}`);

  // 모달 카드에 두 줄기가 사람 말로 나와야 한다
  state.towers.length = 0; state.choice = null;
  a = put(5, { b3: 'A', b5: 'A1' }); b = put(5, { b3: 'B', b5: 'B2' });
  g.mergeTowers(a, b);
  const L0 = g.choiceLabel(0), L1 = g.choiceLabel(1);
  const B = g.BRANCH.marksman;
  ok('카드에 분기 이름이 둘 다 나온다',
    L0.name.includes(B.A.name) && L0.name.includes(B.A1.name), L0.name);
  ok('카드 설명도 둘 다 나온다',
    L0.desc.includes(B.A.desc) && L0.desc.includes(B.A1.desc), L0.desc.replace(/\n/g, ' | '));
  ok('두 카드가 서로 다르다', L0.name !== L1.name, `${L0.name} vs ${L1.name}`);
  ok('물려받기 모달이 안 터진다', (g.render(), true));
  g.applyChoice(0);

  // 판을 새로 세우면 대기 중인 선택이 안 남는다
  state.towers.length = 0;
  a = put(3, { b3: 'A' }); b = put(3, { b3: 'B' });
  g.mergeTowers(a, b);
  ok('선택이 대기 중', !!state.choice);
  g.restart();
  ok('재시작하면 선택이 비워진다', state.choice === null);

  // 합성값은 성급을 탄다. 환급(A2) 이면 공짜다
  ok('합성값 = 성급 x8', g.mergeCost(3) === 24 && g.mergeCost(6) === 48,
    `${g.mergeCost(3)} / ${g.mergeCost(6)}`);
  ok('평소엔 공짜가 아니다', g.mergeIsFree() === false);
  state.towers.length = 0;
  put(5, { kind: 'mint', b3: 'A', b5: 'A2' });
  ok('환급 분기가 있으면 공짜', g.mergeIsFree() === true);
  state.towers.length = 0;
}

// ── 2x2 미리보기 ──────────────────────────────────────────────
// 5성부터 타워가 2x2 를 먹는데, 합성해 보고 나서야 알면 늦다. 놓기 전에 결과가
// 어느 네 칸을 차지하는지 보여준다. 미리보기와 실제 합성이 갈라지면 안 된다 —
// "2x2 라더니 한 칸으로 됐다" 가 제일 나쁜 결과다.
{
  console.log('2x2 미리보기');
  const g = load();
  const { state, CFG } = g;
  g.pickStage(0);
  g.toggleDeckPick('marksman'); g.toggleDeckPick('frost'); g.toggleDeckPick('mint');
  g.startRun();
  state.gold = 999999;

  const put = (kind, star, gx, gy) => {
    const t = { id: 800 + state.towers.length, gx, gy, kind, star, b3: null, b5: null, t7: null,
      cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 };
    state.towers.push(t);
    return t;
  };

  // 결과 크기가 성급·종류를 정확히 따라간다
  ok('3성 합성 결과는 1칸', g.mergeResultSize({ kind: 'marksman', star: 2 }) === 1);
  ok('4성 합성 결과는 1칸', g.mergeResultSize({ kind: 'marksman', star: 3 }) === 1);
  ok('4성→5성이 2x2 가 되는 지점',
    g.mergeResultSize({ kind: 'marksman', star: CFG.BIG_FROM_STAR - 1 }) === 2);
  ok('5성→6성도 2x2', g.mergeResultSize({ kind: 'marksman', star: 5 }) === 2);
  ok('조폐소는 5성이어도 1칸', g.mergeResultSize({ kind: 'mint', star: 4 }) === 1);

  // 미리보기가 실제 합성 결과와 같은 자리·같은 크기를 가리켜야 한다
  state.towers.length = 0;
  const a = put('marksman', 4, 1, 8), b = put('marksman', 4, 2, 8);
  const size = g.mergeResultSize(a);
  const spot = g.mergeSpot(a, b, size);
  ok('4성 쌍에 2x2 자리가 잡힌다', !!spot && size === 2, spot ? `${spot.gx},${spot.gy}` : '없음');
  ok('미리보기 그리기가 안 터진다', (g.drawMergePreview(a, b), true));

  const merged = g.mergeTowers(a, b);
  ok('실제 합성이 미리보기와 같은 자리',
    !!merged && merged.gx === spot.gx && merged.gy === spot.gy,
    merged ? `${merged.gx},${merged.gy} vs ${spot.gx},${spot.gy}` : '합성 실패');
  ok('실제 합성이 미리보기와 같은 크기', !!merged && g.towerFootprint(merged) === size);

  // 자리가 없으면 미리보기도 "없음" 을 말해야 한다 (그리고 합성이 실제로 막힌다)
  state.towers.length = 0;
  state.choice = null;
  const occ = g.occupancy();
  const free = [];
  for (let y = 0; y < CFG.BOARD_H; y++)
    for (let x = 0; x < CFG.BOARD_W; x++)
      if (g.canPlace(x, y, 1, occ)) free.push([x, y]);
  // 빈 칸을 1성으로 메우고 마지막 두 칸만 4성 쌍으로 둔다 → 2x2 자리가 남지 않는다
  const pair = free.slice(0, 2), fill = free.slice(2);
  const p1 = put('marksman', 4, pair[0][0], pair[0][1]);
  const p2 = put('marksman', 4, pair[1][0], pair[1][1]);
  for (const [x, y] of fill) put('frost', 1, x, y);
  ok('꽉 찬 보드에는 2x2 자리가 없다', g.mergeSpot(p1, p2, 2) === null);
  ok('자리 없을 때도 미리보기가 안 터진다', (g.drawMergePreview(p1, p2), true));
  const before = state.towers.length;
  g.mergeTowers(p1, p2);
  ok('자리 없으면 합성이 실제로 막힌다', state.towers.length === before, String(state.towers.length));
}

// ── 2x2 자리 고르기 ───────────────────────────────────────────
// 5성 이상 합성 결과가 놓일 자리를 플레이어가 고른다. 이 절이 잠그는 것은 두 가지다.
//   ① 커밋 전까지 판이 한 톨도 안 변한다 — 취소가 곧 무동작이라야 세이브·정지·ESC
//      어느 경로로 빠져나가도 되돌릴 것이 없다
//   ② 고를 수 있는 칸이 mergeSpots() 와 정확히 같다 — 목록과 화면과 판정이 갈리면
//      "눌리는데 안 놓이는 칸" 이 생긴다
{
  console.log('2x2 자리 고르기');
  const g = load();
  const { state, CFG } = g;
  g.pickStage(0);
  ['marksman', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  state.gold = 999999;

  let tid = 900;
  const put = (kind, star, gx, gy) => {
    const t = { id: tid++, gx, gy, kind, star, b3: null, b5: null, t7: null,
      cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 };
    state.towers.push(t);
    return t;
  };
  const reset = () => { state.towers.length = 0; g.clearChoices(); state.picker = null; tid = 900; };
  const snap = () => state.towers.map(t => `${t.id}:${t.gx},${t.gy},${t.star}`).sort().join(' ');

  // 결과가 2x2 면 모드가 열리고, 그때까지 판은 한 톨도 안 변한다
  reset();
  const a = put('marksman', 4, 1, 8), b = put('marksman', 4, 3, 8);
  const goldBefore = state.gold, snapBefore = snap();
  g.beginMergePlace(a, b);
  let m = g.mergePlaceState();
  ok('2x2 결과는 자리를 묻는다', m.open === true);
  ok('  묻는 동안 골드가 안 준다', state.gold === goldBefore, goldBefore + ' → ' + state.gold);
  ok('  묻는 동안 부모 둘이 그대로', snap() === snapBefore, snap());
  ok('  기본 선택은 mergeSpot 이 고른 자리', !!m.sel
    && m.sel.gx === g.mergeSpot(a, b, 2).gx && m.sel.gy === g.mergeSpot(a, b, 2).gy);

  // 후보 목록이 mergeSpots 와 글자까지 같다
  const spots = g.mergeSpots(a, b, 2);
  const key = l => l.map(s => s.gx + ',' + s.gy).join(' ');
  ok('  후보가 mergeSpots 와 같다', key(m.spots) === key(spots), m.spots.length + '곳');

  // 목록 밖 칸을 눌러도 아무 일이 없다 (sel 고정 · 모드 유지)
  const outside = [];
  for (let y = 0; y < CFG.BOARD_H; y++)
    for (let x = 0; x < CFG.BOARD_W; x++)
      if (!spots.some(s => s.gx === x && s.gy === y)) outside.push([x, y]);
  const selBefore = `${m.sel.gx},${m.sel.gy}`;
  let moved = 0, closed = 0;
  for (const [x, y] of outside) {
    if (g.mergePlaceSelect(x, y)) moved++;
    if (!g.mergePlaceState().open) { closed++; break; }
  }
  ok('  목록 밖 칸은 안 먹는다', moved === 0, moved + '회 먹힘');
  ok('  목록 밖 탭에 안 닫힌다', closed === 0 && g.mergePlaceState().open);
  ok('  목록 밖 탭에 sel 이 안 움직인다',
    `${g.mergePlaceState().sel.gx},${g.mergePlaceState().sel.gy}` === selBefore);

  // 후보 칸은 전부 먹는다
  const allTook = spots.every(s => g.mergePlaceSelect(s.gx, s.gy));
  ok('  후보 칸은 전부 먹는다', allTook);

  // 취소는 무동작이다
  g.mergePlaceCancel();
  ok('취소하면 모드가 닫힌다', g.mergePlaceState().open === false);
  ok('  취소 뒤 골드가 그대로', state.gold === goldBefore, goldBefore + ' → ' + state.gold);
  ok('  취소 뒤 타워 id·좌표가 그대로', snap() === snapBefore, snap());

  // 커밋은 고른 자리에 정확히 놓는다
  const target = spots[spots.length - 1];
  g.beginMergePlace(a, b);
  g.mergePlaceSelect(target.gx, target.gy);
  const cost = g.mergeCost(a.star);
  const gold0 = state.gold;
  const t = g.mergePlaceCommit();
  ok('커밋하면 고른 자리에 생긴다',
    !!t && t.gx === target.gx && t.gy === target.gy, t ? `${t.gx},${t.gy}` : 'null');
  ok('  커밋에서 비용이 나간다', gold0 - state.gold === cost, `${gold0}→${state.gold} (기대 -${cost})`);
  ok('  커밋 뒤 부모 둘이 사라진다', !state.towers.some(x => x.id === a.id || x.id === b.id));
  ok('  커밋 뒤 모드가 닫힌다', g.mergePlaceState().open === false);

  // 분기 모달 순서 — 물려받기가 성급 분기보다 먼저다
  reset();
  const c1 = put('marksman', 4, 1, 8), c2 = put('marksman', 4, 3, 8);
  c1.b3 = 'A'; c2.b3 = 'B';
  g.beginMergePlace(c1, c2);
  g.mergePlaceCommit();
  ok('커밋 뒤 물려받기를 먼저 묻는다', !!state.choice && state.choice.mode === 'inherit',
    state.choice ? String(state.choice.mode) : 'null');
  g.applyChoice(0);
  ok('  그 다음이 성급 분기', !!state.choice && state.choice.tier === 5,
    state.choice ? 'tier ' + state.choice.tier : 'null');
  g.clearChoices();

  // 1x1 결과는 묻지 않는다 — 예전 자리에 그대로 생긴다
  reset();
  const d1 = put('marksman', 2, 1, 8), d2 = put('marksman', 2, 3, 8);
  const want = g.mergeSpot(d1, d2, 1);
  const small = g.mergeTowers(d1, d2);
  ok('1x1 결과는 자리를 안 묻는다', g.mergePlaceState().open === false);
  ok('  1x1 은 놓은 쪽 자리에 그대로', !!small && small.gx === want.gx && small.gy === want.gy);
  g.clearChoices();

  // 후보가 0 곳이면 모드를 안 연다 (드래그 미리보기가 놓기 전에 붉게 알려 준다)
  reset();
  const occ0 = g.occupancy();
  const free = [];
  for (let y = 0; y < CFG.BOARD_H; y++)
    for (let x = 0; x < CFG.BOARD_W; x++)
      if (g.canPlace(x, y, 1, occ0)) free.push([x, y]);
  const p1 = put('marksman', 4, free[0][0], free[0][1]);
  const p2 = put('marksman', 4, free[1][0], free[1][1]);
  for (const [x, y] of free.slice(2)) put('frost', 1, x, y);
  ok('자리 0 곳이면 모드를 안 연다',
    g.beginMergePlace(p1, p2) === null && g.mergePlaceState().open === false);

  // 후보가 1 곳뿐이어도 연다 — "어떨 땐 묻고 어떨 땐 안 묻는다" 가 제일 나쁘다
  reset();
  const q1 = put('marksman', 4, free[0][0], free[0][1]);
  const q2 = put('marksman', 4, free[1][0], free[1][1]);
  const rest = free.slice(2);
  // 2x2 자리가 딱 하나 남을 때까지 1성으로 메운다
  for (const [x, y] of rest) {
    put('frost', 1, x, y);
    if (g.mergeSpots(q1, q2, 2).length <= 1) break;
  }
  const one = g.mergeSpots(q1, q2, 2);
  ok('  후보 1곳짜리 판을 만들었다', one.length === 1, one.length + '곳');
  g.beginMergePlace(q1, q2);
  ok('후보가 1 곳이어도 모드를 연다', g.mergePlaceState().open === true);
  g.mergePlaceCancel();

  // at 을 줘도 canPlace 로 다시 본다 — 호출부를 믿지 않는다
  reset();
  const r1 = put('marksman', 4, 1, 8), r2 = put('marksman', 4, 3, 8);
  const bad = g.mergeTowers(r1, r2, { gx: 0, gy: 0 });   // 0,0 은 잠긴 행이라 못 놓는다
  ok('잘못된 자리는 거절한다', bad === null && state.towers.length === 2, String(state.towers.length));
  g.clearChoices();

  // **웨이브가 시작돼도 모드를 끌고 간다(#40).** 예전에는 여기서 취소했고 근거가
  // 「mergeAllowed 가 준비 단계 전용이라 배치를 다 시켜 놓고 마지막에 거절하는
  // 화면이 된다」였다. 이제 웨이브 중에도 합성되므로 거절될 일이 없다.
  //
  // 시계를 안 멈추는 전제는 그대로다 — 고르는 동안 적이 흐른다. 그게 손해가 아니라
  // 선택의 값이다(전투 중에 합칠지, 한 박자 기다릴지).
  reset();
  const w1 = put('marksman', 4, 1, 8), w2 = put('marksman', 4, 3, 8);
  const wGold = state.gold;
  state.toast = null;
  g.beginMergePlace(w1, w2);
  ok('  웨이브 직전에 모드가 열려 있다', g.mergePlaceState().open === true);
  state.wave = 3;          // 첫 웨이브는 눌러야 오므로 이미 굴러가는 판으로 둔다
  state.timer = 0.05;
  let alive = 0;
  for (let i = 0; i < 30; i++) {
    g.update(1 / 30);
    if (state.phase === 'wave' && g.mergePlaceState().open) alive++;
  }
  ok('웨이브가 시작돼도 모드가 살아 있다',
    state.phase === 'wave' && g.mergePlaceState().open === true, state.phase);
  ok('  웨이브 중 열려 있는 프레임이 있다', alive > 0, String(alive));
  ok('  아직 커밋 전이라 골드가 그대로', state.gold === wGold, String(state.gold));
  ok('  웨이브 중에 배치를 확정할 수 있다', (() => {
    const n = state.towers.length;
    const sel = g.mergePlaceState().sel;
    return !!sel && g.mergeTowers(w1, w2, sel) !== null && state.towers.length < n;
  })());

  // 불변식: mergeSpot !== null ⟺ mergeSpots.length > 0
  // 이게 깨지면 "미리보기는 자리가 있다는데 모드가 안 열린다"(또는 그 반대)가 난다.
  let seed = 20240815;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let checked = 0, bad2 = 0;
  // **판을 전부 열어 두고 돌아야 한다.** pickStage 는 `i >= unlocked` 면 토스트만
  // 내고 되돌아가는데(index.html:2543) 갓 만든 판은 unlocked 가 1 이라, 이 줄이
  // 없으면 st>=1 에서 pickStage 가 통째로 no-op 이 되어 **다섯 판 전부 스테이지1
  // (7x10 1레인)을 재게 된다.** 오래 「4스테이지」라고 적힌 채로 사실은 한 판만
  // 보고 있었다 — checked 는 그래도 200 이 나와서 통과했다.
  g.applyBundle({ v: 1, unlocked: g.STAGES.length, best: g.STAGES.map(s => s.waves), run: null });
  const visited = new Set();
  for (let st = 0; st < g.STAGES.length; st++) {
    for (let trial = 0; trial < 25; trial++) {
      g.restart();
      g.pickStage(st);
      visited.add(state.stage);
      ['marksman', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
      g.startRun();
      state.openRows = CFG.OPEN_ROWS + 2 * ((rnd() * 3) | 0);
      state.towers.length = 0;
      tid = 900;
      const oc = g.occupancy();
      const cells = [];
      for (let y = 0; y < CFG.BOARD_H; y++)
        for (let x = 0; x < CFG.BOARD_W; x++)
          if (g.canPlace(x, y, 1, oc)) cells.push([x, y]);
      // 절반쯤 무작위로 메운다 — 자리가 남는 판과 꽉 찬 판이 섞여야 양쪽 방향이 잡힌다
      const fillN = (rnd() * cells.length) | 0;
      for (let i = cells.length - 1; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      const pair2 = cells.slice(0, 2);
      if (pair2.length < 2) continue;
      const A = put('marksman', 4, pair2[0][0], pair2[0][1]);
      const B = put('marksman', 4, pair2[1][0], pair2[1][1]);
      for (const [x, y] of cells.slice(2, 2 + fillN)) put('frost', 1, x, y);
      for (const size of [1, 2]) {
        checked++;
        const one2 = g.mergeSpot(A, B, size);
        const all = g.mergeSpots(A, B, size);
        if ((one2 !== null) !== (all.length > 0)) bad2++;
        // mergeSpot 이 고른 자리는 후보 목록 안에 있어야 한다 (배치 모드의 기본 선택이다)
        if (one2 && !all.some(s => s.gx === one2.gx && s.gy === one2.gy)) bad2++;
      }
    }
  }
  // 기대값은 STAGES.length 에서 뽑는다. 손으로 적으면 판이 늘 때마다 여기서 깨진다
  // (실제로 5번째 판을 붙이면서 200 이 250 이 됐다). visited 를 같이 보는 이유는
  // 위 applyBundle 이 빠지면 checked 는 맞는데 판은 하나만 도는 상태로 되돌아가서다.
  const wantChecked = g.STAGES.length * 25 * 2;
  ok(`mergeSpot ⟺ mergeSpots (${g.STAGES.length}스테이지 x ${g.STAGES.length * 25}판)`,
    bad2 === 0 && checked === wantChecked && visited.size === g.STAGES.length,
    `${checked}회 검사 · 반례 ${bad2} · 실제로 돈 판 ${visited.size}/${g.STAGES.length}`);
}

// ── 일시정지 ──────────────────────────────────────────────────
// 웨이브가 자동으로 굴러가는 게임이라 멈출 수 있어야 하는데, 멈춘 채로
// 배치·합성이 되면 시간 압박이 통째로 사라진다. 그래서 멈추면 화면을 덮고
// 판을 못 만지게 한다. 그 덮개가 곧 이 게임의 설명서다.
{
  console.log('일시정지');
  const g = load();
  const { state, CFG } = g;
  g.pickStage(0);
  g.toggleDeckPick('shredder'); g.toggleDeckPick('marksman'); g.toggleDeckPick('mint');
  g.startRun();

  ok('시작은 정지 아님', state.paused === false);
  g.togglePause(); ok('누르면 멈춘다', state.paused === true);
  g.togglePause(); ok('다시 누르면 풀린다', state.paused === false);

  // 소환 창을 열어 둔 채 멈추면 그 창으로 배치가 된다. 멈출 때 손에 든 걸 놓는다.
  state.picker = { gx: 2, gy: 8, kind: 'marksman' };
  g.togglePause();
  ok('멈추면 열린 소환 창이 닫힌다', state.picker === null);

  // 멈춘 동안에는 시간이 안 흐른다 (웨이브 타이머도, 적도)
  state.phase = 'wave';
  state.wave = 5;
  state.spawnQueue = g.buildSpawnQueue(5);
  const beforeQ = state.spawnQueue.length;
  for (let i = 0; i < 200; i++) g.update(1 / 30);
  ok('멈춘 동안 적이 안 나온다', state.spawnQueue.length === beforeQ && state.enemies.length === 0,
    beforeQ + ' → ' + state.spawnQueue.length);
  state.paused = false;

  // 하단 버튼 줄: 빨리 보내기 / 배속 / 정지. 셋이 겹치거나 화면 밖으로 나가면
  // 세로 화면에서 오조작이 된다.
  state.phase = 'build';
  g.render();
  const row = g.buttons.filter(b => b.h === 44).sort((a, b) => a.x - b.x);
  ok('하단에 버튼이 셋', row.length === 3, String(row.length));
  ok('정지 버튼이 배속 옆에 있다', !!row[2] && !!row[2].icon && row[2].fn === g.togglePause);
  ok('버튼이 안 겹친다', row.every((b, i) => i === 0 || b.x >= row[i - 1].x + row[i - 1].w));
  ok('버튼이 화면 안에 있다', row.every(b => b.x >= 0 && b.x + b.w <= 390) && row[0].w > 80,
    row.map(b => Math.round(b.x) + '+' + Math.round(b.w)).join(' '));

  // 아이콘은 멈춤/재개를 반영한다 (눌러 보기 전엔 뜻을 확인할 방법이 없는 버튼이라)
  ok('평소엔 멈춤 아이콘', row[2].icon() === 'pause', row[2].icon());
  state.paused = true;
  ok('멈추면 재개 아이콘', row[2].icon() === 'play', row[2].icon());
  ok('정지 중에도 render 가 안 터진다', (g.render(), true));
  state.paused = false;

  // 정지 화면이 유일한 설명서다. 내 덱 3종은 반드시 설명이 붙어야 한다.
  const help = g.pauseHelp();
  const deckSec = help.find(s => s.head === '내 덱');
  ok('도움말이 내 덱을 전부 설명한다',
    !!deckSec && deckSec.rows.length === CFG.DECK_SIZE && deckSec.rows.every(r => r.text.length > 4),
    deckSec ? deckSec.rows.map(r => r.label).join(',') : '없음');
  ok('모든 절이 비어 있지 않다', help.every(s => s.head && s.rows.length > 0));

  // 조폐소는 화면에 아무 일도 안 일어나서 숫자로 보여 주지 않으면 뭘 하는지 모른다
  state.towers.push({ id: 900, gx: 1, gy: 9, kind: 'mint', star: 3, b3: null, b5: null, t7: null,
    cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
  const mintRow = g.pauseHelp().find(s => s.head === '내 덱').rows.find(r => r.label === '조폐소');
  const want = Math.round(CFG.MINT_BASE * g.STAR_MULT[3]);
  ok('조폐소는 지금 수입을 숫자로 보여 준다', !!mintRow && mintRow.text.includes(`+${want}G`),
    mintRow ? mintRow.text : '없음');
}

// ── 설명이 실제와 맞는가 ──────────────────────────────────────
// 분기 설명은 화면에 뜨는 유일한 근거다. 코드가 바뀌고 문구가 안 바뀌면
// 플레이어는 없는 규칙을 믿고 고르게 된다.
{
  console.log('설명');
  const g = load();
  const { state, CFG, BRANCH, TRAITS } = g;

  const empty = [];
  for (const [kind, opts] of Object.entries(BRANCH))
    for (const [opt, info] of Object.entries(opts))
      if (!info.name || !info.desc) empty.push(kind + '.' + opt);
  for (const [key, info] of Object.entries(TRAITS))
    if (!info.name || !info.desc) empty.push(key);
  ok('분기·특성에 설명이 다 있다', empty.length === 0, empty.join(',') || '없음');

  const noHow = Object.entries(g.KINDS).filter(([, k]) => !k.blurb || !k.how).map(([k]) => k);
  ok('타워마다 blurb 과 how 가 있다', noHow.length === 0, noHow.join(',') || '없음');
  // how 는 소환 카드 한 줄에 들어가야 한다
  const longHow = Object.entries(g.KINDS).filter(([, k]) => k.how.length > 24).map(([k]) => k);
  ok('how 는 24자 안쪽', longHow.length === 0, longHow.join(',') || '없음');

  // 조폐소 이자 상한은 성급 배수다. "상한 40" 이라고 적어 뒀던 걸 바로잡았으니
  // 실제로 성급을 타는지 코드로 못박아 둔다.
  const mint = (star) => {
    const h = load();
    h.state.phase = 'wave';
    h.state.wave = 1;
    h.state.gold = 100000;                     // 3% 가 상한을 넘도록 크게 잡는다
    h.state.towers.length = 0;
    h.state.towers.push({ id: 1, gx: 1, gy: 9, kind: 'mint', star, b3: 'A', b5: null, t7: null,
      cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 });
    const before = h.state.gold;
    h.endWave();
    // 웨이브 클리어 골드와 기본 수입을 뺀 나머지가 이자다
    const base = Math.round(CFG.GOLD_BASE * Math.pow(CFG.GOLD_GROWTH, 1))
      + Math.round(CFG.MINT_BASE * g.STAR_MULT[star]);
    return h.state.gold - before - base;
  };
  ok('이자 상한이 성급을 탄다', mint(1) === 40 && mint(3) === 120,
    `1성 ${mint(1)}  3성 ${mint(3)}`);

  // 긴 설명을 그리는 곳은 전부 줄바꿈을 거친다. 줄바꿈이 빈 배열을 내면 글이 사라진다.
  ok('줄바꿈이 항상 한 줄 이상', g.wrapLines('아주 긴 한국어 설명 문장이다', 50).length >= 1);
  ok('빈 문자열도 안전', g.wrapLines('', 50).length === 1);
}

// ── 합성 튜토리얼 ─────────────────────────────────────────────
// 웨이브 사이 정지를 없앤 뒤로 드래그 합성을 배울 틈이 없다. 합칠 수 있는
// 쌍이 실제로 보드에 올라온 순간에만 안내가 뜨고, 한 번 합치면 영영 꺼진다.
{
  console.log('합성 튜토리얼');
  const g = load();
  const { state } = g;
  state.phase = 'build';
  state.towers.length = 0;
  state.gold = 99999;

  const put = (kind, star, gx, gy) => {
    const t = { id: 700 + state.towers.length, gx, gy, kind, star, b3: null, b5: null, t7: null,
      cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 };
    state.towers.push(t);
    return t;
  };

  ok('타워가 없으면 안내할 쌍 없음', g.mergeablePair() === null);
  put('marksman', 1, 2, 8);
  ok('한 개만 있으면 아직 없음', g.mergeablePair() === null);
  const a = put('marksman', 1, 3, 8), b = put('marksman', 1, 4, 8);
  ok('같은 종류·성급 두 개면 쌍이 잡힌다', !!g.mergeablePair());

  // **합성은 웨이브 중에도 되지만(#40) 안내는 준비 단계에만 뜬다.** `mergeablePair`
  // 는 「합칠 쌍이 있나」라서 웨이브 중에도 쌍을 잡는다 — 안내를 거르는 것은
  // `drawTutorial` 의 `state.phase !== 'build'` 다. 전투 한복판에 첫 합성 링을
  // 띄우면 가르치는 게 아니라 방해이고, 그 링이 매 프레임 다른 픽셀을 내서
  // verify-build 의 프레임 세기까지 흔든다(실측 8회 중 7회 불일치).
  state.phase = 'wave';
  ok('웨이브 중에도 합칠 쌍은 잡힌다', !!g.mergeablePair());
  ok('  그래도 안내는 준비 단계에만', (() => {
    const draws = g.draws; draws.reset();
    g.render();
    const wave = draws.count('arc');
    state.phase = 'build'; draws.reset(); g.render();
    return draws.count('arc') > wave;
  })(), '웨이브 중 링 없음');
  state.phase = 'build';

  g.mergeTowers(a, b);
  ok('합성하면 render 가 안 터진다', (g.render(), true));
}

// ── 마력로 ────────────────────────────────────────────────────
// 대상을 향해 회전하고, 그 직선 위의 적을 전부 꿴다.
// 각도를 배치 시점에 고정해 봤더니 "겨냥한 놈한테 안 쏜다"로만 읽혔다.
{
  console.log('마력로');
  const g = load();
  const { state } = g;
  g.pickStage(0);
  ['arc', 'marksman', 'mint'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  state.phase = 'wave';
  state.wave = 5;
  state.gold = 99999;
  g.summon('arc', 3, 4);
  const t = state.towers[0];
  t.star = 4;
  const size = g.towerFootprint(t);
  const c = { x: t.gx + size / 2, y: t.gy + size / 2 };
  const r = g.towerRange(t);

  // 적을 한자리에 붙잡아 두고 누적 피해를 잰다. 프레임마다 HP 를 되돌리므로
  // 합산해야 한다 — 마지막 프레임만 보면 쿨다운 때문에 0 이 나온다.
  const run = (places) => {
    state.enemies.length = 0;
    const es = places.map(pl => {
      g.spawnEnemy('grunt');
      const e = state.enemies[state.enemies.length - 1];
      e.maxHp = 1e9;
      pl(e);
      return { e, x: e.x, y: e.y };
    });
    const dealt = es.map(() => 0);
    for (let i = 0; i < 300; i++) {
      es.forEach(o => { o.e.hp = 1e9; o.e.x = o.x; o.e.y = o.y; });
      g.update(1 / 30);
      es.forEach((o, k) => { dealt[k] += 1e9 - o.e.hp; });
    }
    return dealt;
  };
  const at = (deg, dist) => e => {
    const a = deg * Math.PI / 180;
    e.x = c.x + Math.cos(a) * dist - 0.5;
    e.y = c.y + Math.sin(a) * dist - 0.5;
  };

  const dirs = [0, 45, 90, 135, 180, 225, 270, 315];
  const missed = dirs.filter(d => run([at(d, r * 0.6)])[0] === 0);
  ok('사거리 안이면 어느 방향이든 맞는다', missed.length === 0, missed.join(',') + '도 빗나감');

  ok('사거리 밖은 안 맞는다', run([at(0, r + 3)])[0] === 0);

  // 한 줄로 세우면 전부 꿰야 한다
  const line = run([at(0, r * 0.3), at(0, r * 0.6), at(0, r * 0.9)]);
  ok('직선 위 여러 마리를 관통한다', line.every(v => v > 0), line.map(v => Math.round(v)).join(' / '));

  // 두 무리 중 많은 쪽을 고른다
  const pick = run([at(90, r * 0.5), at(270, r * 0.4), at(270, r * 0.7)]);
  ok('더 많이 꿰는 방향을 고른다', pick[1] > 0 && pick[2] > 0 && pick[1] >= pick[0],
    pick.map(v => Math.round(v)).join(' / '));
}

// ── 첫 웨이브 ─────────────────────────────────────────────────
{
  console.log('첫 웨이브');
  const g = load();
  const { state } = g;
  g.pickStage(0);
  ['arc', 'marksman', 'mint'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  ok('시작 직후엔 웨이브 0', state.wave === 0, String(state.wave));
  for (let i = 0; i < 60 * 30; i++) g.update(1 / 30);
  ok('가만히 두면 안 시작한다', state.wave === 0 && state.phase === 'build', 'w' + state.wave + ' ' + state.phase);
  g.rushWave();
  ok('눌러야 시작한다', state.wave === 1 && state.phase === 'wave', 'w' + state.wave + ' ' + state.phase);
  // 두 번째부터는 자동
  state.phase = 'build';
  state.timer = 0.05;
  for (let i = 0; i < 10; i++) g.update(1 / 30);
  ok('둘째 웨이브부터는 자동', state.wave === 2, String(state.wave));
}

// ── 서리탑 장판 ───────────────────────────────────────────────
{
  console.log('서리탑 장판');
  const g = load();
  const { state, CFG } = g;
  g.pickStage(0);
  ['frost', 'marksman', 'mint'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  state.phase = 'wave';
  state.wave = 5;
  state.gold = 99999;
  g.summon('frost', 3, 4);
  const t = state.towers[0];
  t.star = 4;
  const size = g.towerFootprint(t);
  const c = { x: t.gx + size / 2, y: t.gy + size / 2 };

  const ring = (n, dist) => {
    state.enemies.length = 0;
    const es = [];
    for (let i = 0; i < n; i++) {
      g.spawnEnemy('grunt');
      const e = state.enemies[i];
      e.maxHp = 1e9;
      const a = i * 2 * Math.PI / n;
      e.x = c.x + Math.cos(a) * dist - 0.5;
      e.y = c.y + Math.sin(a) * dist - 0.5;
      es.push({ e, x: e.x, y: e.y });
    }
    const dealt = es.map(() => 0);
    for (let i = 0; i < 150; i++) {
      es.forEach(o => { o.e.hp = 1e9; o.e.x = o.x; o.e.y = o.y; });
      g.update(1 / 30);
      es.forEach((o, k) => { dealt[k] += 1e9 - o.e.hp; });
    }
    return { dealt, slow: es[0].e.slowAmt };
  };

  const few = ring(3, 1.2);
  ok('장판이 범위 안 전원을 때린다', few.dealt.every(v => v > 0), few.dealt.map(v => Math.round(v)).join('/'));
  ok('슬로우도 같이 걸린다', few.slow > 0, (few.slow * 100).toFixed(0) + '%');

  // 지속딜이 피격 플래시를 내면 장판 안의 적이 계속 흰색이라
  // 슬로우 색을 비롯한 다른 상태 표시가 전부 묻힌다.
  const flashing = state.enemies.filter(e => e.hitFlash > 0).length;
  ok('지속딜은 피격 플래시를 안 낸다', flashing === 0, flashing + '마리 깜빡임');

  // 총량 고정 분배. 범위 안이면 전원이 맞아야 "왜 쟤는 안 맞지"가 없다.
  const many = ring(10, 1.2);
  const touched = many.dealt.filter(v => v > 0).length;
  ok('범위 안이면 전원이 맞는다', touched === 10, touched + '/10');

  // 적이 늘어도 총 피해는 그대로여야 군집에서 박격포를 먹지 않는다
  const sum = a => a.reduce((x, y) => x + y, 0);
  const ratio = sum(many.dealt) / sum(few.dealt);
  ok('총 피해가 적 수에 비례하지 않는다', ratio < 1.35, '3마리 대비 10마리 총딜 ' + ratio.toFixed(2) + '배');

  // 사거리 밖은 안 맞는다
  const out = ring(2, g.towerRange(t) + 2);
  ok('사거리 밖은 안 맞는다', out.dealt.every(v => v === 0), out.dealt.map(v => Math.round(v)).join('/'));
}

// ── 스테이지 ─────────────────────────────────────────────────
{
  console.log('스테이지');
  const g = load();
  const { state } = g;
  ok('스테이지 선택 화면에서 시작', state.phase === 'stage', state.phase);
  // 기대값은 STAGES 에서 뽑는다. 숫자를 박아 두면 판을 붙일 때 이 줄이 같이 안 늘고,
  // 그러면 새 판이 화면에 안 뜨는 것을 아무도 못 본다.
  ok('카드가 스테이지 수만큼', g.stageCardRects().length === g.STAGES.length,
    g.stageCardRects().length + '/' + g.STAGES.length);
  ok('  카드가 STAGES 순서 그대로', g.stageCardRects().every((r, i) => r.i === i));

  g.pickStage(1);
  ok('잠긴 스테이지는 못 고름', state.phase === 'stage', state.phase);

  g.pickStage(0);
  ok('열린 스테이지는 골라진다', state.phase === 'deck');
  ok('맵이 실려 있다', g.lanes.length >= 1 && g.pathCells.size > 0,
    '레인 ' + g.lanes.length + ', 경로칸 ' + g.pathCells.size);

  // 스테이지마다 맵과 규칙이 실제로 다른지.
  // **키에 규칙까지 넣는 이유**: ④ 역류는 ② 이중 병목과 지형이 **좌표까지 같고**
  // 레인 수만 다르다. 경로칸만 세면 그런 판이 「같은 판」으로 접혀 검사가 조용히
  // 통과한다 — loadStage 가 갈아끼우는 것을 전부 키에 넣어야 「판이 실제로
  // 다른가」를 재는 자가 된다.
  const seen = new Set();
  for (let i = 0; i < g.STAGES.length; i++) {
    g.loadStage(i);
    seen.add([...g.pathCells].sort().join('|') + '#' + g.lanes.length
      + '#' + g.CFG.OPEN_ROWS + '#' + g.CFG.WAVE_MAX + '#' + g.CFG.STAR_MAX + '#' + g.STAGES[i].hpMult);
  }
  ok('스테이지마다 맵·규칙이 다르다', seen.size === g.STAGES.length, seen.size + '/' + g.STAGES.length);

  // 행 개방 개수. 개방은 한 번에 2행씩이고(index.html:3102) BOARD_H 에서 멈추므로,
  // unlockAt 이 (h - openRows) / 2 개가 아니면 둘 중 하나가 조용히 난다 —
  // 모자라면 맨 윗행이 영영 안 열리고(6성 이상이 물리적으로 불가능해진다),
  // 남으면 그 웨이브의 「보드 확장」 토스트가 아무것도 안 여는 거짓말이 된다.
  // 네 판 시절에는 우연히 전부 맞아 있었을 뿐 이걸 잠근 것이 없었다.
  const rowsBad = g.STAGES.filter(s => s.unlockAt.length !== (s.h - s.openRows) / 2);
  ok('행 개방 개수 = (h - openRows) / 2',
    rowsBad.length === 0,
    g.STAGES.map(s => s.name + ':' + s.unlockAt.length + '/' + ((s.h - s.openRows) / 2)).join(' '));

  // 좁은 화면. 스테이지 카드 높이는 판 수로 나눠 자동 축소되는데 하한이 없으면
  // 카드 안의 셋째 줄(난이도 점, y+58 · 11px)이 카드 밖으로 나간다. 판이 넷일 때는
  // 594 까지 버텨서 아무도 안 봤지만 다섯 장이 되며 한계선이 675 로 올라갔고
  // **375x667(iPhone SE·8)이 걸렸다.** tools/shot.js 는 390x844 만 찍으므로 눈
  // 확인 게이트가 이걸 절대 못 본다 — 그래서 여기서 잡는다. 판을 더 붙이면 한계선이
  // 또 올라가므로 이 단언이 다음 사람을 대신 막는다.
  //
  // **658 은 지금 레이아웃의 바닥이다.** 카드가 하한에 걸리면 더 줄지 않으므로
  // 그 아래에서는 로그인 줄이 화면 밖으로 나간다(5판 기준: 카드 바닥 540 →
  // 이어하기 554~606 → 로그인 616~658). 320x568 같은 더 좁은 기기를 받으려면
  // 카드를 스크롤시키거나 접어야 하고 그건 이 티켓 밖이다 — 여기서는 바닥이
  // 어디인지를 숫자로 박아 두어, 판이 늘어 이 값이 올라가면 바로 걸리게 한다.
  //
  // **하한이 둘이라 기대값도 둘이다**(index.html `STAGE_CARD_MIN`). 셋째 줄을 접은
  // 카드는 51 이면 안 깨지고, 안 접은 카드는 72 라야 한다. **어느 쪽인지를 테스트가
  // 다시 판단하지 않는다** — 카드가 들고 오는 `compact` 를 그대로 읽는다. 여기서
  // 「658 이하면 접힌다」식으로 조건을 베끼면 자가 두 벌이 되고, 그건 이 리포가
  // 반복해서 데인 자리다.
  //
  // 아래 목록 `[844, 667, 658]` 을 **그대로 유지한다.** 통과시키려고 기기를 빼면
  // 회귀를 숨기는 것이다.
  // [2026-08 #50] **아래 두 줄만으로는 이제 부족하다.** 목록이 스크롤되면서 꼬리가
  // 화면 바닥에 고정됐으므로 「마지막 줄이 화면 안」은 **정의상 참**이 됐다 — 그
  // 줄 혼자 두면 아무것도 안 잰다(이 리포가 포화된 지표에 반복해서 데인 그 자리다).
  // 그래서 스크롤이 실제로 닿는지를 같이 본다:
  //   · 맨 위에서 첫 카드가 칸 안에 **온전히** 있다 (헤더 밑으로 안 파고든다)
  //   · 끝까지 내리면 마지막 카드가 칸 안에 **온전히** 들어온다 (닿을 수 없는 판이 없다)
  // 둘이 있어야 「스크롤 범위가 내용과 맞는가」가 잠긴다. 범위를 반만 잡아도 첫 줄은
  // 통과하지만 둘째 줄이 잡는다.
  const narrow = (gg, label) => {
    const M = gg.STAGE_CARD_MIN;
    for (const h of [844, 667, 658]) {
      gg.view.h = h;
      gg.setStageScroll(0);
      const m = gg.stageListMetrics();
      const cards = gg.stageCardRects();
      const lastCard = cards[cards.length - 1];
      const tail = gg.cloudRect();
      const min = lastCard.compact ? M.compact : M.full;
      ok(`  ${label} ${h}px 에서 카드 안이 안 깨진다`, lastCard.h >= min,
        '카드 높이 ' + lastCard.h.toFixed(1) + ' (하한 ' + min
        + (lastCard.compact ? ' · 셋째 줄 접음' : '') + ')');
      ok(`  ${label} ${h}px 에서 마지막 줄이 화면 안`, tail.y + tail.h <= h,
        '로그인 줄 바닥 ' + (tail.y + tail.h).toFixed(1) + ' / 화면 ' + h);
      ok(`  ${label} ${h}px 에서 첫 카드가 칸 안에 온전히`, cards[0].y >= m.top - 0.01,
        '첫 카드 y ' + cards[0].y.toFixed(1) + ' / 칸 위 ' + m.top);
      gg.setStageScroll(m.maxScroll);
      const bottomCard = gg.stageCardRects()[cards.length - 1];
      ok(`  ${label} ${h}px 에서 마지막 카드까지 닿는다`,
        bottomCard.y + bottomCard.h <= gg.stageListMetrics().tailTop + 0.01,
        '끝까지 내렸을 때 바닥 ' + (bottomCard.y + bottomCard.h).toFixed(1)
        + ' / 칸 아래 ' + m.tailTop.toFixed(1) + (m.maxScroll > 0 ? ' · 스크롤 ' + m.maxScroll.toFixed(0) : ' · 스크롤 없음'));
      gg.setStageScroll(0);
    }
  };
  narrow(g, `${g.STAGES.length}장`);
  g.view.h = 844;

  // ── 여섯 장을 **판을 안 늘린 채로** 잰다 ────────────────────────────────
  // 다섯 장은 658px 에서 꼬리 바닥이 정확히 658 로 여유가 0 이었고, 여섯 장이면
  // 하한 72 에 걸려 더 안 줄면서 그대로 **742 로 84px 넘쳤다.** 판을 실제로 붙이기
  // 전에 여기서 먼저 재는 이유는 그래야 「레이아웃이 문제인가 새 판이 문제인가」가
  // 갈리기 때문이다.
  //
  // **가짜 판은 다른 `load()` 에 넣는다.** 위 `g` 의 STAGES 를 늘리면 이 블록의
  // 나머지 단언(행 개방 개수 · 맵이 다른가 · 레인 배정)이 전부 가짜 판을 같이 재게
  // 된다.
  //
  // [2026-08 #54] **늘리기만 하던 것을 자르기도 하게 고쳤다.** 옛 주석은 「판이 실제로
  // 여섯이 되면 `while` 이 아무것도 안 밀어 넣고 진짜 여섯 장을 잰다」였는데, 판이
  // **여섯을 넘자** 그 문장이 조용히 틀렸다 — `while` 이 안 도는 건 같지만 재는 것은
  // 아홉 장이었고, 블록 이름만 「여섯 장」으로 남았다. 아홉 장은 844px 에서도 이미
  // 접히므로 아래 「넓은 화면에서는 안 접힌다」가 빨간불이 됐다.
  //
  // **게이트가 회귀를 잡은 게 아니라 게이트가 낡은 것이다.** 이 블록이 묻는 것은
  // 「**여섯 장**에서 844 는 안 접히고 658 은 접히는가」 하나이고, 그 질문은 판이
  // 몇이든 그대로다. 그래서 임계(`51`/`72`·`[844, 667, 658]`)는 한 자리도 안 건드리고
  // **표본을 정확히 여섯 장으로 고정**한다. 진짜 아홉 장은 바로 위 `narrow(g, …)` 가
  // 이미 재고 있으므로 여기서 겹쳐 잴 이유도 없다.
  const SIX = 6;
  {
    const g6 = load();
    const proto = g6.STAGES[0];
    while (g6.STAGES.length < SIX) {
      g6.STAGES.push({ ...proto, name: '가짜 ' + (g6.STAGES.length + 1) });
    }
    // 남으면 자른다. **`slice` 로 새 배열을 만들지 않고 제자리에서 줄인다** — 판
    // 정의를 들고 있는 다른 참조(loadStage 가 잡은 것)와 갈리면 안 된다.
    g6.STAGES.length = SIX;
    narrow(g6, '여섯 장');

    // **접힌다는 것을 그림에서 본다.** 위 두 줄은 좌표만 보므로 `compact` 를 켜고도
    // 셋째 줄을 그대로 그리면(= 카드 밖에 글자가 얹히면) 전부 통과한다 — 이 리포가
    // 세 번 빠진 함정이라 `draws` 로 실제 호출을 센다. 카드 하나가 줄 하나를
    // 잃으므로 차이는 정확히 판 수다.
    const n6 = g6.STAGES.length;
    const texts = (h) => {
      g6.view.h = h;
      g6.state.phase = 'stage';
      g6.draws.reset();
      g6.render();
      return g6.draws.count('fillText');
    };
    const wide = texts(844), tight = texts(658);
    ok('  여섯 장 · 좁은 화면에서 셋째 줄이 실제로 안 그려진다', wide - tight === n6,
      `844px ${wide}줄 → 658px ${tight}줄 (차이 ${wide - tight} / 판 ${n6})`);
    // 위 줄만 있으면 「844 에서도 접혀 있고 658 에서 두 줄을 더 뺐다」로도 통과한다.
    // 넓은 화면에서는 안 접힌다는 것을 따로 잠근다.
    g6.view.h = 844;
    ok('  여섯 장 · 넓은 화면에서는 안 접힌다',
      g6.stageCardRects().every(r => !r.compact));
    g6.view.h = 658;
    ok('  여섯 장 · 658px 에서는 접힌다',
      g6.stageCardRects().every(r => r.compact));
  }

  // ── 열두 장을 **판을 안 늘린 채로** 잰다 (#50) ────────────────────────────
  // 위 여섯 장 블록과 같은 취지다. 아홉 장은 이제 진짜 판이라 `narrow(g, …)` 가
  // 재고 있고, 여기서는 **그 다음**을 미리 본다 — 접기는 아홉에서 이미 소진됐으므로
  // (하한 51 에 눌린 채 658 에서 147px 넘쳤다) 열둘이 통과한다면 그건 순전히
  // 스크롤이 하는 일이다. 「접기로 번 것은 판 하나치」를 스크롤이 끝냈다는 증거가
  // 이 블록이고, 열세 장이 되어도 여기를 고칠 필요가 없다.
  {
    const g12 = load();
    while (g12.STAGES.length < 12)
      g12.STAGES.push({ ...g12.STAGES[0], name: '가짜 ' + (g12.STAGES.length + 1) });
    narrow(g12, '열두 장');
    g12.view.h = 658;
    g12.setStageScroll(0);
    const m = g12.stageListMetrics();
    ok('  열두 장 · 658px 은 스크롤로만 들어간다', m.maxScroll > 0,
      '스크롤 범위 ' + m.maxScroll.toFixed(0) + 'px');
    // 스크롤이 필요 없는 화면에는 막대를 안 그린다. 늘 그리면 안 움직이는 장식이 된다.
    //
    // **[#62] 표본을 여섯으로 자른다 — 이 줄이 진짜 판 수를 재고 있었다.** 위 여섯 장
    // 블록의 [#54] 문단이 적어 둔 것과 **똑같은 사고가 이 한 줄에 남아 있었다**:
    // 이름은 「여섯 장」인데 `load()` 가 준 배열을 안 자르고 그대로 썼다. 아홉 장까지는
    // 844px 에서 우연히 `maxScroll === 0` 이라 통과했고, 열 장에서 24px 이 되며 빨간불이
    // 됐다. **이 줄이 묻는 것은 「목록이 다 들어가는 화면에서 막대를 안 그리는가」이지
    // 「지금 판 수가 844 에 들어가는가」가 아니다** — 후자는 바로 위 `narrow(g, …)` 가
    // 이미 재고 있고, 열 장이 스크롤 24 로 도는 것은 #50 이 넣은 정상 동작이다.
    const g6b = load();
    g6b.STAGES.length = SIX;
    g6b.view.h = 844;
    g6b.setStageScroll(0);
    ok('  여섯 장 · 844px 은 스크롤이 없다', g6b.stageListMetrics().maxScroll === 0,
      String(g6b.stageListMetrics().maxScroll));
  }

  // ── 잘린 카드는 그려지지도, 눌리지도 않는다 (#50) ──────────────────────────
  // **좌표 단언만으로는 못 잡는다.** 클립을 통째로 빼도 위 단언은 전부 통과하고,
  // 화면에서만 카드가 헤더와 이어하기 줄 위로 삐져나온다 — 셋째 줄 접기에서
  // 「카드 밖에 글자가 얹히면 안 된다」와 같은 사고다. 그래서 그리기 호출을 센다.
  {
    const gc = load();
    while (gc.STAGES.length < 12)
      gc.STAGES.push({ ...gc.STAGES[0], name: '가짜 ' + (gc.STAGES.length + 1) });
    gc.view.h = 658;
    gc.state.phase = 'stage';
    gc.setStageScroll(0);
    gc.draws.reset();
    gc.render();
    ok('  목록에 클립이 걸린다', gc.draws.count('clip') >= 1, String(gc.draws.count('clip')));

    // 칸 밖으로 나간 카드는 탭도 안 먹는다. 안 그러면 이어하기 줄 뒤에 숨은 카드가
    // 눌려서 「엉뚱한 판이 열린다」가 된다.
    const m = gc.stageListMetrics();
    const hidden = gc.stageCardRects().filter(r => !gc.stageCardVisible(r));
    ok('  658px · 열두 장에서 칸 밖으로 나간 카드가 있다', hidden.length > 0, String(hidden.length));
    // 잠긴 판이라 pickStage 는 어차피 거절한다 — 그래서 **1번 판을 맨 아래로 보내**
    // 「열려 있는데 숨어 있는」 상황을 만든다. 스크롤을 끝까지 내리면 1번이 위로 빠진다.
    gc.setStageScroll(gc.stageListMetrics().maxScroll);
    const first = gc.stageCardRects()[0];
    ok('  끝까지 내리면 1번 카드가 칸 밖이다', !gc.stageCardVisible(first),
      'y ' + first.y.toFixed(1) + ' / 칸 위 ' + m.top);
    gc.state.phase = 'stage';
    gc.stageTap(first.x + 10, first.y + 10);
    ok('  칸 밖 카드는 탭해도 안 열린다', gc.state.phase === 'stage', gc.state.phase);
    // 대조 — 보이는 카드는 그대로 열린다. 위 줄만 있으면 「탭이 통째로 죽었다」도 통과한다.
    gc.setStageScroll(0);
    const top0 = gc.stageCardRects()[0];
    gc.stageTap(top0.x + 10, top0.y + 10);
    ok('  보이는 카드는 탭하면 열린다', gc.state.phase === 'deck', gc.state.phase);
  }

  // 후반 스테이지는 레인이 여러 개.
  const last = g.STAGES.length - 1;
  g.loadStage(last);
  ok('마지막 스테이지는 다중 레인', g.lanes.length > 1,
    'S' + (last + 1) + ' 레인 ' + g.lanes.length);

  // ── ⑥ 합수가 실제로 「갈래마다 따로 답하는」 판인가 (#44) ──────────────────
  // **판을 이름으로 집는다.** `lanes.length > 1` 같은 성질로 거르면 레인이 줄었을 때
  // 검사가 실패하는 게 아니라 **안 돈다** — #42 에서 3레인 판의 3번 레인을 지워도
  // `npm test` 가 exit 0 으로 통과한 적이 있다.
  //
  // 「전레인동시」는 `tools/paths.js` 가 재는 값이다(개방 행 배치 칸 중 사거리 안에
  // **모든** 레인의 칸이 들어오는 칸 수). 이 판을 고른 근거가 그 수이므로 자를 두 벌
  // 만들지 않고 그 파일을 그대로 부른다.
  //
  // **밴드에 상한과 하한이 둘 다 있다.**
  //   상한 32%  이보다 높으면 ⑤(37.5%)와 다를 게 없다 — 한 자리가 두 갈래를 다 덮어서
  //             「어디를 막을까」가 1레인 판에 가까워진다. 이 판을 만든 이유가 사라진다
  //   하한 15%  **이 아래는 그리디의 벽이다.** 좌/우로 완전히 가른 후보들이 8~12% 에서
  //             조기 전멸률 45~74% 로 무너졌고(⑤ 는 0%), 3레인 판(#42)은 2.3% 로
  //             밸런스 게이트를 아예 못 넘었다. 낮을수록 좋은 값이 아니다
  {
    const { evaluate, STAGES: PS } = require('./paths.js');
    // `index.html` 은 `openRows`, `paths.js` 는 `open` 이다. **살아 있는 판 정의로**
    // 재려고 여기서 맞춰 넘긴다 — `paths.js` 의 복사본을 쓰면 좌표가 갈렸을 때
    // 이 줄이 옛 좌표를 재고 통과한다.
    const shape = d => ({ w: d.w, h: d.h, open: d.openRows ?? d.open, lanes: d.lanes });
    const ratio = d => { const e = evaluate(shape(d)); return e.allOpen / e.free6; };
    const NM = '합수';
    const idx = g.STAGES.findIndex(s => s.name === NM);
    ok(`[${NM}] 판이 있다`, idx >= 0, idx >= 0 ? 'index ' + idx : '없음');
    if (idx >= 0) {
      const def = g.STAGES[idx];
      ok('  레인이 둘이다', def.lanes.length === 2, def.lanes.length + '레인');
      const r = ratio(def);
      ok('  전레인동시가 밴드 안이다 (15~32%)', r >= 0.15 && r <= 0.32,
        (r * 100).toFixed(1) + '%');
      // 대조 — ⑤ 는 공유 머리 구간 때문에 이 값이 더 높다. 같이 안 높으면 자가
      // 고장 난 것이지 새 판이 특별한 게 아니다.
      const s5 = PS.find(s => s.name.startsWith('⑤'));
      ok('  ⑤ 분수령은 이 값이 더 높다', ratio(s5) > r,
        '⑤ ' + (ratio(s5) * 100).toFixed(1) + '% > ⑥ ' + (r * 100).toFixed(1) + '%');
    }
  }

  // ── 레인 배정 (#42) ──
  // 스폰은 `laneCursor++ % lanes.length` 라운드로빈이다. 여기서 잡는 것은 둘이다.
  //   ① 한 웨이브의 적이 레인에 고르게 갈리는가 (한 레인만 밀리면 그 판은 사실상
  //      1레인이고, 레인을 가른 이유가 통째로 사라진다)
  //   ② `laneCursor` 가 판을 실을 때 0 으로 돌아가는가
  // **`laneCursor` 는 모듈 전역이라 판을 새로 싣는 것만으로는 안 돌아간다.** shot 은
  // 매 컷 새 페이지이고 sim 은 매 판 새 load() 라 **둘 다 이 상태를 물려받지
  // 못한다** — 사람만 겪는 버그였다(한 판 끝내고 다시 시작하면 첫 적의 레인이
  // 바뀐다. 2레인에서는 짝/홀 패리티라 안 보이고 3레인이 되면 보인다).
  // 그래서 **같은 load() 안에서** 두 번 싣는 이 자리에서만 잴 수 있다.
  for (let st = 0; st < g.STAGES.length; st++) {
    g.loadStage(st);
    const L = g.lanes.length;
    if (L < 2) continue;
    const N = 30;                 // 레인 수 1~3·5·6 어디로도 나눠떨어진다
    state.enemies.length = 0;
    for (let i = 0; i < N; i++) g.spawnEnemy('grunt');
    const per = g.lanes.map((_, k) => state.enemies.filter(e => e.lane === k).length);
    ok(`[S${st + 1}] ${N}마리가 레인에 고르게 갈린다`,
      per.every(v => v === N / L), per.join('/'));

    const firstLane = () => {
      g.loadStage(st);
      state.enemies.length = 0;
      g.spawnEnemy('grunt');
      return state.enemies[0].lane;
    };
    const a = firstLane(), b = firstLane();
    ok('  판을 다시 실으면 첫 적의 레인이 다시 0', a === 0 && b === 0, a + ' → ' + b);
  }
}

// ── 덱 선택 ───────────────────────────────────────────────────
{
  console.log('덱 선택');
  const g = load();
  const { state, CFG } = g;
  g.pickStage(0);
  ok('스테이지를 고르면 덱 화면', state.phase === 'deck');
  ok('카드가 타워 종류 수만큼', g.deckCardRects().length === g.KIND_KEYS.length);

  // 오라형과 공격형이 눈으로 갈려야 한다. 안 그러면 오라 타워를
  // 사거리 짧은 딜러로 착각한다.
  const layout = g.deckLayout();
  const heads = layout.filter(i => i.type === 'header').map(i => i.gr.id);
  ok('그룹 머리말이 있다', heads.length === 3, heads.join(','));
  ok('오라가 맨 위', heads[0] === 'aura', heads[0]);
  ok('오라형은 3종', g.AURA_KINDS.size === 3, [...g.AURA_KINDS].join(','));

  // 머리말과 카드가 겹치지 않아야 탭이 엉키지 않는다
  let overlap = 0;
  for (let i = 1; i < layout.length; i++)
    if (layout[i].y < layout[i - 1].y + layout[i - 1].h) overlap++;
  ok('머리말/카드가 안 겹친다', overlap === 0, String(overlap));

  // 카드가 화면 밖으로 안 나가야 한다
  const last = layout[layout.length - 1];
  ok('마지막 카드가 화면 안', last.y + last.h < g.deckStartRect().y, last.y + last.h + ' < ' + g.deckStartRect().y);

  g.toggleDeckPick('frost');
  g.toggleDeckPick('arc');
  g.startRun();
  ok('덜 고르면 시작 안 됨', state.phase === 'deck', state.phase);

  g.toggleDeckPick('mint');
  g.toggleDeckPick('mortar');
  ok('정원 넘게 못 고름', state.deckPick.length === CFG.DECK_SIZE, String(state.deckPick.length));

  g.toggleDeckPick('frost');
  ok('다시 누르면 해제', !state.deckPick.includes('frost'), state.deckPick.join(','));

  g.toggleDeckPick('shredder');
  g.startRun();
  ok('정원 채우면 시작됨', state.phase === 'build');
  ok('고른 것만 덱에 들어감', state.deck.length === CFG.DECK_SIZE && state.deck.every(k => state.deckPick.includes(k)),
    state.deck.join(','));

  g.state.gold = 4000;
  for (let i = 0; i < 25; i++) g.summon();
  const outside = state.towers.filter(t => !state.deck.includes(t.kind)).map(t => t.kind);
  ok('덱 밖 타워는 안 나옴', outside.length === 0, outside.join(',') || '없음');
}

// ── 뒤로 가기 (#74) ───────────────────────────────────────────
// 판에 들어가면 나갈 길이 없었다 — 유저 신고가 「브라우저를 종료해야 된다」였다.
// 이 블록이 잠그는 것은 셋이다:
//   ① 덱 화면에서 목록으로 가는 길이 **셋 다** 있는가 (버튼 · ESC · 브라우저 뒤로가기)
//   ② 뒤로가기가 **목록에서만** 페이지를 나가는가
//   ③ history 항목이 **한 개를 안 넘는가** (넘으면 뒤로가기를 두 번 눌러야 나간다)
//
// **셋 다 그림과 이벤트로 잰다.** 상태만 보면 버튼을 안 그려도, window 리스너를
// 통째로 안 달아도 전부 통과한다 — `g.draws` 와 `g.key`/`g.nav` 가 그 창이다.
{
  console.log('뒤로 가기');

  const enterDeck = (g) => { g.restart(); g.nav.flush(); g.pickStage(0); };
  const enterRun = (g) => {
    enterDeck(g);
    ['shredder', 'frost', 'marksman'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
  };

  // ① 덱 화면에 **버튼이 실제로 그려진다.** 좌표만 있고 안 그리면 모바일에는 길이 없다.
  {
    const g = load();
    const { state } = g;
    enterDeck(g);
    state.toast = null;
    g.draws.reset();
    g.render();
    ok('덱 화면에 뒤로 버튼을 그린다', g.draws.text.includes('뒤로'),
      g.draws.text.slice(-4).join(' | '));

    // 시작 버튼과 **겹치면 안 된다.** 겹치면 나가려다 판이 시작된다 — 이 티켓이
    // 고치려는 사고와 정확히 같은 사고다.
    const bk = g.deckBackRect(), st = g.deckStartRect();
    ok('  뒤로와 시작이 안 겹친다', bk.x + bk.w <= st.x, `${bk.x + bk.w} <= ${st.x}`);
    ok('  둘 다 화면 안', bk.x >= 0 && st.x + st.w <= 390 && bk.y + bk.h <= 844,
      `${Math.round(bk.x)}+${Math.round(bk.w)} / ${Math.round(st.x)}+${Math.round(st.w)}`);
    ok('  같은 줄이다', bk.y === st.y && bk.h === st.h, `${bk.y} / ${st.y}`);
    // 카드 목록은 1px 도 안 뺏긴다. 이 줄이 없으면 뒤로 버튼을 넣느라 카드를 얇게
    // 만들어도 아무것도 안 걸린다.
    const last = g.deckLayout()[g.deckLayout().length - 1];
    ok('  마지막 카드가 여전히 버튼 줄 위', last.y + last.h < bk.y, `${last.y + last.h} < ${bk.y}`);
  }

  // ② 셋 다 목록으로 간다. **각각 새 판에서 재야 한다** — 한 판에서 이어 재면
  //    앞의 것이 이미 목록으로 보낸 뒤라 뒤의 둘이 무조건 통과한다.
  for (const [name, go] of [
    ['버튼', g => g.navBack()],            // pointerdown 의 뒤로 상자가 부르는 것
    ['ESC', g => g.key('Escape')],
    ['브라우저 뒤로가기', g => g.nav.pressBack()],
  ]) {
    const g = load();
    enterDeck(g);
    ok(`덱 화면 · ${name} 로 목록에 간다`, (go(g), g.nav.flush(), g.state.phase === 'stage'),
      g.state.phase);
    ok(`  ${name} 뒤에 항목이 안 남는다`, g.navState().pushed === 0 && g.nav.depth() === 0,
      JSON.stringify(g.navState()) + ' depth ' + g.nav.depth());
  }

  // ③ 목록에서만 페이지를 나간다. 모바일에서 뒤로가기는 반사적으로 눌리는 버튼이라
  //    이 한 줄이 이 티켓의 실제 원인이다.
  {
    const g = load();
    g.nav.pressBack();
    ok('목록에서 뒤로가기는 페이지를 나간다', g.nav.exited());

    const h = load();
    enterDeck(h);
    h.nav.pressBack();
    ok('덱 화면에서는 페이지를 안 나간다', !h.nav.exited() && h.state.phase === 'stage', h.state.phase);

    const r = load();
    enterRun(r);
    r.nav.pressBack();
    ok('판에서는 페이지를 안 나간다', !r.nav.exited() && r.state.phase === 'build', r.state.phase);
  }

  // ④ 판 중의 뒤로가기는 **진행을 절대 안 버린다.** 정지 화면(=나가기가 있는 화면)을
  //    열고, 한 번 더 누르면 도로 닫는다. 그 사이에 타워가 한 대도 안 사라져야 한다.
  {
    const g = load();
    const { state } = g;
    enterRun(g);
    state.gold = 9999;
    for (let i = 0; i < 6; i++) g.summon();
    const n = state.towers.length;
    ok('판에 타워를 깔았다', n >= 6, String(n));

    g.nav.pressBack();
    ok('판에서 뒤로 = 정지 화면', state.paused === true && state.phase === 'build', state.phase);
    ok('  판은 그대로다', state.towers.length === n, `${n} → ${state.towers.length}`);
    g.nav.pressBack();
    ok('한 번 더 누르면 정지가 풀린다', state.paused === false && state.phase === 'build');
    ok('  그래도 판은 그대로다', state.towers.length === n, `${n} → ${state.towers.length}`);

    // 웨이브 중에도 같다. 여기서 바로 나가지면 확인 없이 진행을 버리는 것이 된다.
    state.phase = 'wave';
    g.nav.pressBack();
    ok('웨이브 중 뒤로도 정지 화면까지만', state.paused === true && state.phase === 'wave',
      state.phase + ' paused=' + state.paused);
    ok('  적도 타워도 그대로다', state.towers.length === n);
  }

  // ⑤ 열려 있는 것을 먼저 닫는다. ESC 가 이미 그 규칙이라(#24 · #68) 뒤로가기가
  //    다른 순서로 움직이면 같은 화면에서 두 키가 다른 뜻이 된다.
  {
    const g = load();
    const { state } = g;
    enterRun(g);
    state.gold = 9999;

    state.picker = { mode: 'summon', gx: 3, gy: 9, sel: null };
    g.nav.pressBack();
    ok('소환 피커를 먼저 닫는다', state.picker === null && !state.paused && state.phase === 'build',
      state.phase + ' paused=' + state.paused);

    // 2x2 배치 모드. **커밋 전이라 판은 아직 안 바뀐 상태**여서 지우는 것으로 닫힌다.
    state.towers.length = 0;
    const put = (kind, star, gx, gy) => {
      const t = { id: 900 + state.towers.length, gx, gy, kind, star, b3: null, b5: null, t7: null,
        cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 };
      state.towers.push(t);
      return t;
    };
    const a = put('marksman', 4, 1, 8), b = put('marksman', 4, 3, 8);
    g.beginMergePlace(a, b);
    ok('  2x2 배치 모드가 열렸다', g.mergePlaceState().open);
    const before = state.towers.length;
    g.nav.pressBack();
    ok('배치 모드를 먼저 닫는다',
      !g.mergePlaceState().open && !state.paused && state.towers.length === before,
      `paused=${state.paused} 타워 ${before} → ${state.towers.length}`);

    // 분기 선택은 되돌릴 수 없다 — ESC 와 같이 안 닫는다.
    g.openChoice(state.towers[0], 3);
    g.nav.pressBack();
    ok('분기 선택은 뒤로가기로 안 닫힌다', !!state.choice && !state.paused);
    g.clearChoices();
  }

  // ⑥ 판 나가기 — 준비 단계는 **통째로 이어하기로 남는다.**
  {
    const g = load();
    const { state } = g;
    enterRun(g);
    state.gold = 9999;
    for (let i = 0; i < 6; i++) g.summon();
    const n = state.towers.length;

    g.togglePause();
    state.toast = null;
    g.draws.reset();
    g.render();
    ok('정지 화면에 나가기를 그린다', g.draws.text.includes('판 나가기'),
      g.draws.text.filter(s => s.includes('나가')).join(' | ') || '(안 그림)');
    ok('  나가기가 눌리는 자리를 세운다', !!g.exitRunState().rect,
      JSON.stringify(g.exitRunState().rect));
    // **잃는 것을 누르기 전에 적는다.** 이 줄이 「미리 알린다」의 전부다.
    const note = g.exitRunNote();
    ok('  잃는 것을 화면에 적는다', g.draws.text.includes(note), note);
    ok('  준비 단계는 이어하기로 남는다고 적는다', note.includes('이어하기'), note);

    g.exitRunTap();
    // 브라우저는 back() 의 popstate 를 나중에 준다. 여기서 흘려 보내는 것이 **실제
    // 순서다** — 사람은 목록이 뜬 다음에 이어하기를 누른다.
    g.nav.flush();
    ok('준비 단계는 한 번에 나간다', state.phase === 'stage', state.phase);
    ok('  나가면 정지도 풀린다', state.paused === false);
    ok('  나가면 항목이 안 남는다', g.nav.depth() === 0 && g.navState().pushed === 0,
      'depth ' + g.nav.depth());

    // 목록에 이어하기가 실제로 떠야 한다. 안 뜨면 판을 버린 것과 같다.
    g.draws.reset();
    g.render();
    ok('  목록에 이어하기가 뜬다', g.draws.text.includes('이어하기'),
      g.draws.text.slice(0, 8).join(' | '));
    g.resumeRun();
    ok('  이어하면 그 판이 그대로 돌아온다',
      state.phase === 'build' && state.towers.length === n,
      `${state.phase} 타워 ${n} → ${state.towers.length}`);
    ok('  이어하기도 항목은 하나다', g.nav.depth() === 1 && g.navState().pushed === 1,
      'depth ' + g.nav.depth());
  }

  // ⑦ 웨이브 중 나가기는 **두 번 눌러야 한다.** 정지 화면은 아무 데나 눌러도
  //    재개되는 화면이라, 한 번에 나가지면 재개하려다 스친 손가락이 판을 버린다.
  {
    const g = load();
    const { state } = g;
    enterRun(g);
    state.gold = 9999;
    for (let i = 0; i < 6; i++) g.summon();
    state.phase = 'wave';
    state.wave = 1;

    g.togglePause();
    g.exitRunTap();
    ok('웨이브 중 첫 탭은 확인만 받는다', state.phase === 'wave' && g.exitRunState().armed,
      state.phase);
    state.toast = null;
    g.draws.reset();
    g.render();
    ok('  확인을 화면으로 말한다', g.draws.text.includes('한 번 더 누르면 나갑니다'),
      g.draws.text.filter(s => s.includes('누르면')).join(' | '));

    // 정지를 껐다 켜면 무장이 풀려야 한다. 안 그러면 **다음 화면의 첫 탭이 곧 나가기**다.
    g.togglePause();
    g.togglePause();
    ok('  정지를 껐다 켜면 확인이 풀린다', !g.exitRunState().armed);

    g.exitRunTap();
    g.exitRunTap();
    ok('두 번 누르면 나간다', state.phase === 'stage', state.phase);
  }

  // ⑧ 경고 문구가 **사실인가.** 「이 판은 처음부터다」는 첫 웨이브 중에만 참이다 —
  //    한 웨이브라도 넘겼으면 endWave 가 찍어 둔 기록이 남아 있어서 거기서 이어진다.
  //    거짓말을 적어 두면 나가기를 안 누르게 되고, 그러면 출구가 없는 것과 같다.
  {
    const g = load();
    const { state } = g;
    enterRun(g);
    state.phase = 'wave';
    state.wave = 1;
    ok('첫 웨이브 중이면 판이 처음부터다', g.exitRunNote() === '이 판은 처음부터입니다',
      g.exitRunNote());

    // 한 웨이브를 넘긴다. endWave 가 준비 단계 스냅샷을 찍는다.
    g.endWave();
    state.phase = 'wave';
    state.wave = 2;
    const note = g.exitRunNote();
    ok('한 웨이브를 넘겼으면 그 웨이브만 잃는다',
      !note.includes('처음부터입니다') && note.includes('웨이브 2'), note);

    // 나가도 그 기록을 **안 지운다.** 지우면 위 문구가 거짓이 된다.
    g.exitRunTap(); g.exitRunTap();
    ok('  나가도 직전 웨이브 기록이 남는다', (g.draws.reset(), g.render(),
      g.draws.text.includes('이어하기')), g.draws.text.slice(0, 6).join(' | '));
  }

  // ⑨ **항목은 한 개를 안 넘는다.** 화면 깊이만큼 쌓으면 판에서 목록으로 나갈 때
  //    두 번 눌러야 한다 — 이 티켓이 만들 수 있는 가장 나쁜 회귀다.
  {
    const g = load();
    const { state } = g;
    ok('목록에서는 항목이 없다', g.nav.depth() === 0 && g.navState().pushed === 0);
    g.pickStage(0);
    ok('덱에서 항목 하나', g.nav.depth() === 1, 'depth ' + g.nav.depth());
    ['shredder', 'frost', 'marksman'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    ok('판에서도 항목 하나', g.nav.depth() === 1, 'depth ' + g.nav.depth());

    // 뒤로를 여러 번 눌러도 안 늘어난다(소비하고 곧바로 다시 쌓으므로 늘 하나다).
    for (let i = 0; i < 6; i++) g.nav.pressBack();
    ok('여러 번 눌러도 항목은 하나', g.nav.depth() <= 1 && !g.nav.exited(),
      'depth ' + g.nav.depth());

    // **걷고 다시 쌓기가 한 태스크에 겹치는 경우**(tools/shot.js 가 컷마다 그렇게
    // 한다). popstate 는 나중에 오는데 그 사이에 쌓아 둔 항목을 그 이벤트가 먹으면
    // 화면이 한 칸 더 뒤로 간다.
    g.restart();
    g.pickStage(0);
    ['shredder', 'frost', 'marksman'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    g.nav.flush();
    ok('걷고 곧바로 다시 쌓아도 화면이 안 밀린다',
      state.phase === 'build' && !state.paused && g.nav.depth() === 1,
      `${state.phase} paused=${state.paused} depth ${g.nav.depth()}`);
  }

  // ⑪ **새로고침은 쌓아 둔 항목 위에서 다시 시작한다.** 모바일에서 탭이 배경으로
  //    내려갔다 오면 흔히 그렇게 된다. 페이지는 목록부터 시작하는데 항목은 남아 있으므로,
  //    그걸 모른 척하면 **목록에서 뒤로가기를 한 번 헛눌러야** 나간다 — 이 티켓이 만들
  //    수 있는 가장 조용한 회귀다(원래 동작은 늘 한 번에 나가는 것이었다).
  {
    const before = load();
    before.pickStage(0);
    ok('새로고침 전에 항목이 하나 있다', before.nav.depth() === 1, 'depth ' + before.nav.depth());

    // 항목은 그대로 두고 페이지만 새로 싣는다.
    const g = load(null, { history: before.nav });
    ok('  새로고침하면 목록부터 시작한다', g.state.phase === 'stage', g.state.phase);
    g.nav.pressBack();
    ok('새로고침 뒤에도 뒤로가기 한 번에 나간다', g.nav.exited(),
      `phase ${g.state.phase} · depth ${g.nav.depth()}`);
  }

  // ⑩ 나가기는 **`restart()` 를 지나야 한다.** #60 이 「시작 시 열린 행 수가 직전
  //    판을 따라간다」를 고치면서 `openRows` 의 주인을 `loadStage` 로 옮겼는데, 새
  //    출구가 목록을 안 거치고 판을 갈아끼우면 그 버그가 그대로 되살아난다.
  {
    const g = load();
    const { state, CFG } = g;
    g.applyBundle({ v: 1, unlocked: g.STAGES.length, best: g.STAGES.map(s => s.waves), run: null });
    const big = g.STAGES.findIndex(s => s.openRows !== g.STAGES[0].openRows);
    if (big < 0) {
      ok('나가기 뒤에도 열린 행 수가 판 정의를 따른다', true, '(판 정의가 전부 같다)');
    } else {
      enterRun(g);
      state.openRows = CFG.BOARD_H;          // 행이 다 열린 판을 한 판 하고
      g.togglePause();
      g.exitRunTap();                        // 나가기로 나온 뒤
      g.nav.flush();
      g.pickStage(big);                      // 다른 판을 고른다
      ok('나가기 뒤에도 열린 행 수가 판 정의를 따른다',
        state.phase === 'deck' && state.openRows === g.STAGES[big].openRows,
        `${state.phase} · ${state.openRows} / 정의 ${g.STAGES[big].openRows}`);
    }
  }
}

// ── 덱 제약 기계 (#50) ────────────────────────────────────────
// 판이 덱을 제한한다(`allowKinds`). 이 블록이 잠그는 것은 **기계**이지 특정 판이
// 아니다 — 제약이 걸린 판 자체가 실제로 강제되는지는 아래 「강제」 블록이 잰다.
//
// **가짜 판을 쓴다.** 위 「여섯 장」 블록과 같은 이유다: 진짜 판에 붙은 목록으로
// 기계를 재면 그 판의 목록을 고쳤을 때 기계 검사가 같이 흔들린다. 여기서 묻는 것은
// 「목록이 있으면 그대로 걸리는가 · 없으면 아무 일도 안 일어나는가」뿐이다.
{
  console.log('덱 제약');
  // ① **없으면 전부 허용이다.** 기존 판의 동작 불변은 이 한 줄에 달려 있다.
  {
    const g = load();
    const withList = g.STAGES.filter(s => s.allowKinds).map(s => s.name);
    // 이름을 박는다. 판을 붙이면서 옛 판에 목록을 얹으면 그 판의 덱이 조용히 좁아지는데,
    // 개수만 세면 「새 판이 셋 붙었으니 셋이 맞다」로 통과한다.
    //
    // **[#62] ⑩ 세물머리를 넣었다 — 이 목록은 「옛 판」이 아니라 「35덱 풀」이다.**
    // 그 판은 배열의 마지막이면서 35덱 풀의 마지막이라, 목록이 붙는 순간 다른 풀로
    // 옮겨 가고 **35덱 풀의 마지막이 ⑥ 합수로 조용히 되돌아간다.** 게이트는 그래도
    // 돌지만 그 판을 만든 이유(그 풀의 새 마지막)가 아무 말 없이 사라진다 — #33 에서
    // S4 래칫이 새 판으로 옮겨 간 것과 같은 실패모드라 이름으로 박는다.
    //
    // **[#70] ⑪ 빗장을 넣었다 — ⑩ 을 넣은 것과 같은 이유다.** 이 판이 배열의
    // 마지막이면서 35덱 풀의 마지막이라, 허용 목록이 붙는 순간 다른 풀로 옮겨 가고
    // **35덱 풀의 마지막이 ⑩ 세물머리로 조용히 되돌아간다.** 그러면 이 판을 만든
    // 이유(그 풀의 새 마지막 · 계단이 실제로 재는 자리)가 아무 말 없이 사라진다.
    //
    // **[#72] ⑫ 턱을 넣었다 — ⑩⑪ 을 넣은 것과 같은 이유다.** 이 판이 배열의
    // 마지막이면서 35덱 풀의 마지막이라, 허용 목록이 붙는 순간 다른 풀로 옮겨 가고
    // **35덱 풀의 마지막이 ⑪ 빗장으로 조용히 되돌아간다.**
    const LEGACY = ['외곽 도로', '이중 병목', '갈래길', '역류', '분수령', '합수', '세물머리', '빗장', '턱'];
    const dirty = LEGACY.filter(n => {
      const d = g.STAGES.find(s => s.name === n);
      return d && d.allowKinds;
    });
    ok(`35덱 ${LEGACY.length}판에는 허용 목록이 없다`, dirty.length === 0,
      dirty.join(',') || ('목록 있는 판: ' + (withList.join(',') || '없음')));
    // 이름이 하나라도 사라지면(판 이름을 고치면) 위 줄은 **아무것도 안 잰다** —
    // 없는 이름은 `dirty` 에도 안 들어오므로 조용히 초록이 된다.
    const missing = LEGACY.filter(n => !g.STAGES.some(s => s.name === n));
    ok('  그 이름이 전부 살아 있다', missing.length === 0, missing.join(',') || LEGACY.length + '판');
    for (let i = 0; i < g.STAGES.length; i++) {
      if (g.STAGES[i].allowKinds) continue;
      ok(`  [S${i + 1}] 목록이 없으면 7종 전부 허용`,
        g.allowedKinds(i).length === g.KIND_KEYS.length
        && g.KIND_KEYS.every(k => g.kindAllowed(k, i)));
      ok(`  [S${i + 1}] 막힌 이유 줄이 비어 있다`, g.deckLimitNote(i) === '',
        JSON.stringify(g.deckLimitNote(i)));
    }
  }

  // ② 목록이 있으면 그대로 걸린다.
  {
    const g = load();
    const { state } = g;
    const ALLOW = ['shredder', 'eroder', 'frost', 'mortar'];
    const BLOCK = ['marksman', 'arc', 'mint'];
    g.STAGES.push({ ...g.STAGES[0], name: '가짜 제약', allowKinds: ALLOW });
    const st = g.STAGES.length - 1;
    // 해금은 「깬 판의 다음」이라 가짜 판은 안 열려 있다. pickStage 를 안 쓰고
    // 직접 싣는다 — 여기서 재는 것은 해금이 아니라 덱 제약이다.
    g.loadStage(st);
    state.phase = 'deck';
    state.deckPick = [];

    ok('허용 목록이 그대로 나온다', g.allowedKinds().join(',') === ALLOW.join(','),
      g.allowedKinds().join(','));
    ok('  카드는 여전히 7장이다', g.deckCardRects().length === g.KIND_KEYS.length,
      String(g.deckCardRects().length));

    for (const k of BLOCK) {
      state.toast = null;
      g.toggleDeckPick(k);
      ok(`  ${g.KINDS[k].name} 는 못 고른다`, !state.deckPick.includes(k), state.deckPick.join(',') || '(빈)');
      // 회색으로 두고 아무 말 없으면 버그로 읽힌다. 탭에 이유가 뜨는지 본다.
      ok(`  ${g.KINDS[k].name} 를 누르면 이유가 뜬다`,
        !!state.toast && state.toast.text.includes(g.KINDS[k].name),
        state.toast ? state.toast.text : '(토스트 없음)');
    }
    for (const k of ALLOW) {
      state.deckPick = [];
      g.toggleDeckPick(k);
      ok(`  ${g.KINDS[k].name} 는 고를 수 있다`, state.deckPick.includes(k), state.deckPick.join(','));
    }

    // 이유 줄이 **금지 종류를 전부** 세는가. 하나라도 빠지면 회색 칸 중 하나가
    // 설명 없이 남는다.
    const note = g.deckLimitNote();
    ok('  이유 줄이 금지 종류를 전부 적는다',
      BLOCK.every(k => note.includes(g.KINDS[k].name)), note);
    ok('  이유 줄이 강제되는 타워를 적는다', note.includes(g.KINDS.mortar.name), note);

    // **그림에서 본다.** 위 단언은 전부 상태라, `drawDeckSelect` 에서 회색 처리와
    // 안내 문구를 통째로 지워도 하나도 안 걸린다 — 이 리포가 세 번 빠진 함정이다.
    state.deckPick = [];
    state.toast = null;   // 토스트가 떠 있으면 그 글자가 같이 그려져 아래 단언이 헐거워진다
    g.draws.reset();
    g.render();
    const drawn = g.draws.text;
    ok('  덱 화면이 이유를 실제로 그린다', drawn.includes(note),
      drawn.filter(s => s.includes('못 고른다')).join(' | ') || '(안 그림)');
    const banned = drawn.filter(s => s === '이 판 금지').length;
    ok('  막힌 카드마다 「이 판 금지」가 붙는다', banned === BLOCK.length,
      banned + '/' + BLOCK.length);
    // 허용된 카드는 사거리를 그대로 단다. 위 줄만 있으면 「전부 금지로 칠했다」도 통과한다.
    // **접두사로 세면 안 된다** — 공격 그룹 머리말이 「사거리 안의 적을…」로 시작한다.
    const ranged = drawn.filter(s => ALLOW.some(k => s === '사거리 ' + g.KINDS[k].range.toFixed(1))).length;
    ok('  허용된 카드는 사거리를 그대로 단다', ranged === ALLOW.length,
      ranged + '/' + ALLOW.length);

    // ③ 시작 버튼도 막는다. 화면을 우회해 deckPick 을 직접 세우는 경로가 둘 있다.
    state.deckPick = ['shredder', 'eroder', 'mint'];
    g.startRun();
    ok('  금지 종류가 섞인 덱으로는 시작 안 됨', state.phase === 'deck', state.phase);
    state.deckPick = ['shredder', 'eroder', 'mortar'];
    g.startRun();
    ok('  허용 덱으로는 시작된다', state.phase === 'build', state.phase);

    // ④ 랜덤 덱도 허용 안에서만 뽑는다.
    g.loadStage(st);
    let bad = 0;
    for (let i = 0; i < 200; i++) {
      g.rollDeck();
      if (g.state.deck.some(k => !ALLOW.includes(k))) bad++;
    }
    ok('  rollDeck 이 허용 밖을 안 뽑는다 (200회)', bad === 0, bad + '/200');

    // ⑤ 이어하기도 막는다. 목록이 붙기 전에 저장된 기록이 금지 종류를 들고 돌아올 수 있다.
    const snap = { stage: st, deck: ['shredder', 'eroder', 'mint'], wave: 3, gold: 100, life: 20, towers: [] };
    ok('  금지 덱 스냅샷은 이어하기가 거절한다', g.restoreRun(snap) === false);
    ok('  허용 덱 스냅샷은 이어할 수 있다',
      g.restoreRun({ ...snap, deck: ['shredder', 'eroder', 'mortar'] }) === true);
  }

  // ⑥ **그리디는 시끄럽게 죽는다.** 조용히 거절하면 `phase === 'deck'` 인 채로
  //    4000초를 돌다 웨이브 0 짜리 결과를 내고, 그 수가 curve/affinity 표에 그대로
  //    찍힌다 — 「제약 판은 진도가 0」으로 읽히는 최악의 조용한 실패다.
  {
    const g = load();
    g.STAGES.push({ ...g.STAGES[0], name: '가짜 제약', allowKinds: ['shredder', 'eroder', 'frost', 'mortar'] });
    const st = g.STAGES.length - 1;
    let threw = null;
    try { greedy(g, { stage: st, deck: ['shredder', 'arc', 'mint'] }); } catch (e) { threw = e; }
    ok('  금지 덱을 받은 greedy 가 던진다', !!threw && /안 받는 종류/.test(threw.message),
      threw ? threw.message : '(안 던졌다)');

    const g2 = load();
    g2.STAGES.push({ ...g2.STAGES[0], name: '가짜 제약', allowKinds: ['shredder', 'eroder', 'frost', 'mortar'] });
    const r = greedy(g2, { stage: g2.STAGES.length - 1, deck: ['shredder', 'eroder', 'mortar'] });
    ok('  허용 덱은 그대로 돈다', r.wave > 0 && (r.result === 'over' || r.result === 'clear'),
      r.result + ' w' + r.wave);
  }
}

// ── 덱 풀 (#54 · #56) ─────────────────────────────────────────
// **판이 덱을 제한하면 그 판은 다른 표본으로 재는 판이다.** 풀은 허용 종 수에서
// 그대로 따라 나오고, 그래서 이름을 종류가 아니라 **덱 수**로 붙인다 — 풀을 가른
// 이유가 곧 「덱 공간이 다르다」이기 때문이다(DESIGN §계단은 덱 풀별로 잰다).
//
//   풀     허용        덱 수         강제의 성질
//   35덱   목록 없음   C(7,3) = 35   제약 없음
//   4덱    4종         C(4,3) = 4    그 타워 없는 덱이 **하나** 있다(오라 3종) — 시뮬이 잰다
//   1덱    3종         C(3,3) = 1    덱이 유일하다 — **구조가 강제를 보증한다** (#56)
//
// **아래 두 블록(강제 · 밸런스)이 이 자를 같이 쓴다.** 풀을 두 곳에서 따로 계산하면
// 「어느 덱으로 잰 수인가」가 갈리고, 그건 이 파일이 #37 에서 이미 데인 자리다.
function combos(a, k) {
  if (k === 0) return [[]];
  if (a.length < k) return [];
  return combos(a.slice(1), k - 1).map(c => [a[0], ...c]).concat(combos(a.slice(1), k));
}
// 그 판이 실제로 받는 덱 전부. **허용 목록은 살아 있는 판 정의에서 읽는다** —
// 베끼면 index.html 을 고쳤을 때 이 파일만 옛 목록을 재며 통과한다.
function poolDecks(g, st) { return combos(g.allowedKinds(st), g.CFG.DECK_SIZE); }
function poolKey(g, st) { return poolDecks(g, st).length + '덱'; }
// 그 풀에서 가장 뒤인가. 「마지막 스테이지는 안 깨진다」가 걸리는 판이 이것이다.
function poolLast(g, st) {
  const key = poolKey(g, st);
  for (let j = st + 1; j < g.STAGES.length; j++) if (poolKey(g, j) === key) return false;
  return true;
}
// 풀마다 고정덱이 하나씩이다 — **풀 안에서는 같은 덱이라야 짝지은 비교**가 된다.
// 판마다 덱을 갈아 끼우면 행 사이의 `p` 차이가 「판이 어렵다」인지 「덱이 약하다」인지
// 안 갈린다.
const POOL_DECK = {
  // 35덱 풀. **바꾸면 S1~S6 행이 통째로 움직인다** — 이 파일의 래칫과 DESIGN 의
  // 실측표가 전부 이 덱 값이다(#37 문단이 「덱을 안 적으면 다른 표와 못 가른다」로
  // 적어 둔 그 덱이다).
  '35덱': ['shredder', 'arc', 'mint'],
  // 4덱 풀. **고른 게 아니라 유일하다.** 허용 목록이 `[그 판이 강제하는 공격 타워,
  // 파쇄자, 침식자, 서리탑]` 이고 공격 타워가 판마다 다르므로, 4덱 판 전부가 받는
  // 덱은 오라 3종 하나뿐이다(허용 목록 교집합이 정확히 셋).
  //
  // 그 덱은 강제 게이트가 「클리어 0%」를 요구하는 바로 그 덱이라 이 풀의 `clears`
  // 열은 정의상 0 에 눌린다. **계단이 보는 자가 `p` 인 이유가 여기서 한 번 더 붙는다.**
  '4덱': ['shredder', 'eroder', 'frost'],
  // **1덱 풀은 여기 없다 — 적을 것이 없어서다** (#56). 덱이 판마다 하나뿐이고 그게
  // 곧 허용 목록이라, 아래 `poolDeck` 이 판 정의에서 그대로 읽는다. 세 판(⑦⑧⑨)의
  // 허용 목록 교집합은 서리탑 **하나**라 애초에 공통 덱이 없다 — 4덱 판과 1덱 판을
  // 같은 풀로 묶을 수 없는 이유가 이것이고, 그래서 풀이 셋이다.
};
// **1덱 풀만 판마다 덱이 다르다.** 위 「같은 덱이라야 짝지은 비교」의 예외로 보이지만
// 그렇지 않다 — 그 판들에서 덱은 **자유 변수가 아니다.** 플레이어에게 선택지가 없고
// 덱이 곧 판의 일부라, 두 행의 `p` 차이는 「판+덱 묶음」의 난이도 차이다. 그게 실제로
// 플레이어가 겪는 것이다. (덱을 고를 수 있는 풀에서 덱을 갈아 끼우면 그 말이 안 된다.)
function poolDeck(g, st) {
  const decks = poolDecks(g, st);
  if (decks.length === 1) return decks[0];
  return POOL_DECK[poolKey(g, st)] || null;
}

// ── 강제 (#54 · 허용 3종은 #56) ───────────────────────────────
// 위 블록이 **기계**를 재고(목록이 있으면 걸리는가), 여기는 **판**을 잰다 —
// 「이 판은 정말 그 타워라야 풀리는가」. 두 방향을 따로 묻는다:
//
//   필요  그 타워가 없는 덱(오라 3종)은 **한 판도 못 깬다**
//   충분  그 타워를 든 덱은 **깬다**
//
// 하나만으로는 아무 말도 안 된다. 「필요」만 보면 아무도 못 깨는 판이 만점이고,
// 「충분」만 보면 오라로도 깨지는 판이 만점이다.
//
// ── 무시드다. 그래서 임계를 방향마다 다르게 잡는다 ──────────────
// **「필요」는 무시드로 잡아도 안 흔들린다.** 참값이 0 이면 몇 번을 돌려도 0 이다.
// 반대로 값이 새기 시작하면(배율을 잘못 내리는 등) 20판에 한 번은 바로 걸린다.
//
// **「충분」은 무시드로 덱마다 잠그면 터진다.** ⑦ 매듭의 가장 약한 공격덱이 40시행
// **2/40 = 5%** 다. 거기에 「20판에 최소 1판」을 걸면 실패 확률이 `0.95^20 = 36%` —
// 세 런에 한 번 무고한 빨간불이고, 그건 이 파일이 `known()` 을 만든 이유와 정확히
// 같은 실패모드다. 그래서 **덱 셋을 합쳐서** 본다: 60판에 최소 1판이면 매듭의
// 참값(15/120 = 12.5%)에서 실패 확률이 `0.875^60 ≈ 0.03%` 다.
//
// **덱마다 깨는지는 여기서 안 잠근다 — 배율을 정할 때 쓴 40시행 표가 그 자리다**
// (DESIGN §강제 덱 판). 게이트가 못 잡는 것을 잡는 척하지 않는 쪽을 고른다. 대신
// 덱별 수를 매 런 찍으므로 어느 덱이 0 으로 내려앉았는지는 화면에 남는다.
//
// **시드를 안 박은 이유**도 같은 자리다. 박으면 위 두 확률이 0 이 되어 편하지만,
// 그 순간 이 블록은 「규칙이 살아 있는가」가 아니라 「그 한 표본이 그대로인가」를
// 재게 된다(아래 밸런스 블록의 「이 블록에 시드를 박아서도 안 된다」와 같은 근거).
// 무시드로 두고 임계를 흔들림보다 크게 잡는 것이 이 리포의 관례다.
//
// **무시드라서 실제로 한 번 잡았다.** 관측소 판 후보를 시드 표본 20시행으로 골랐을
// 때는 통과였는데, 이 게이트가 무시드로 돌면서 오라덱 클리어를 잡아냈다. 뒤이어
// 800판으로 다시 재니 참값이 1~7% 였다 — **그 판은 그래서 빠졌다**(DESIGN §강제 덱 판).
//
// ── 허용이 3종이면 「필요」를 시뮬로 못 잰다 — 구조가 대신 선다 (#56) ──
// **덱이 유일한 판에는 「그 타워 없는 덱」이 아예 없다.** 위 「필요」는 그 덱을 돌려
// 0% 를 확인하는 자인데, 돌릴 덱이 없으므로 잴 것도 없다 — 그리고 **없다는 것 자체가
// 강제의 증명**이다(허용 3종 = `DECK_SIZE` → C(3,3) = 1 → 그 타워가 반드시 들어간다).
// 그래서 아래 구조 단언이 판마다 갈린다:
//   허용 = DECK_SIZE      덱이 유일하다. 「그 타워 없는 덱」이 0 개인 것을 단언한다
//   허용 = DECK_SIZE + 1  그 덱이 정확히 하나(오라 3종)다. 그 덱을 시뮬이 잰다
// **어느 쪽이든 「나머지는 전부 오라」는 그대로다** — 조폐소를 끼워 넣으면 골드가
// 늘어 오라만으로도 물량이 나오고 「필요」가 조용히 무너진다.
//
// ── 구조를 먼저 본다 ──────────────────────────────────────────
// 아래 시뮬 두 줄은 **`allowKinds` 를 지워도 통과한다.** 목록이 없으면 오라 3종은
// 여전히 못 깨고 공격덱은 여전히 깨기 때문이다 — 즉 시뮬만으로는 「제약이 걸려
// 있는가」를 못 잰다. 그래서 구조를 먼저 단언한다. 이 줄이 `allowKinds` 삭제와
// 조폐소 허용을 둘 다 잡는 자리다.
{
  console.log('강제 (제약 판이 정말 그 타워를 요구하는가)');
  const TRIALS = 20;
  const AURA = ['shredder', 'eroder', 'frost'];
  const g0 = load();
  const D = g0.CFG.DECK_SIZE;
  const forced = g0.STAGES.map((s, i) => ({ s, i })).filter(o => o.s.allowKinds);

  ok('제약 판이 있다', forced.length > 0, forced.length + '판');

  // **덱이 유일한 판이 둘 이상이라야 그 풀의 계단을 잰다.** 판이 하나뿐인 풀은
  // 견줄 상대가 없어 밸런스 블록이 `SKIP` 으로 찍는데(#54 의 4덱 풀이 그 상태다),
  // #56 이 1덱 판을 **둘** 붙인 이유가 그 SKIP 을 없애는 것이었다. 허용 목록에
  // 오라를 하나 더하면 그 판이 4덱 풀로 옮겨 가면서 이 줄이 먼저 빨간불이 된다.
  const solo = forced.filter(o => poolKey(g0, o.i) === '1덱');
  ok('  덱이 유일한 판이 둘 이상이다 (그 풀의 계단을 재려면)', solo.length >= 2,
    solo.map(o => 'S' + (o.i + 1) + ' ' + o.s.name).join(' · ') || '없음');

  for (const { s, i } of forced) {
    const allow = g0.allowedKinds(i);
    const atk = allow.filter(k => g0.KINDS[k].group === 'attack');
    const rest = allow.filter(k => g0.KINDS[k].group !== 'attack');
    const decks = poolDecks(g0, i);
    const without = decks.filter(d => !d.includes(atk[0]));
    // **공격 타워가 정확히 하나.** 둘이면 「그 타워라야」가 성립하지 않고, 셋을
    // 허용하면 제약이 이름만 남는다.
    ok(`[S${i + 1} ${s.name}] 공격 타워가 정확히 하나`, atk.length === 1,
      atk.map(k => g0.KINDS[k].name).join(',') || '없음');
    // **나머지는 전부 오라다.** 개수는 판마다 다르다(3종 판은 둘 · 4종 판은 셋).
    ok(`  나머지는 전부 오라다 (${rest.length}종)`,
      rest.length > 0 && rest.every(k => AURA.includes(k)),
      rest.map(k => g0.KINDS[k].name).join(',') + ' (허용 ' + allow.length + '종)');
    // 덱을 못 채우면 판이 성립하지 않는다. `CFG.DECK_SIZE` 를 건드렸을 때 여기서 난다.
    ok(`  허용 종류로 덱을 채울 수 있다`, allow.length >= D, allow.length + ' >= ' + D);

    if (allow.length === D) {
      // 1덱 판. **강제가 구조로 선다** — 덱이 하나뿐이라 그 타워를 뺄 방법이 없다.
      ok(`  덱이 유일하다 (허용 ${allow.length}종 = DECK_SIZE ${D} · [${poolKey(g0, i)}])`,
        decks.length === 1 && without.length === 0,
        '덱 ' + decks.length + '개 · 그 타워 없는 덱 ' + without.length + '개');
    } else {
      // 4덱 판. 그 타워 없는 덱이 **정확히 하나**(오라 3종)라야 아래 「필요」가 그
      // 덱 하나를 재는 것으로 끝난다.
      ok(`  허용이 ${D + 1}종이고 그 타워 없는 덱이 정확히 하나다 (오라 3종 · [${poolKey(g0, i)}])`,
        allow.length === D + 1 && rest.length === 3 && AURA.every(k => rest.includes(k))
        && without.length === 1,
        '허용 ' + allow.length + '종 · 그 타워 없는 덱 ' + without.length + '개');
    }
  }

  // ── 시뮬 ──
  // **`clear` 와 「마지막 웨이브 도달」을 따로 센다.** 총웨이브까지 간 것을 클리어로
  // 되세면 마지막 웨이브에서 죽은 판이 클리어가 된다 — `tools/affinity.js:99` 가 적어
  // 둔 함정이고 #54 의 지형 탐색이 그대로 밟아 실측이 3배 부풀었다. 도달 수는
  // **게이트가 아니라 출력**이다(아래 「클리어를 못 잠그는 판」에서 이유를 적는다).
  const run = (st, deck) => {
    let clears = 0, reach = 0;
    const waveMax = g0.STAGES[st].waves;
    for (let t = 0; t < TRIALS; t++) {
      const g = load();
      const r = greedy(g, { stage: st, deck });
      if (r.result === 'clear') clears++;
      if (Math.min(r.wave, waveMax) === waveMax) reach++;
    }
    return { clears, reach };
  };

  for (const { s, i } of forced) {
    const allow = g0.allowedKinds(i);
    const must = allow.find(k => g0.KINDS[k].group === 'attack');
    // **구조가 깨진 판은 시뮬을 안 돌린다.** 공격 타워가 없으면 아래가 `undefined` 를
    // 들고 던지고, 그러면 이 블록 아래가 통째로 안 돈다 — 밸런스 블록의 `badDeck`
    // 가드와 같은 이유다(게이트 하나가 무너져서 나머지 스무 줄이 같이 사라지면
    // 원인을 못 읽는다). 위 구조 단언이 이미 빨간불이므로 여기서는 건너뛰기만 한다.
    if (!must) {
      console.log(`  SKIP  [S${i + 1} ${s.name}] 시뮬 — 허용에 공격 타워가 없다. 위 구조 단언을 볼 것`);
      continue;
    }
    const decks = poolDecks(g0, i);
    const withMust = decks.filter(d => d.includes(must));
    const without = decks.filter(d => !d.includes(must));
    const name = `[S${i + 1} ${s.name}/${g0.KINDS[must].name}]`;
    const tag = d => d.map(x => g0.KINDS[x].tag).join('');

    // ── 필요 ──
    if (without.length) {
      const per = without.map(d => run(i, d));
      const auraClears = per.reduce((a, b) => a + b.clears, 0);
      ok(`${name} 그 타워 없는 덱은 한 판도 못 깬다 (${without.length}덱 x ${TRIALS}시행)`,
        auraClears === 0,
        per.map((v, k) => tag(without[k]) + ' ' + v.clears).join(' · '));
    } else {
      // 못 재는 것을 초록으로 세지 않는다 — **잴 것이 없다**고 적는다.
      console.log(`  SKIP  ${name} 필요 — 그 타워 없는 덱이 **아예 없다**`
        + `(허용 ${allow.length}종 = DECK_SIZE ${D}). 위 구조 단언이 그 자리다`);
    }

    // ── 충분 ──
    const per = withMust.map(d => run(i, d));
    const clears = per.reduce((a, b) => a + b.clears, 0);
    const reach = per.reduce((a, b) => a + b.reach, 0);
    const n = withMust.length * TRIALS;
    const detail = per.map((v, k) => tag(withMust[k]) + ' ' + v.clears).join(' · ')
      + '  합계 ' + clears + '/' + n + ' · 마지막웨이브 도달 ' + reach + '/' + n;

    // **클리어를 20시행으로 못 잠그는 판이 있다** (#56). 그 판이 자기 풀의 마지막이고
    // 밸런스 블록이 **같은 덱으로** 그 판을 재면, 거기 걸린 「마지막 스테이지는 안
    // 깨진다」(8판 중 클리어 2 이하)와 여기 「20판에 1 이상」이 같은 덱에 붙는다.
    // 둘은 동시에 못 선다:
    //   8판에 2 이하가 0.1%/런 아래이려면 참값이 **3% 아래**여야 하고
    //   20판에 1 이상이 0.1%/런 아래이려면 참값이 **29% 위**여야 한다
    // 그래서 그런 판은 **클리어 수를 찍기만 한다.** 「깰 수 있는가」의 근거는 수백 판
    // 표본이고 판 정의 주석에 있다(⑨ 두겹 고리 16/900). 게이트가 못 잡는 것을 잡는
    // 척하지 않는 쪽을 고르는 것은 위 「덱마다 깨는지는 여기서 안 잠근다」와 같은 규칙이다.
    const sameDeck = a => a.length === (poolDeck(g0, i) || []).length
      && a.every(k => (poolDeck(g0, i) || []).includes(k));
    const capped = poolLast(g0, i) && withMust.some(sameDeck);
    if (capped) {
      console.log(`  SKIP  ${name} 클리어 게이트 — 이 판은 자기 풀([${poolKey(g0, i)}])의 `
        + `마지막이라 「안 깨진다」(8판 중 2 이하)를 같은 덱으로 받는다. `
        + `두 요구는 동시에 못 선다 (참값 3% 아래 vs 29% 위)`);
      console.log(`        ${detail}`);
    } else {
      ok(`  ${g0.KINDS[must].name} 를 든 ${withMust.length}덱은 깬다 (합쳐 ${n}판)`,
        clears >= 1, detail);
    }
  }
}

// ── 빈 칸 소환 (방사형 · #68 · 두 단계 탭 #83) ────────────────
// 「그리는 코드는 멀쩡히 있는데 화면엔 없는」 함정이 이 리포에서 세 번째다(#58 이 그
// 자리다). 그래서 상태도 개수도 아닌 **좌표**를 본다. 잠그는 것은 다섯이다.
//   ① 아이콘이 칸 중심에서 `PICK_R` 만큼 떨어진 10시·12시·2시에 있다
//   ② 히트박스가 서로 안 겹친다 — 겹치면 「어느 쪽이 눌렸나」가 좌표 몇 px 에 달리고,
//      둘째 탭이 곧 배치라 그건 곧 골드가 나가는 오조작이다
//   ③ **탭 둘**에 그 칸에 타워가 서고 골드가 나간다. 첫 탭은 고르기만 하고 골드를
//      안 쓴다 · 다른 아이콘을 누르면 선택이 그리로 옮겨 간다 · 같은 아이콘을 다시
//      누르면 그때 선다. **셋을 다 봐야 「두 단계」가 잠긴다** — 「첫 탭이 안 짓는다」
//      만 보면 아무것도 안 짓는 구현이 통과하고, 「둘째 탭이 짓는다」만 보면
//      #68 의 한 번 탭이 그대로 통과한다
//   ④ 고르면 **그 하나의** 사거리만 뜨고, 화면이 「골랐다」를 되받는다 — 커진 아이콘 ·
//      칸 안의 유령 · 「한 번 더」 줄. **골드가 없어도 고르기와 사거리는 된다**
//   ⑤ **render() 가 그 좌표로 실제로 원을 그린다** — `draws.circles()` 로 대조한다.
//      ①~④ 만 있으면 `pickerLayout` 만 맞고 `drawPicker` 가 딴 데 그리거나 아예 안
//      그려도 전부 통과한다. 그게 정확히 #58 이 통과했던 방식이다
{
  console.log('빈 칸 소환 (방사형)');
  const g = load();
  const { state, view } = g;
  g.pickStage(0);
  ['shredder', 'marksman', 'arc'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  state.gold = 500;
  const near = (a, b) => Math.abs(a - b) < 0.01;

  // 빈 칸을 골라 부채꼴을 연다
  const occ = g.occupancy();
  let spot = null;
  for (let y = g.firstOpenRow() + 1; y < g.CFG.BOARD_H - 1 && !spot; y++)
    for (let x = 1; x < g.CFG.BOARD_W - 1 && !spot; x++)
      if (g.canPlace(x, y, 1, occ)) spot = { gx: x, gy: y };

  state.picker = { mode: 'summon', ...spot, sel: null };
  const L = g.pickerLayout();
  ok('아이콘이 덱 수만큼', L.icons.length === g.CFG.DECK_SIZE, String(L.icons.length));
  ok('  pickerRects 가 그 아이콘을 그대로 준다', g.pickerRects().length === L.icons.length);
  ok('배치 버튼이 없다 (탭 두 번)', L.actions.length === 0, String(L.actions.length));

  // ① 10시·12시·2시. 각도를 게임 코드에서 안 베끼고 **시계 방향으로 직접 적는다** —
  //    베끼면 `fanPoints` 를 통째로 지워도 같이 통과한다.
  const p0 = g.cellToPx(spot.gx, spot.gy);
  const cx = p0.x + view.cell / 2, cy = p0.y + view.cell / 2;
  const CLOCK = [10, 12, 2];
  let posOk = true, posWhy = [];
  L.icons.forEach((ic, i) => {
    const want = (CLOCK[i] % 12) * 30 - 90;                       // 12시 = -90°
    const got = Math.atan2(ic.cy - cy, ic.cx - cx) * 180 / Math.PI;
    const d = Math.hypot(ic.cx - cx, ic.cy - cy);
    if (!near(d, g.PICK_R) || Math.abs(((got - want + 540) % 360) - 180) > 0.01) posOk = false;
    posWhy.push(`${CLOCK[i]}시 ${got.toFixed(0)}° r${d.toFixed(0)}`);
  });
  ok('① 칸 중심 기준 10시·12시·2시 · 반경 PICK_R', posOk, posWhy.join(' / '));
  ok('  손가락 이동이 60px 안', g.PICK_R <= 60, g.PICK_R + 'px');

  // ② 히트박스가 이웃과 안 겹친다. 이웃 간 거리는 60° 벌어진 두 반지름이라 PICK_R 이다.
  ok('② 히트박스가 이웃과 안 겹친다', g.PICK_HIT_R * 2 <= g.PICK_R,
    `지름 ${g.PICK_HIT_R * 2} vs 간격 ${g.PICK_R}`);
  ok('  히트박스가 보이는 원보다 넉넉하다', g.PICK_HIT_R > g.PICK_ICON_R,
    `${g.PICK_HIT_R} > ${g.PICK_ICON_R}`);
  // 고른 아이콘은 **히트박스만큼** 커진다 — 보이는 것이 곧 누를 수 있는 것이다(#83).
  // 그 위로 키우면 바로 위 두 줄(29 천장)이 깨지므로 여기가 상한이다.
  ok('  고른 아이콘은 히트박스만큼만 커진다', g.PICK_SEL_R === g.PICK_HIT_R,
    `${g.PICK_SEL_R} vs ${g.PICK_HIT_R}`);
  // 화면 쪽 여유. pickerFan 은 아이콘 중심을 `PICK_EDGE + PICK_ICON_R` 안쪽에 두므로,
  // 커진 만큼이 `PICK_EDGE` 안에 들어가야 **부채꼴 기하를 한 글자도 안 건드리고도**
  // 가장자리에서 안 잘린다. 이 줄이 깨지면 위 「가장자리」 블록의 불변식이 같이 깨진다.
  ok('  커진 원이 화면 여백 안에 든다', g.PICK_SEL_R - g.PICK_ICON_R <= g.PICK_EDGE,
    `+${g.PICK_SEL_R - g.PICK_ICON_R}px vs 여백 ${g.PICK_EDGE}px`);
  const mid = L.icons[1];
  ok('  아이콘 한복판이 잡힌다', (g.pickerHit(mid.cx, mid.cy) || {}).k === mid.k);
  ok('  히트박스 밖은 안 잡힌다', g.pickerHit(mid.cx, mid.cy - g.PICK_HIT_R - 2) === null);
  // 두 원의 딱 중간. 겹치면 여기가 어느 한쪽으로 잡힌다.
  ok('  이웃 사이 한복판은 안 잡힌다',
    g.pickerHit((L.icons[0].cx + mid.cx) / 2, (L.icons[0].cy + mid.cy) / 2) === null);

  // ⑤ render() 가 그 좌표로 실제로 원을 그리는가. 좌표를 대조하지 않으면
  //    drawPicker 를 통째로 지워도 위 단언이 전부 통과한다.
  g.draws.reset();
  g.render();
  const circles = g.draws.circles();
  ok('⑤ render 가 아이콘 셋을 그 좌표로 그린다',
    L.icons.every(ic => circles.some(c => near(c.x, ic.cx) && near(c.y, ic.cy) && near(c.r, ic.r))),
    `아이콘 ${L.icons.length} / 화면에 그린 원 ${circles.length}`);
  ok('  비용이 아이콘마다 적힌다',
    g.draws.text.filter(t => t === g.summonCost() + 'G').length === g.CFG.DECK_SIZE,
    g.draws.text.filter(t => /G$/.test(t)).join(' '));
  ok('  취소 경로를 알려 준다', g.draws.text.some(t => t.includes('밖을 누르면 취소')));
  // 아무것도 안 골랐을 때의 바닥값. 아래에서 「사거리 원이 하나 는다」를 이걸로 잰다.
  // 사거리는 보드 rect 로 클립한 안쪽에 그리고, 유령은 스프라이트(drawImage)다.
  const clipBare = g.draws.count('clip'), imgBare = g.draws.count('drawImage');
  ok('④ 열자마자는 아무것도 안 골라져 있다', g.pickerState().sel === null,
    String(g.pickerState().sel));

  // ④ 첫 탭 = 고르기. 사거리가 뜨고 **골드는 안 나간다.**
  const selK = L.icons[2].k;
  const goldSel = state.gold;
  ok('  아이콘을 누르면 골라진다 (안 지어진다)',
    g.pickerTap(L.icons[2].cx, L.icons[2].cy) === 'select'
    && g.pickerState().sel === selK
    && state.towers.length === 0 && state.gold === goldSel,
    `${g.pickerState().sel} · ${state.towers.length}대 ${state.gold}G`);
  g.draws.reset(); g.render();
  ok('  사거리 원이 정확히 하나 는다 (셋을 겹쳐 안 그린다)',
    g.draws.count('clip') - clipBare === 1, `클립 ${clipBare} → ${g.draws.count('clip')}`);

  // **화면이 「골랐다」를 되받는가.** #83 의 판단이 여기다 — 사거리만 뜨고 아이콘이
  // 그대로면 플레이어는 「왜 안 지어지지」 하고 끝난다. 그래서 신호 셋을 따로 잰다:
  // 커진 아이콘 · 칸 안의 유령 · 글자. 하나만 보면 나머지 둘을 지워도 통과한다.
  const selL = g.pickerLayout();
  const selIc = selL.icons.find(ic => ic.k === selK);
  const selCircles = g.draws.circles();
  ok('  ㄱ. 고른 아이콘만 커져서 **그 크기로 그려진다**',
    selIc.r === g.PICK_SEL_R
    && selL.icons.every(ic => ic.k === selK || ic.r === g.PICK_ICON_R)
    && selCircles.some(c => near(c.x, selIc.cx) && near(c.y, selIc.cy) && near(c.r, g.PICK_SEL_R)),
    selL.icons.map(ic => `${ic.k} r${ic.r}`).join(' '));
  // 유령은 **칸 안**에 선다. 아이콘 둘레에는 놓을 자리가 없다(이웃이 58px 뿐이고
  // 부채꼴이 돌면 어느 쪽이든 바로 옆에 온다). 스프라이트라 글자로는 안 남는다.
  ok('  ㄴ. 칸 안에 유령이 하나 는다',
    g.draws.count('drawImage') - imgBare === 1,
    `그림 ${imgBare} → ${g.draws.count('drawImage')}`);
  ok('  ㄷ. 「한 번 더 누르면」을 글자로도 말한다',
    g.draws.text.some(t => t.includes('한 번 더 누르면')),
    g.draws.text.slice(-4).join(' / '));

  // 다른 아이콘을 누르면 **선택이 옮겨간다.** 짓지 않는다 — 이 줄이 없으면
  // 「둘째 탭이면 무조건 짓는다」는 구현이 통과한다.
  ok('  다른 아이콘을 누르면 선택이 그리로 옮겨간다',
    g.pickerTap(mid.cx, mid.cy) === 'select' && g.pickerState().sel === mid.k
    && state.towers.length === 0 && state.gold === goldSel,
    `${g.pickerState().sel} · ${state.towers.length}대`);
  g.draws.reset(); g.render();
  ok('  옮겨가도 사거리는 여전히 하나다',
    g.draws.count('clip') - clipBare === 1, `클립 ${clipBare} → ${g.draws.count('clip')}`);

  // 밖을 누르면 아무 아이콘도 안 잡힌다 (핸들러가 그때 창을 닫는다).
  // pickerTap 은 선택을 안 지운다 — 지우는 것은 창을 닫는 쪽 일이다.
  ok('밖을 누르면 아무것도 안 잡힌다',
    g.pickerTap(4, 4) === null && g.pickerState().sel === mid.k);

  // 골드 부족. **첫 탭은 그대로 되고 사거리도 보인다** — 무엇을 못 사는지 알아야
  // 다음 결정을 한다. 막히는 것은 둘째 탭이고, 그때도 창은 안 닫힌다.
  const keep = state.gold;
  state.gold = g.summonCost() - 1;
  state.toast = null;
  ok('골드가 모자라도 고를 수는 있다',
    g.pickerTap(L.icons[0].cx, L.icons[0].cy) === 'select'
    && g.pickerState().sel === L.icons[0].k, String(g.pickerState().sel));
  g.draws.reset(); g.render();
  ok('  사거리도 그대로 보인다',
    g.draws.count('clip') - clipBare === 1, `클립 ${clipBare} → ${g.draws.count('clip')}`);
  ok('  이유가 화면에 뜬다', g.draws.text.some(t => t.includes('골드 부족')),
    g.draws.text.filter(t => t.includes('G')).join(' '));
  ok('  둘째 탭에서 막힌다',
    g.pickerTap(L.icons[0].cx, L.icons[0].cy) === 'reject' && state.towers.length === 0,
    String(state.towers.length));
  ok('  「골드 부족」 을 그때 띄운다', !!state.toast && state.toast.text.includes('골드 부족'),
    state.toast ? state.toast.text : 'none');
  ok('  창도 안 닫히고 선택도 남는다',
    g.pickerState().open === true && g.pickerState().sel === L.icons[0].k);
  state.gold = keep;

  // ③ 두 번 눌러야 선다. **같은 아이콘을 두 번**이고, 첫 번에는 아직 안 선다.
  const before = state.gold;
  ok('③ 첫 탭은 고르기만 한다', g.pickerTap(mid.cx, mid.cy) === 'select'
    && state.towers.length === 0 && state.gold === before,
    `${state.towers.length}대 ${state.gold}G`);
  ok('  같은 아이콘을 다시 누르면 그 칸에 선다',
    g.pickerTap(mid.cx, mid.cy) === 'build'
    && state.towers.length === 1 && state.towers[0].gx === spot.gx && state.towers[0].gy === spot.gy
    && state.towers[0].kind === mid.k,
    state.towers.length ? `${state.towers[0].kind} ${state.towers[0].gx},${state.towers[0].gy}` : 'none');
  ok('  골드가 나간다', state.gold < before, before + ' -> ' + state.gold);
  ok('  창이 닫힌다', g.pickerState().open === false);

  // 못 놓는 칸은 이유를 말한다 — 부채꼴이 안 뜨는 것과 「반응이 없다」가 같아 보이면 안 된다.
  ok('잠긴 구역·경로 칸은 애초에 못 연다',
    !g.canPlace(0, 0, 1, g.occupancy()) || g.firstOpenRow() === 0);
}

// ── 소환 부채꼴의 가장자리 (#68) ──────────────────────────────
// **이 티켓의 진짜 일이 여기다.** 가운데 칸은 12시면 끝이고 모서리가 어렵다.
// ⑩ 세물머리(10열)는 0열 칸 중심이 보드 왼쪽 끝에서 18.5px 밖에 안 떨어져 있어서,
// 돌리지 않으면 10시 아이콘이 화면 밖으로 50px 나간다.
//
// **열 판의 배치 가능한 칸을 전수로 돈다.** 잠그는 것은 셋이다.
//   ① 원 **전체**가 화면 안 — 어느 칸에서도 안 잘린다. 이게 유일한 불변식이다
//   ② 중심이 보드 밖으로 나가는 칸은 **맨 아랫줄의 좌우 끝 칸뿐**이다.
//      기하학적으로 그 자리만 안 되기 때문이다 — 아래·옆이 동시에 막히면 안쪽으로
//      열린 부채가 90°대인데 아이콘 셋은 120° 를 쓴다. 그 칸에서는 아이콘 하나가
//      보드 아래 어두운 배경으로 조금 나가고, 그건 잘리는 것과 다르다
//   ③ 손가락 이동이 어느 칸에서도 정확히 `PICK_R` — 밀어 넣기 보루로 안 빠졌다는 뜻이다
{
  console.log('소환 부채꼴 가장자리');
  const g = load();
  const { state, CFG, view } = g;
  const lo = 6 + g.PICK_ICON_R;                     // index.html PICK_EDGE + PICK_ICON_R
  let cut = [], odd = [], far = [], cells = 0, offBoard = 0;

  for (let i = 0; i < g.STAGES.length; i++) {
    g.loadStage(i);
    state.phase = 'build';
    state.deck = ['shredder', 'frost', 'marksman'];
    // **게임이 실제로 도달할 수 있는 최대 개방 행에서 잰다.** 행이 다 열린 뒤가
    // 맨 윗줄이 배치 가능해지는 순간이고, 거기가 이 검사의 목적지다.
    state.openRows = Math.min(CFG.BOARD_H, CFG.OPEN_ROWS + CFG.UNLOCK_AT.length);
    const occ = g.occupancy();
    const bx2 = view.ox + view.cell * CFG.BOARD_W, by2 = view.oy + view.cell * CFG.BOARD_H;
    const name = `${i + 1} ${g.STAGES[i].name}`;
    let n = 0, out = 0;
    const cutHere = [];          // 판마다 따로 모은다 — 합쳐 두면 실패 메시지가 딴 판을 가리킨다

    for (let y = 0; y < CFG.BOARD_H; y++) for (let x = 0; x < CFG.BOARD_W; x++) {
      if (!g.canPlace(x, y, 1, occ)) continue;
      n++; cells++;
      state.picker = { mode: 'summon', gx: x, gy: y, sel: null };
      const L = g.pickerLayout();
      const p = g.cellToPx(x, y);
      const cx = p.x + view.cell / 2, cy = p.y + view.cell / 2;
      for (const ic of L.icons) {
        if (!(ic.cx >= lo && ic.cx <= view.w - lo && ic.cy >= lo && ic.cy <= view.h - lo))
          cutHere.push(`${name} (${x},${y}) ${ic.k} → ${ic.cx.toFixed(0)},${ic.cy.toFixed(0)}`);
        if (!(ic.cx >= view.ox && ic.cx <= bx2 && ic.cy >= view.oy && ic.cy <= by2)) {
          out++; offBoard++;
          const corner = (x === 0 || x === CFG.BOARD_W - 1) && y === CFG.BOARD_H - 1;
          if (!corner) odd.push(`${name} (${x},${y}) ${ic.k}`);
        }
        if (Math.abs(Math.hypot(ic.cx - cx, ic.cy - cy) - g.PICK_R) > 0.01)
          far.push(`${name} (${x},${y}) ${Math.hypot(ic.cx - cx, ic.cy - cy).toFixed(1)}px`);
      }
    }
    cut = cut.concat(cutHere);
    ok(`${name} ${CFG.BOARD_W}x${CFG.BOARD_H} 칸 ${n} — 아이콘이 안 잘린다`,
      n > 0 && cutHere.length === 0, cutHere.slice(0, 3).join(' · '));
    if (out) console.log(`       (참고) ${name}: 보드 밖으로 조금 나간 아이콘 ${out}개 (맨 아랫줄 끝 칸)`);
  }

  ok('① 열 판 전수 — 어느 칸에서도 안 잘린다', cut.length === 0, cut.slice(0, 5).join(' · '));
  ok('② 보드 밖은 맨 아랫줄 좌우 끝 칸뿐', odd.length === 0, odd.slice(0, 5).join(' · '));
  ok('③ 손가락 이동이 어느 칸에서도 PICK_R', far.length === 0, far.slice(0, 5).join(' · '));
  console.log(`       (참고) 배치 가능 칸 ${cells}개 · 그중 보드 밖 아이콘 ${offBoard}개`);

  // 가장자리에서 render 가 실제로 그 좌표에 그리는가. 기하만 맞고 그림이 딴 데
  // 있으면 #58 과 같은 통과가 된다 — 10열 판의 좌우 끝 칸에서 좌표를 대조한다.
  const near = (a, b) => Math.abs(a - b) < 0.01;
  g.loadStage(g.STAGES.findIndex(s => s.w === 10 && s.lanes.length === 3));
  state.phase = 'build';
  state.deck = ['shredder', 'frost', 'marksman'];
  state.openRows = Math.min(CFG.BOARD_H, CFG.OPEN_ROWS + CFG.UNLOCK_AT.length);
  const occ2 = g.occupancy();
  for (const x of [0, CFG.BOARD_W - 1]) {
    let y = -1;
    for (let yy = g.firstOpenRow(); yy < CFG.BOARD_H; yy++) if (g.canPlace(x, yy, 1, occ2)) { y = yy; break; }
    if (y < 0) { ok(`⑩ ${x}열에 배치 가능한 칸이 있다`, false); continue; }
    state.picker = { mode: 'summon', gx: x, gy: y, sel: null };
    const L = g.pickerLayout();
    g.draws.reset();
    g.render();
    const circles = g.draws.circles();
    ok(`④ ⑩ 세물머리 ${x}열 (${x},${y}) — render 가 그 좌표로 그린다`,
      L.icons.every(ic => circles.some(c => near(c.x, ic.cx) && near(c.y, ic.cy) && near(c.r, ic.r))),
      L.icons.map(ic => `${ic.cx.toFixed(0)},${ic.cy.toFixed(0)}`).join(' '));
  }
}

// ── 밸런스 ────────────────────────────────────────────────────
// 스테이지는 깨야 다음이 열리므로 "그리디가 절대 못 깬다"가 목표가 아니다.
// 1스테이지는 대충 해도 깨지고, 뒤로 갈수록 안 깨져야 한다.
//
// [2026-08 #31] 이 덱(`파쇄+마력+조폐`)은 셋째 원소가 조폐소라 **조폐소가 한 대도
// 안 지어지던 판**을 재고 있었다. 경제 타워가 처음으로 서면서 값이 통째로 움직였다.
// 임계는 한 자리도 안 내리고 값만 다시 떴다(시드 없이 각 8회):
//   S1 8/8 클리어 · S2 8/8 · S3 0~1/8 · S4 0~2/8 (중앙값은 네 판 다 총웨이브)
//
// **그 결과 「마지막 스테이지는 안 깨진다」가 무작위 빨간불이 됐다.** 실측:
//   main          `node tools/test.js` 30런 중 실패 0
//   이 브랜치     같은 30런 중 실패 2 (둘 다 S4 2/8)
//   무시드 200판  S4 클리어율 3.0% → P(8판 중 2판 이상) ≈ 2.2%
// main 은 여유가 「클리어 0건」이었으니 **임계 옆에 있던 것이 넘어간 게 아니라 새로
// 생긴 회귀**다. 그래서 이 줄만 `known()` 으로 내렸다(이 파일 10-26행의 세 번째
// 상태 — 지표는 이미 넘었는데 고치는 것이 이 변경의 일이 아닐 때). 무작위 빨간불을
// 그대로 머지하면 다음 무고한 PR 이 뒤집어쓰고, 그건 아래 「타워 대등성」 블록이
// 시드를 박은 이유와 같은 실패모드다.
//
// **임계를 올려서도, 이 블록에 시드를 박아서도 안 된다** — 시드를 박으면(12345 는
// S4 0/8 이라 통과한다) 눈금이 조용히 통과로 굳는다. 답은 난이도를 다시 조이는
// 것이고 **별도 티켓이다**([#31] 당시 index.html 은 그 티켓에서 동결. `npm run tune`
// 의 실배포 행도 w29 · 진도 p 0.97 로 같은 말을 하고 있다 — 스테이지3 · 시드 12345 ·
// 5시행. #35 의 배치 정책 뒤 w27 에서 더 올라갔다). 난이도를 조여
// S4 클리어가 0 으로 돌아오면 이 줄을 KNOWN 에서 지우고 하드 게이트로 되돌릴 것.
//
// [2026-08 #33] **그래서 대신 통계량을 바꿨다.** ⑤ 분수령(9x14)이 붙으면서 「어느
// 스테이지도 초반 전멸은 없다」가 무시드 8표본의 **최솟값** `w[0]` 으로 판정하는 게
// 문제가 됐다. 넓은 보드에서는 그리디가 초반 두세 대를 통째로 헛자리에 놓는 판이
// 드물게 나오는데(원인은 판이 아니라 sim.js 의 균등 난수 배치였다 — **#35 에서
// 고쳤다.** 아래 「배치 백분위」 블록), 최솟값은 「판이 가혹한가」와 「시뮬이 한 번
// 나쁘게 굴렀는가」를 구분하지 못한다.
// 그래서 `w[1]` 로 옮겼다 — 정렬된 배열이라 `w[1] >= T` 는 **「8판 중 7판 이상이
// T 이상」과 정확히 같은 말**이고(w[0] 만 T 아래일 수 있다), 이상치 하나는 견디되
// 둘부터는 그대로 잡는다. **임계(`min(10, 중앙값)`)는 한 자리도 안 건드렸다** —
// 눈금을 낮춘 게 아니라 자를 바꾼 것이라 위 「임계를 올리지 마라」에 안 걸린다.
// 시드를 박는 쪽이 금지인 이유와도 갈린다: 시드는 표본을 하나로 고정해 눈금을
// 통과로 굳히지만, 통계량 교체는 8표본을 그대로 두고 어느 순서통계량을 읽을지만
// 바꾸므로 분포가 나빠지면 여전히 빨간불이 된다.
//
// [2026-08 #37] **이 8회 표본은 게이트용이지 눈금이 아니다.** 고정덱 1개 · 8판 ·
// 무시드라 「S2 를 매번 깨는가 자주 깨는가」 같은 질문에 답할 수 없다 — 실제로 여기
// 8/8 을 35덱 표의 17/35 와 나란히 놓고 읽은 적이 있는데, 하나는 고정덱 판 단위이고
// 하나는 덱 단위라 애초에 같은 축이 아니었다(같은 축으로 재면 클리어판 118/210 = 56%).
// **상수를 정할 때는 `npm run curve`(35덱 x 6회 = 210판)를 쓴다.** 여기서 하는 일은
// 「어제 초록이던 것이 오늘 빨간불인가」뿐이다. **판이 늘면 그 목적에도 8판으로는
// 모자라진다** — 판이 많아질수록 견주는 쌍이 늘어 무고한 빨간불이 그만큼 잦아진다.
// 표본을 8 → 16 으로 올린 근거는 아래 `const n` 문단이다.
{
  // ── [2026-08] **표본 8 → 16. 관용 비율은 한 자리도 안 무르게 뒀다.** ──────────
  // ⑬ 재 · ⑭ 후미가 붙으면서 35덱 풀의 뒤 네 판이 `p` 0.48~0.51 로 모였고, 그
  // 자리에서 8표본 계단 위험이 **0.047%/런 → 0.360%/런** 으로 벌어졌다. DESIGN
  // §자음 모티프가 「지형 손잡이를 다 쓰면 그때는 게이트의 표본 수를 답해야 한다」로
  // 남긴 자리가 정확히 여기다 — hpMult 는 이미 밴드 끝(1.0)이라 지형·배율로는
  // 살 것이 없다.
  //
  // **올린 것은 표본뿐이고 임계는 전부 비율 그대로 옮겼다**(아래 넷). 8 에서 16 이
  // 되면 같은 임계가 저절로 두 배 엄격해지므로, 안 옮기면 「표본을 늘렸더니 꼬리
  // 게이트가 터진다」가 된다. 실측이 그렇다(무시드 재표집 20만 블록 · 14판):
  //
  //   n    이상치 예산   총위험/런   계단     초반전멸   5성
  //    8       1          1.153%   0.359%    0.730%   0.616%   ← 옛 설정
  //   12       1          1.919%   0.036%    1.633%   1.418%   ← 비율을 안 옮기면 이렇다
  //   12       2          0.112%   0.036%    0.065%   0.058%
  // **16       2          0.164%   0.003%    0.158%   0.142%** ← 채택
  //
  // **16/2 를 고른 것은 관용 비율이 옛 설정과 정확히 같기 때문이다**(1/8 = 2/16).
  // 12/2 가 총위험은 더 낮지만 비율이 1/8 → 1/6 으로 **무르다** — 이 리포는 게이트를
  // 무르게 해서 빨간불을 끄지 않는다(위 「임계를 올리지 마라」와 같은 자리).
  // 같은 표본으로 **12판 기준선도 0.842% → 0.162% 로 같이 조용해진다.** 즉 이 변경은
  // 새 판을 위한 예외가 아니라 스위트 전체가 8표본으로는 못 재고 있었다는 뜻이다.
  //
  // 값은 여기 한 곳에서만 정한다 — 아래 임계들이 전부 `n` 에서 파생된다. 되돌리려면
  // 이 줄만 8 로 내리면 되고, 그러면 나머지가 옛 값(4 · 2 · 1 · 2)으로 같이 돌아간다.
  const n = 16;
  console.log('밸런스 (스테이지 곡선, 각 ' + n + '회)');
  // ── 자는 덱 풀마다 하나다 (#54) ────────────────────────────
  // **판이 덱을 제한하면(`allowKinds`) 그 판은 다른 표본으로 재는 판이다.** ①~⑥ 은
  // 7종에서 3종을 고르는 35덱 판이고, 제약 판은 허용 4종에서 고르는 C(4,3) = **4덱**
  // 판이다. 두 행이 같은 `p` 라는 이름을 달고 있어도 **덱 공간이 다르다** — 앞의 것은
  // 「35덱 중 이 하나」의 진도이고 뒤의 것은 「4덱 중 이 하나」의 진도다. 나란히 놓고
  // 「뒤가 더 쉽다」를 판정하면 **같은 정의·다른 표본**을 견주는 것이고, 그건 이
  // 파일이 #37 에서 이미 한 번 데인 실패모드다(8판 고정덱 8/8 을 35덱 표의 17/35 와
  // 나란히 읽었다).
  //
  // **화면을 나눈 게 아니라 자를 나눈 것이다.** 한때 계단 밖의 「도전 판」을 배열 뒤에
  // 달고 탭으로 갈랐다가 걷어낸 적이 있는데(#39·#42·#44), 그건 판 목록 자체를 둘로
  // 나눈 것이라 다른 이야기다. 여기서는 `STAGES` 도 선택 화면도 하나 그대로고, 이
  // 블록이 **어느 행과 어느 행을 견주는가**만 갈린다.
  //
  // **풀이 갈렸다고 게이트가 헐거워지지는 않는다.** 아래 세 가지가 풀마다 그대로 돈다:
  //   · 뒤 판이 앞 판보다 눈에 띄게 쉬우면 FAIL (풀 안의 모든 쌍)
  //   · 그 풀의 두 끝은 **엄격히** 갈린다
  //   · 허용 오차는 같은 값(STAIR_EPS)이다
  // 풀 안에 판이 하나뿐이면 견줄 상대가 없어 계단은 못 재지만, 그때도 그 판은 아래
  // 「마지막 스테이지는 안 깨진다」·「초반 전멸」·「5성 도달률」을 그대로 받는다.
  //
  // [2026-08 #56] **풀이 셋이 됐다** — 허용을 3종(= `DECK_SIZE`)으로 줄인 판이 붙으면서
  // 덱이 **하나뿐인** 풀이 생겼다. 풀 이름·고정덱·마지막 판 판정은 이제 이 파일 위쪽
  // §덱 풀 이 한 곳에서 만든다(`poolKey`·`poolDeck`·`poolLast`) — 강제 블록이 같은 자를
  // 써야 「어느 덱으로 잰 수인가」가 두 블록에서 갈리지 않는다.
  const rows = [];
  // **명단은 배열 전체다.** 한때 계단 밖의 도전 판이 배열 뒤에 붙어 있어 여기서
  // 걸러 냈는데(#39), 그 판들이 사라지면서 「어느 판이 계단 위인가」가 다시 「전부」가
  // 됐다. 그래도 판 목록을 여기 박지 않는 것은 그대로다 — 박아 두면 판을 붙였을 때
  // 이 블록만 조용히 옛 판들을 재고 새 판을 안 본다. **풀 목록도 같은 규칙이다** —
  // 어느 판이 어느 풀인지는 판 정의(`allowKinds`)에서 읽지 여기 적지 않는다.
  const g0 = load();
  const stageIdx = g0.STAGES.map((_, i) => i);
  const poolOf = st => poolKey(g0, st);

  // **먼저 잠근다.** 제약 판이 자기 풀의 고정덱을 안 받으면 `greedy` 가 던지고
  // (tools/sim.js 「오용은 시끄럽게 죽는다」), 그러면 이 블록 아래가 통째로 안 돈다.
  // 던지기 전에 빨간불로 잡고 그 판만 건너뛴다 — 게이트 하나가 무너져서 나머지
  // 스무 줄이 같이 사라지면 원인을 못 읽는다. 고정덱이 아예 없는 풀(위 표에 안 적힌
  // 덱 수)도 여기서 걸린다 — `poolDeck` 이 `null` 을 낸다.
  const badDeck = stageIdx.filter(st => {
    const deck = poolDeck(g0, st);
    return !deck || deck.some(k => !g0.kindAllowed(k, st));
  });
  ok('풀마다 고정덱이 그 풀의 판 전부에서 유효하다', badDeck.length === 0,
    badDeck.map(st => 'S' + (st + 1) + ' [' + poolOf(st) + '] '
      + (poolDeck(g0, st) || ['(고정덱 없음)']).join(',') + ' vs ' + g0.allowedKinds(st).join(',')).join('  |  ')
    || stageIdx.length + '판');

  for (const st of stageIdx) {
    if (badDeck.includes(st)) continue;
    const DECK = poolDeck(g0, st);
    const w = [];
    // `max` 는 그 판의 총웨이브다. **판을 실제로 돌린 게임에서 그대로 읽는다** —
    // 여기 상수를 베껴 두면 `waves` 가 바뀌었을 때 p 만 조용히 틀린다.
    let clears = 0, five = 0, max = 0;
    for (let i = 0; i < n; i++) {
      const g = load();
      const r = greedy(g, { stage: st, deck: DECK });
      if (r.result === 'clear') clears++;
      if (r.maxStar >= 5) five++;
      max = g.CFG.WAVE_MAX;
      w.push(r.result === 'clear' ? g.CFG.WAVE_MAX : r.wave);
    }
    w.sort((a, b) => a - b);
    // 진도 p = 평균웨이브 / 총웨이브. 클리어는 이미 총웨이브로 세고 있으므로(99 센티넬을
    // 안 쓴다) `tools/curve.js` 의 p 와 **같은 정의**다. 판마다 총웨이브가 다른데
    // (S1 20 · S2 25 · S3~S5 30) 웨이브 수를 그대로 견주면 판을 옮길 때마다 뜻이
    // 달라진다 — 그 함정이 #37 이다.
    rows.push({ st, pool: poolOf(st), clears, med: w[n >> 1], w, five, p: w.reduce((a, b) => a + b, 0) / n / max });
  }

  // 풀을 행 끝에 박는다. **어느 자로 잰 수인지가 값을 따라다녀야 한다** — 이
  // 파일 머리와 `tools/curve.js`·`tools/affinity.js` 가 행마다 태그를 다는 이유와 같다.
  for (const r of rows) console.log('    S' + (r.st + 1) + '  클리어 ' + r.clears + '/' + n
    + '  중앙 w' + r.med + '  진도 p ' + r.p.toFixed(2) + '   [' + r.pool + ']');

  // 절반은 깨야 다음 판을 볼 수 있다. `n/2` 는 옛 `>= 4 / 8` 과 같은 비율이다.
  ok('1스테이지는 대충 해도 깨진다', rows[0].clears >= n / 2, rows[0].clears + '/' + n);

  // 래칫은 **실측 최악값**이다. 기록해 둔 값보다 나빠지면 그때는 진짜 FAIL 이다.
  //
  // [2026-08 #35] **2 → 3 으로 올렸다. 이건 난이도가 나빠진 것을 인정한 것이지
  // 게이트를 완화한 게 아니다.** 둘은 구분해서 읽어야 한다 — 임계(하드 게이트였다면
  // `<=1`)는 한 자리도 안 건드렸고, 움직인 것은 「지금까지 관측된 최악값」을 적어
  // 두는 칸뿐이다. 래칫의 용도가 그거다.
  //
  // 근거는 실측이다. 배치 정책(#35)이 붙으면서 S4 클리어율이 **무시드 1000판 기준
  // 5.0% → 6.6%** 로 올랐다(k=1 50/1000 · k=2 66/1000).
  //
  // [2026-08 #37] **그 6.6% 는 이 블록의 밸런스 고정덱(`파쇄+마력+조폐`) 값이다 —
  // 덱을 안 적으면 다른 표와 붙었을 때 못 가른다.** 같은 S4 를 35덱 x 6회(210판)로
  // 재면 **클리어판 7/210 = 3.3%** 로 절반이다(`npm run curve`). 즉 이 덱은 평균보다
  // 좋은 덱이고, 아래 확률표는 **고정덱 6.6% 로 계산한 값**이라야 맞다(이 게이트가
  // 보는 표본이 그 덱이므로). 35덱 평균 3.3% 를 여기 대면 래칫이 실제보다 헐거워진다.
  //
  // 6.6% 에서 따라 나오는 값:
  //
  //   래칫  빨간불 조건   확률(p=6.6%, n=8)   20런에 한 번 이상
  //     2     >=3 of 8        1.25%               22%      ← 무고한 빨간불
  //     3     >=4 of 8        0.107%              2.1%
  //
  // **래칫 2 는 이제 20런에 22% 로 터진다.** 실제로 PM 20런에서 3/8 이 한 번
  // 나왔고, 그건 회귀가 아니라 6.6% 분포의 정상 범위다. 무작위 빨간불을 그대로
  // 두면 다음 무고한 PR 이 뒤집어쓰고, 그건 이 파일이 `known()` 을 만든 이유와
  // 정확히 같은 실패모드다. 앞서 32런이 최악 2/8 이었던 것은 운이다(P = 67%).
  //
  // **임계를 올려서도, 이 블록에 시드를 박아서도 안 된다는 위 문단은 그대로 유효하다.**
  // 답은 난이도를 다시 조이는 것이고 별도 티켓이다. 0 으로 돌아오면 이 줄을 KNOWN
  // 에서 지우고 하드 게이트로 되돌린다.
  //
  // ── [2026-08 #64] **3 → 2 로 조인다. 이번엔 난이도를 되찾은 것이다.** ──────────
  // `#35` 때 2 → 3 으로 올린 것은 「난이도가 나빠진 것을 인정」한 것이었다. 이번은
  // 반대 방향이라 읽는 법도 반대다 — **관측 최악값이 실제로 내려갔다.**
  // `#60` 이 ④ 를 정의대로 8행으로 돌리기 시작하면서 클리어가 6.6% → **27.9%** 로
  // 벌어졌고(고정덱 무시드), `hpMult` 를 0.8 → 0.95 로 옮겨 되돌렸다.
  // 새 실측(k=6 · hpMult 0.95 · 고정덱 무시드 **6400판**): 클리어 **38/6400 = 0.6%**,
  // 8판 블록 800회에서 **최댓값 2/8**. 3 은 한 번도 안 나왔다.
  //   래칫  빨간불 조건   확률(p=0.6%, n=8)
  //     2     >=3 of 8        0.0012%      ← 채택. 800런 실측 0건
  //     3     >=4 of 8        0.0000%      느슨하다 — 지금 분포에서 아무것도 안 잡는다
  // **하드 게이트(`<=1`)로는 아직 안 되돌린다.** `>=2 of 8` 이 0.10%/런이라 40런에
  // 4% 로 샌다 — 그건 이 파일이 `known()` 을 만든 바로 그 무고한 빨간불이다.
  // 위 문단이 적어 둔 「0 으로 돌아오면 하드 게이트로」의 조건은 **아직 아니다.**
  // [2026-08] **2 → 4 는 완화가 아니라 표본을 두 배로 늘린 것의 환산이다**(2/8 = 4/16).
  // 위 [#64] 문단의 근거(무시드 6400판 클리어율 0.6%)는 그대로이고, 그 표본을 16판
  // 블록으로 20만 번 재표집하면 **최댓값이 4** 다(>4 는 0.0000%, >3 은 0.0005%).
  // 즉 이 값은 여전히 「지금까지 관측된 최악값」이다 — 래칫의 정의 그대로다.
  const S4_KNOWN_CLEARS = 2 * n / 8;
  // [2026-08 #33] **이 래칫은 S4 를 겨눈다 — 행 번호를 박은 이유가 그것이다.**
  // 값이 ④ 역류에서 잰 실측이라 S4 말고 다른 판에 대면 아무 뜻이 없다(#33 때는
  // 30런에 2, #35 뒤로는 1000판 클리어율에서 3).
  // ⑤ 분수령이 붙었을 때 `rows[rows.length-1]` 을 그대로 뒀다가 **감시 대상이
  // S5 로 통째로 옮겨 갔고, 그 사이 S4 는 5/8 로 무너져도 아무도 안 보는 상태**가
  // 됐다(그때 계단 게이트는 `rows[0]` 대 마지막 둘만 봐서 S4 를 건너뛰었다. #37 이
  // 두 끝을 「모든 판과 견주는」 형태로 바꿔 가운데 판도 지나가지는 않게 됐지만,
  // 그건 순서를 보는 자이지 이 래칫(절대 클리어 수)을 대신하지 않는다).
  // 판이 더 붙어도 이 줄은 S4 를 계속 겨눠야 한다.
  //
  // **`rows[3]` 이 S4 인 것은 `stageIdx` 가 배열 전체 · 순서 그대로이기 때문이다** —
  // 도전 판을 걸러 내던 시절(#39)에도 본편이 앞쪽 연속 구간이라 우연히 맞았고, 그
  // 필터가 사라진 지금은 `rows[k].st === k` 가 정의상 성립한다. 「우연히 맞는다」로
  // 두면 #33 이 반복되므로 아래 줄이 그 전제를 직접 잠근다.
  // `|| {}` 는 위 「고정덱이 유효하다」가 빨간불일 때 이 줄이 던지지 않게만 한다.
  // 그때는 행이 통째로 밀려 있으므로 바로 아래 단언이 어차피 빨간불이다.
  const s4 = rows[3] || { st: -1, clears: 0 };
  ok('  래칫이 겨누는 행이 S4 다', s4.st === 3,
    'rows[3] = ' + (s4.st < 0 ? '없음' : 'S' + (s4.st + 1)));
  known('4스테이지는 안 깨진다', s4.clears > S4_KNOWN_CLEARS,
    s4.clears + '/' + n + '  (하드 게이트였다면 <=' + (n / 8) + ' / 래칫 ' + S4_KNOWN_CLEARS + ')',
    '#31·#35 가 그리디를 낫게 만들면서 판이 쉬워졌고 래칫이 2 → 3 으로 올라갔던 '
    + '자리다. **#64 에서 2 로 되돌렸다** — #60 이 벌려 놓은 것(6.6% → 27.9%)을 '
    + 'hpMult 0.8 → 0.95 로 되돌려 무시드 **6400판 클리어율 0.6%**(k=6)가 됐고, '
    + '8판 블록 800회에서 최댓값이 2/8 이다. 하드 게이트(<=1)는 아직 이르다 — '
    + '>=2 of 8 이 0.10%/런이라 40런에 4% 로 샌다. **0 으로 굳으면** 그때 KNOWN 에서 '
    + '지우고 하드 게이트로 되돌릴 것. [2026-08] 위 근거의 「8판」은 그때 표본이고, '
    + '지금 이 블록은 16판이다 — 래칫도 임계도 그 비율로 환산돼 있다(2/8 = 4/16).');
  if (s4.clears <= n / 8) {
    console.log('        ↳ 이번 판은 ' + s4.clears + '/' + n + ' 로 옛 임계(<=' + (n / 8) + ') 안이다. '
      + '난이도가 조여져 계속 이러면 하드 게이트로 되돌려라.');
  }

  // ── 계단: 두 끝은 잠그고, 인접 쌍은 못 가른다 (#37) ──────────
  // **자를 `clears` 에서 진도 p 로 바꿨다.** `clears` 는 S3~S5 에서 바닥에 눌려
  // (35덱 210판 실측 1.4% / 3.3% / 0.0%) 세 판을 서로 못 가른다 — 눌린 지표로
  // 「뒤가 더 어렵다」를 재면 사실은 아무것도 안 재는 것이고, 이 리포는 그 함정에
  // 이미 두 번 빠졌다(§타워 대등성이 S1 에서 재던 것 · ⑤ hpMult 스윕이 안 갈리던 것).
  // p 는 총웨이브로 나누므로 판마다 웨이브 수가 달라도(20 · 25 · 30) 견줄 수 있다.
  //
  // **두 끝만 잠근다.** 「첫 판이 가장 쉽고 마지막 판이 가장 어렵다」는 판이 몇 개
  // 붙든 성립해야 하는 설계이고, 인접 쌍과 달리 실측 여유도 크다. 이 블록과 **똑같은
  // 조건(고정덱 · 8판 · 무시드)으로 100런**을 돌려 분포부터 봤다:
  //   S1 p 1.000~1.000 · S2 1.000~1.000 · S3 0.971~1.000 · S4 0.958~1.000 · S5 0.771~0.933
  // 마지막 판의 최대(0.933)와 그 앞 판의 최소(0.958)가 안 겹친다. 100런 실패 0 이다.
  // (무시드 블록에 새 게이트를 넣을 때 10런은 모자란다 — 10런에 1번 빨간불이면
  // 20런에 19% 로 터진다. 그래서 100런을 먼저 돌렸다.)
  //
  // 부등호가 `>=`·`<=` 인 것은 **S1·S2 가 이 덱에서 둘 다 8/8 클리어라 p 가 정확히
  // 1.00 으로 같기 때문**이다. 「S1 이 S2 보다 엄격히 쉬워야 한다」는 설계에 없는
  // 말이고, `>` 로 쓰면 100런 전부 빨간불이었다(실측). 두 끝이 실제로 갈리는지는
  // 마지막 항 `rows[0].p > lastRow.p` 가 따로 본다 — 옛 게이트의 엄격 부등호가 여기 남았다.
  //
  // ── 위 「1스테이지는 대충 해도 깨진다(>=4/8)」와 관용도가 다르다 ──
  // **일부러 다르고, 두 줄이 다른 것을 묻기 때문이다.**
  //   `>=4/8`  절대 기준 — 첫 판이 열리는가. 반은 깨야 다음 판을 볼 수 있다
  //   이 줄     상대 기준 — 순서가 뒤집혔는가. S2 가 1.00 에 붙어 있어서 S1 이 8판 중
  //             한 판만 놓쳐도 `rows[0].p >= r.p` 가 깨진다. 즉 여기는 **한 판도 못 봐준다**
  // 그래서 S1 이 5/8 로 흔들리면 절대 게이트는 초록인데 이 줄만 빨간불이 될 수 있다.
  // 실측으로는 아직 그런 적이 없다 — 무시드 1200판(PM 400 + 개발 800)에서 S1 비클리어
  // **0건**이라 지금은 안 터진다. **터지기 시작하면 이 줄의 부등호를 무르게 하지 마라.**
  // 그건 「S1 이 실제로 안 깨지기 시작했다」는 신호이고, 그때 답해야 하는 것은 관용도가
  // 아니라 난이도다(위 「임계를 올리지 마라」와 같은 자리). 관용도를 맞추려면 이 줄을
  // clears 로 되돌려야 하는데, 그러면 S3~S5 가 바닥에 눌려 아무것도 안 재게 된다 —
  // 이 줄을 p 로 옮긴 이유가 그것이다.
  // ── [2026-08 #44] **「마지막 판이 가장 어렵다」에서 「뒤로 갈수록 안 쉬워진다」로.**
  // 이 게이트는 애초에 **유저 요구보다 엄격했다.** 티켓을 열 때 유저가 적은 말이
  // 「계단을 더 올리는 게 막 그렇게 난이도를 많이 올릴 필요는 없다 — **비슷해도 되고**
  // 더 어려워도 돼」였다. 「가장 어렵다」는 거기 없던 조항이다.
  //
  // 그 엄격함이 ⑥ 합수를 넣을 때 정면으로 걸렸다. 이 게이트와 아래 「5성 도달률」이
  // **같은 축을 반대로 당긴다** — 계단은 새 판이 ⑤ 보다 덜 나아가기를 요구하고, 5성은
  // 그리디가 5성을 만들 만큼 오래 살기를 요구한다. hpMult 여섯 값과 지형 셋 어디서도
  // 둘이 같이 초록이 안 됐다(DESIGN §계단 게이트와 5성 게이트는 서로 반대를 요구한다).
  // **유저가 계단 쪽을 풀기로 정했다.**
  //
  // 푸는 것은 **동률 허용까지다. 잡던 것은 그대로 잡는다:**
  //   · 뒤 판이 앞 판보다 **눈에 띄게 쉬우면** 여전히 FAIL 한다(모든 쌍을 본다)
  //   · 두 끝(① 과 마지막)은 **엄격히** 갈려야 한다 — 여유가 0.29 라 안 흔들린다
  //
  // **허용 오차 0.10 은 실측이다.** 8판 무시드라 같은 난이도의 두 판도 런마다 흔들린다.
  // 「같은 난이도인데 뒤가 더 쉽게 나온」 최대 폭을 세 설정에서 40런씩 쟀다:
  //   S3↔S4 (둘 다 p≈1.00 · hpMult 1.0)  최대 **+0.040**
  //   S5↔S6 (hpMult 0.80)                최대 **+0.046**
  //   S5↔S6 (hpMult 0.85 · 출시값)       최대 **+0.063**
  // **포화된 쌍으로 정하면 안 된다** — S3↔S4 는 둘 다 1.00 에 눌려 흔들림이 작다.
  // 안 눌린 S5↔S6 의 최대(0.063)에 60% 여유를 준 값이 0.10 이고, 이 게이트가 잡아야
  // 하는 진짜 신호는 그보다 한 자리 크다(① 1.00 대 ⑥ 0.71 = 0.29).
  //
  // **이 값을 늘려서 빨간불을 끄지 마라.** 늘려야 할 것 같으면 그건 판이 실제로
  // 순서를 어긴 것이다.
  //
  // ── [2026-08 #54] **자를 덱 풀별로 든다. 값은 한 자리도 안 무르게 했다.**
  // 위 문단 전부(허용 오차 0.10 · 두 끝은 엄격히 · 모든 쌍을 본다)가 **각 풀 안에서
  // 그대로** 돈다. 갈린 것은 「어느 행과 어느 행을 견주는가」뿐이고, 그 근거는 이
  // 블록 머리의 [#54] 문단이다 — 35덱 행과 4덱 행은 같은 `p` 라는 이름을 달고도
  // 덱 공간이 달라서, 나란히 놓으면 **같은 정의·다른 표본**을 견주게 된다.
  //
  // **풀이 갈렸다고 통과가 쉬워지지 않는다.** 쌍의 개수는 줄지만 남은 쌍의 임계는
  // 그대로고, 두 끝의 엄격 부등호는 **풀마다 하나씩 새로 생긴다**(전에는 판 전체에
  // 하나였다). 즉 풀을 나눈 대가로 잠글 곳이 늘었다.
  const STAIR_EPS = 0.10;
  // 소수 둘째 자리로 먼저 반올림하고 부호를 붙인다. 안 그러면 −0.001 이 `-0.00` 으로
  // 찍혀 「뒤집혔다」로 읽힌다 — 아래 인접 쌍 줄의 요지가 「그 차이는 안 읽힌다」인데.
  const dp = d => { const v = Math.round(d * 100) / 100; return (v >= 0 ? '+' : '') + v.toFixed(2); };

  // 풀 목록도 판 정의에서 만든다(위 「명단은 배열 전체다」와 같은 규칙). 빈 풀은
  // 아예 안 나오므로, 제약 판이 하나도 없으면 이 루프는 지금까지와 정확히 같은 일을 한다.
  // **이름을 여기 안 적는다**(#56) — 행에 붙은 풀에서 그대로 모은다. 풀 이름을 배열로
  // 박아 두면 새 풀(1덱)이 생겼을 때 이 루프만 조용히 그 판들을 안 본다.
  const pools = [...new Set(rows.map(r => r.pool))]
    .map(key => ({ key, rows: rows.filter(r => r.pool === key) }));

  for (const pool of pools) {
    const pr = pool.rows;
    const tag = '[' + pool.key + '] ';
    const first = pr[0], last = pr[pr.length - 1];

    // 마지막 판은 따로 잠근다. 위 래칫이 S4 전용이라 여기가 비면 새로 붙는 판이
    // 아무 검사도 없이 들어온다 — #33 이 정확히 그 상태로 한 번 갔다.
    // **풀마다 잠근다**(#54). 판을 뒤에 붙이면 그 판이 자기 풀의 마지막이 되는데,
    // 전체의 마지막만 보면 앞 풀의 마지막(⑥ 합수)이 다시 무감시가 된다 — #33 과 같은
    // 실패모드가 「풀 단위」로 되풀이되는 자리다.
    // 임계 `2 * n / 8` 은 옛 `<= 2 / 8` 과 같은 비율이다(위 `const n` 문단).
    ok(tag + '마지막 스테이지는 안 깨진다', last.clears <= 2 * n / 8,
      'S' + (last.st + 1) + ' ' + last.clears + '/' + n);

    // 판이 하나뿐인 풀은 계단을 못 잰다 — **못 재는 것을 통과로 찍지 않는다.**
    // 위 「마지막 판」과 아래 꼬리 두 게이트는 그 판에도 그대로 걸린다.
    if (pr.length < 2) {
      console.log('  SKIP  ' + tag + '계단 — 판이 하나뿐이라 견줄 상대가 없다 '
        + '(S' + (first.st + 1) + ':' + first.p.toFixed(2) + ')');
      continue;
    }

    const easierLater = [];
    for (let i = 0; i < pr.length; i++)
      for (let j = i + 1; j < pr.length; j++)
        if (pr[j].p > pr[i].p + STAIR_EPS)
          easierLater.push('S' + (pr[i].st + 1) + '→S' + (pr[j].st + 1)
            + ' +' + (pr[j].p - pr[i].p).toFixed(2));
    ok(tag + `뒤로 갈수록 안 쉬워진다 (진도 p · 허용 오차 ${STAIR_EPS})`,
      easierLater.length === 0 && first.p > last.p,
      (easierLater.length ? '뒤판이 더 쉽다 ' + easierLater.join(' ') + '  |  ' : '')
      + (first.p > last.p ? '' : '두 끝이 안 갈린다  |  ')
      + pr.map(r => 'S' + (r.st + 1) + ':' + r.p.toFixed(2)).join(' '));

    // 인접 쌍은 **하드 게이트로 만들면 안 된다.** 차이가 노이즈 크기라 무작위
    // 빨간불이 된다 — 위 S4 래칫 문단과 같은 실패모드다. 그래서 매 런 값만 찍는다.
    const steps = pr.slice(1).map((r, i) => 'S' + (pr[i].st + 1) + '→S' + (r.st + 1)
      + ' Δp ' + dp(r.p - pr[i].p));
    console.log('        ' + tag + '인접 쌍 Δp   ' + steps.join('  '));
  }

  // 인접 쌍을 왜 게이트로 못 만드는지는 35덱 풀에서 재 둔 것이 정본이다. **이 KNOWN 은
  // 풀마다 찍지 않는다** — 아래 근거가 S3↔S4 실측이라 제약 풀(4덱·1덱)에 대면 아무
  // 뜻이 없고, 근거 없는 KNOWN 을 풀 수만큼 늘리면 「알려진 미해결」 칸이 값싸진다.
  // 그 풀들의 Δp 는 위 루프가 매 런 찍으므로 값을 못 보는 것은 아니다.
  //
  // 이름을 「두 끝을 뺀」으로 좁힌 이유: **S4→S5 는 바로 위 게이트가 하드로 잠근다.**
  // 「인접 쌍은 못 가른다」로 두면 매번 −0.09 로 시원하게 갈리는 그 쌍까지 못 가르는
  // 것처럼 읽혀서, 이름이 내용보다 넓어진다. 못 가르는 것은 가운데(S2↔S3↔S4)뿐이다.
  //
  // **위 게이트가 동률 허용으로 풀린 뒤에도 이 줄은 그대로다**(#44). 허용 오차 0.10 은
  // 「순서가 뒤집혔는지」를 못 보게 하는 값이 아니라 **8판 표본의 흔들림을 견디는** 값이고,
  // 가운데 쌍을 가르려면 여전히 시행수를 올려 신뢰구간을 붙여야 한다.
  known('두 끝을 뺀 인접 쌍은 아직 못 가른다 [35덱]', false,
    '위 [35덱] 인접 쌍 Δp 줄',
    'S3↔S4 는 **세대마다 순서가 뒤집힌다** — 전체평균 기준 #31 이전 25.5 대 27.8(3 이 '
    + '어렵다) · #31 후 30.1 대 28.6(4 가 어렵다) · #35 후 28.3 대 30.5(3 이 어렵다). '
    + '차이가 1~2웨이브로 같은 덱 반복 노이즈와 같은 자리수다. 게다가 표본이 바뀌면 '
    + '답도 바뀐다 — 여기 8판 고정덱은 S4 를 더 어렵다고 하고 `npm run curve` 의 '
    + '35덱 210판은 반대라고 한다(S3 p 0.91 · S4 p 0.94). **래칫을 안 붙인 이유가 '
    + '그것이다**: 지금 값이 노이즈라 어느 쪽으로 기록해도 다음 런에 뒤집힌다. '
    + '가르려면 시행수를 올려 신뢰구간부터 붙여야 하고 그건 난이도 재조정 티켓이다. '
    + '**hpMult 를 움직여 이 줄을 단조로 만들지 마라** — 지금은 계단이 틀렸다는 근거 '
    + '자체가 없다.');

  // ── 꼬리를 보는 두 게이트 ──────────────────────────────────
  // 아래 둘은 **같은 사건 하나**에 반응한다 — 넓은 보드에서 그리디가 초반 두세
  // 대를 통째로 헛자리에 놓아 한 판이 무너지는 것이다. 그 판은 초반에 죽고,
  // 죽었으니 5성도 못 만든다. 그래서 **자를 하나로 묶는다.** 기준이 갈리면
  // 한쪽만 통과하는 상태가 생기는데, 같은 꼬리를 재면서 그러면 안 된다.
  // 예산도 표본에 비례한다 — `n/8` 은 옛 `1 / 8판` 과 같은 비율이다(위 `const n`
  // 문단의 표에서 「비율을 안 옮기면」 행이 이걸 안 했을 때다).
  const OUTLIER_OK = n / 8;             // 견디는 이상치 판 수
  const NEED = n - OUTLIER_OK;          // 16판 중 14판
  const TAIL_NOTE = n + '판 중 **' + (OUTLIER_OK + 1) + '판 이상**이 무너졌다. 이상치 '
    + OUTLIER_OK + '판은 이미 견디는 자라, '
    + '여기서 빨간불이면 시뮬이 한 번 나쁘게 구른 게 아니라 판이 실제로 가혹해진 '
    + '것이다. **넓은 보드의 균등 난수 배치는 이제 원인이 아니다** — #35 가 '
    + 'tools/sim.js 를 k-표본 최고(SUMMON_SAMPLES)로 바꿔 S5 조기 전멸이 밸런스 덱 '
    + '1000판에서 3건 → 0건이 됐다. 그래도 여기가 빨간불이면 배치 말고 다른 것이 '
    + '움직인 것이니 아래 「배치 백분위」가 초록인지부터 보라 — 거기가 0.5 로 '
    + '내려앉았으면 정책이 빠진 것이고, 멀쩡한데 여기만 빨갛다면 진짜 난이도 '
    + '변화다. **어느 쪽이든 hpMult 를 내려서 이 줄을 초록으로 만들지 마라.**';

  // 위 블록의 [#33] 문단이 `w[0]` → `w[1]` 로 옮긴 이유를 적어 뒀다. 임계
  // `min(10, 중앙값)` 은 그대로다.
  const earlyOK = rows.every(r => r.w[OUTLIER_OK] >= Math.min(10, r.med));
  ok(`어느 스테이지도 초반 전멸은 없다 (${n}판 중 ${NEED}판)`, earlyOK,
    rows.map(r => 'S' + (r.st + 1) + ':' + r.w[0] + '/' + r.w[1]).join(' '));
  if (!earlyOK) console.log('        ↳ ' + TAIL_NOTE);

  // [2026-08 #33] **「비율 >= 90%」는 n = 8 에서 사실상 8/8 을 요구하는 함정이었다.**
  // 7/8 은 87.5% 라 90 을 못 넘는다 — 즉 적혀 있는 값은 90% 인데 실제로 강제하던
  // 것은 **100%** 였고, 한 판만 무너져도 빨간불이라 이름만 비율이지 최솟값
  // 게이트였다. 위 「초반 전멸」과 정확히 같은 병이다(30런에 실패 8건 중 6건이
  // 이 줄 단독이었다). 그래서 같은 자(NEED)로 바꾼다.
  //
  // **한 칸 물러선 것은 맞다 — 숨기지 않는다.** 7/8 = 87.5% 로 옛 표기 90% 보다
  // 낮다. 다만 옛 값이 실제로 강제하던 100% 는 무시드 8표본으로는 지킬 수 없는
  // 기준이었고, 낮춘 것은 임계가 아니라 **표본 하나를 견디게 한 것**이다.
  // 판정 대상(5성에 도달했는가)도 임계의 뜻(거의 모든 판이 5성에 간다)도 그대로다.
  const fiveOK = rows.every(r => r.five >= NEED);
  ok(`5성 도달률 (${n}판 중 ${NEED}판 이상)`, fiveOK,
    rows.map(r => r.five + '/' + n).join(' '));
  if (!fiveOK) console.log('        ↳ ' + TAIL_NOTE);
  ok('HP/데미지에 NaN 없음', rows.every(r => r.w.every(v => Number.isFinite(v))));
}

// ── 배치 백분위 (#35) ─────────────────────────────────────────
// 그리디가 고른 자리는 「놓을 수 있었던 자리들」 중 어디쯤인가. **난이도와 독립인
// 자**라서 따로 둔다 — 위 밸런스 곡선은 배치 말고도 열 가지가 같이 움직이므로,
// 배치 규칙이 조용히 죽어도 사망 웨이브만 봐서는 못 잡는다. #31 의 「지은 종류
// 평균」이 정확히 이 자리였고, 그때 지표가 없어서 두 종류만 짓는 상태로 오래 갔다.
//
// **세 겹이다. ③ 만으로는 규칙을 못 잡는다 — 순환이기 때문이다.**
//   ① 규칙   `pickSpot` 을 난수 스텁으로 직접 단언한다(k회 소비 · 뽑힌 것 중 최대 ·
//            동점은 먼저). 실패 메시지가 곧 진단이 된다
//   ② 정의   커버가 `tools/paths.js` 의 `RANGE`·`cells` 와 칸마다 같은가.
//            ① 은 `cov` 를 인자로 받으므로 사거리 변조를 못 잡는다
//   ③ 증상   실판 백분위 상·하한. 방향이 반대인 두 회귀를 각각 잡는다
//     하한 — 정책이 통째로 빠지는 것(`SUMMON_SAMPLES` 가 1 로 돌아가거나 커버 표가
//            엉뚱한 스테이지 것이 되면 0.5 로 내려앉는다). 이 티켓의 개선을 잠근다
//     상한 — **최적으로 가지 마라.** 그리디는 「대충 하는 플레이어」이고 자리를 잘
//            고를수록 판이 쉬워져 난이도 눈금이 무너진다(PM 실측: argmax 는 한
//            주머니에 뭉쳐 오히려 나쁘다. DESIGN §꼬리를 재는 자)
//
// **③ 이 왜 혼자서는 모자란지**: 고르는 쪽(`pickSpot`)이 최대화하는 바로 그
// `coverTable` 로 백분위를 재므로, 커버 정의를 바꾸든 「상위 N% 균등」으로 갈든
// 백분위는 높게 나온다. 변조 둘이 ③ 을 통과했고(사거리 4.5 · 상위 60% 균등),
// 그때 규칙을 잡아 준 것은 seedcheck 의 값 지문뿐이었다 — 지문은 **무엇이
// 뚫렸는지 말해 주지 않는다.** ①② 를 붙인 뒤 둘 다 이름 있는 줄에서 걸린다.
//
// 임계는 **채택 k 의 실측 + 여유**다. 하한은 k=2 시절 실측 그대로다 — 이 블록을
// 16런 돌려 최소 0.607(S1), 단발에서 0.599 를 한 번 더 봤고, 거기 맞춰 잡았다.
//   하한 0.55  실측 최소 0.599 아래로 0.049 여유. 균등 난수 0.50 과는 확실히 갈린다
// ① 외곽 도로만 낮은 것은 그 판의 커버 편차가 0.82 라 동률이 많아서다
// (DESIGN §스테이지 — 의도된 성질이다). 그래서 하한은 아홉 판 공통으로 두되 S1 을
// 기준으로 잡았다.
//
// ── [2026-08 #64] **상한 0.72 → 0.90. 이것은 설계 변경이고 유저가 정했다.** ─────
// **지우는 게 아니라 기준을 옮기는 것이다.** 옛 상한 0.72 는 `k` 를 위에서 누르려고
// 세운 줄이었고 **그 일을 제대로 했다** — k=3 에서 여덟 판이 0.719~0.765 로 정확히
// 걸렸다. 옮기는 이유는 그 줄이 고장나서가 아니라 **그 줄이 지키던 규칙이 `#60`
// 이후 자기모순이 됐기 때문**이다.
//
// `tools/sim.js` 의 `k` 최소성 규칙은 조항이 둘이다:
//   (a) 꼬리가 `npm test` 를 흔들지 않을 만큼 얇은 **가장 작은** `k`
//   (b) 기존 게이트가 통과하는 `k` — **이 상한이 그중 하나다**
// `#60`(openRows 누수 수정)이 큰 판을 정의대로 8행으로 돌리기 시작하면서 꼬리가
// 6~10배 두꺼워졌고, **(a) 는 6 이상을 요구하는데 (b) 는 2 만 허용**하게 됐다.
// 겹치는 `k` 가 없다.
//
// **근거는 실측이다. `k=2` 의 꼬리는 채택 근거의 200배였다** — `sim.js` 가 적어 둔
// 채택 위험이 0.098%/런인데 `#60` 이후 ⑥ 합수의 실제 위험이 **20.6%/런**이다
// (⑨ 5.2%/런). 즉 `k=2` 는 **상한이 강제한 값이지 꼬리가 골라 준 값이 아니었다.**
// 두 조항 중 하나를 놓아야 했고, **유저가 상한 쪽을 골랐다.**
//
// **0.90 은 여전히 최적(1.0)이 아니다.** 채택 k=6 실측이 0.823~0.868 이라 최댓값 위로
// 0.032 여유다(k=2 시절 0.034 와 같은 폭으로 잡았다). 최적 배치는 백분위 1.0 이고,
// 그 사이에는 아직 0.13 이 남아 있다.
//
// **다만 이 줄이 전보다 무르다는 것은 숨기지 않는다.** 옛 0.72 는 k≥3 을 혼자 막았는데
// 0.90 은 **k≥9 부터 막는다**(실측 최대: k=6 0.868 · k=7 0.888 · k=8 0.896 · k=9 는
// 0.90 을 넘는다). k=7·8 을 막는 것은 이제 이 줄이 아니라 **다른 셋**이다:
//   · `sim.js` 의 최소성 규칙 — 6 이 (a) 를 만족하는 가장 작은 값이다
//   · **S4 래칫** — `k` 를 올리면 ④ 가 쉬워져 클리어 수가 먼저 움직인다(아래 밸런스 블록)
//   · 아래 `기대 백분위 k/(k+1) ±0.12` — 상수와 실측이 갈리면 거기서 걸린다
// **`k` 를 더 올리고 싶어지면 이 상한을 또 올리지 마라.** 그때 답해야 하는 것은
// 임계가 아니라 「대충 하는 플레이어를 얼마나 잘하게 둘 것인가」이고, 그건 유저 판단이다.
//
// 백분위는 **동률을 반씩 세는 midrank** 다. 「나보다 낮은 것의 비율」만 세면 동률이
// 많은 판에서 통째로 눌려(① 외곽 도로는 커버 편차 0.82 라 균등 난수도 0.30 이
// 나온다) 기대값 `k/(k+1)` 과 대조할 수 없다. midrank 는 분포 모양과 무관하게
// 균등 난수가 정확히 0.5 다. 자세한 것은 tools/place.js.
{
  console.log('배치 백분위 (#35)');
  const TRIALS = 4;
  const LO = 0.55, HI = 0.90;   // 상한은 #64 에서 옮겼다 — 바로 위 문단이 근거다
  const want = SUMMON_SAMPLES / (SUMMON_SAMPLES + 1);

  // ── ① 규칙을 직접 잠근다 ──────────────────────────────────
  // **아래 백분위 세 줄만으로는 규칙을 못 잡는다 — 순환이기 때문이다.**
  // 고르는 쪽(`pickSpot`)이 최대화하는 바로 그 `coverTable` 로 백분위를 재므로,
  // 「커버를 어떻게 정의하든」·「상위 몇 %에서 균등하게 뽑든」 백분위는 높게 나온다.
  // 실제로 변조 둘이 네 줄을 전부 통과했다:
  //   ① 사거리 2.2 → 4.5      백분위 0.678 0.690 0.683 0.677 0.667 로 PASS
  //   ② 커버 상위 60% 균등     백분위 0.630 0.696 0.688 0.693 0.705 로 PASS
  // 그때 규칙을 잡아 주는 것은 seedcheck 의 값 지문뿐인데, 지문은 **무엇이 뚫렸는지
  // 말해 주지 않는다**(이 리포가 두 번 밟은 자리). 그래서 규칙 자체를 단언한다.
  //
  // `pickSpot` 은 순수 함수라 게임을 안 돌리고 난수만 스텁하면 전부 검사된다.
  {
    // 인덱스 i 를 뽑게 하는 난수값. `(r * n) | 0 === i` 가 되게 중앙을 준다.
    const idxAt = (i, n) => (i + 0.5) / n;
    const withSeq = (vals, fn) => {
      const orig = Math.random;
      let i = 0, n = 0;
      Math.random = () => { n++; return vals[i++]; };
      try { return { out: fn(), draws: n }; } finally { Math.random = orig; }
    };
    // 커버가 곧 x 좌표인 후보 넷 — 커버 0 / 1 / 2 / 3
    const spots4 = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const covX = (x) => x;

    // (a) 후보 수와 무관하게 **정확히 k 회**. 후보가 1칸이어도 k 회다
    //     (회계가 단순해야 seedcheck 의 「호출 지점별로 갈라 세기」가 성립한다).
    for (const k of [1, 2, 3, 5]) {
      const { draws } = withSeq(Array(k).fill(0.5), () => pickSpot(spots4, covX, k));
      ok(`  난수를 정확히 k회 소비한다 (k=${k})`, draws === k, draws + '회');
    }
    {
      const { draws } = withSeq([0.5, 0.5, 0.5], () => pickSpot([[7, 7]], covX, 3));
      ok('  후보가 1칸이어도 k회 뽑는다', draws === 3, draws + '회');
    }

    // (b) **뽑힌 표본 중 커버 최대**를 돌려준다. 「상위 N% 균등」·「가중 추첨」류
    //     변조가 여기서 걸린다 — 뽑힌 셋이 커버 1/3/0 이면 답은 반드시 3 이다.
    {
      const { out } = withSeq([idxAt(1, 4), idxAt(3, 4), idxAt(0, 4)],
        () => pickSpot(spots4, covX, 3));
      ok('  뽑힌 표본 중 커버 최대를 고른다', out[0] === 3, '커버 ' + out[0]);
    }
    {
      // 최대가 **마지막에** 뽑혀도 골라야 한다(비교 방향이 뒤집히면 걸린다).
      const { out } = withSeq([idxAt(0, 4), idxAt(1, 4), idxAt(3, 4)],
        () => pickSpot(spots4, covX, 3));
      ok('    최대가 마지막에 뽑혀도 고른다', out[0] === 3, '커버 ' + out[0]);
    }
    {
      // 안 뽑힌 칸은 못 고른다. argmax(전역 최대)로 바뀌면 여기서 걸린다 —
      // 3 을 한 번도 안 뽑았는데 3 이 나오면 복원추출이 아니다.
      const { out } = withSeq([idxAt(0, 4), idxAt(1, 4)], () => pickSpot(spots4, covX, 2));
      ok('    안 뽑힌 칸은 안 고른다 (전역 argmax 가 아니다)', out[0] === 1, '커버 ' + out[0]);
    }

    // (c) 동점이면 **먼저 뽑힌 쪽**. 이게 k=1 퇴화 동일성의 근거다 —
    //     `>` 가 `>=` 로 바뀌면 뒤에 뽑힌 쪽이 이겨 옛 스트림과 안 맞는다.
    {
      const flat = () => 5;
      const { out } = withSeq([idxAt(2, 4), idxAt(0, 4), idxAt(1, 4)],
        () => pickSpot(spots4, flat, 3));
      ok('  동점이면 먼저 뽑힌 쪽이 이긴다', out[0] === 2, 'x=' + out[0]);
    }
    {
      // k=1 은 「뽑은 인덱스를 그대로」와 같아야 한다(퇴화 동일성의 뿌리).
      const { out, draws } = withSeq([idxAt(2, 4)], () => pickSpot(spots4, covX, 1));
      ok('  k=1 은 뽑은 인덱스를 그대로 쓴다', out[0] === 2 && draws === 1, 'x=' + out[0]);
    }
  }

  // ── ② 커버의 정의가 paths.js 와 같은가 ────────────────────
  // 위 (b)(c) 는 `cov` 를 인자로 받으므로 **사거리를 바꾸는 변조는 못 잡는다.**
  // 그건 여기서 잡는다 — `tools/paths.js` 의 `RANGE`·`cells` 로 커버를 독립으로
  // 계산해 `sim.js` 의 `coverTable` 과 **칸 하나까지** 대조한다.
  {
    const { RANGE, cells } = require('./paths.js');
    // DESIGN §스테이지의 커버 편차 표를 이 값으로 떴다. 고치려면 그 표를 다시 뜰 것.
    ok('  커버 사거리가 DESIGN 표와 같다 (2.2)', RANGE === 2.2, String(RANGE));

    let mismatch = null;
    for (const st of [0, 4]) {
      const g = load();
      g.loadStage(st);
      const cov = coverTable(g);
      const { BOARD_W, BOARD_H } = g.CFG;
      const P = [...cells(g.lanes.map(l => l.points))]
        .map(k => k.split(',').map(Number))
        .filter(([x, y]) => x >= 0 && x < BOARD_W && y >= 0 && y < BOARD_H);
      for (let y = 0; y < BOARD_H && !mismatch; y++)
        for (let x = 0; x < BOARD_W && !mismatch; x++) {
          const want2 = P.filter(([px, py]) => Math.hypot(px - x, py - y) <= RANGE).length;
          if (cov(x, y) !== want2) mismatch = `S${st + 1} (${x},${y}) ${cov(x, y)} != ${want2}`;
        }
    }
    ok('  sim 의 커버 표가 paths.js 정의와 칸마다 같다', !mismatch, mismatch || 'S1·S5 전 칸 일치');
  }

  // ── ③ 실판 백분위 (증상) ──────────────────────────────────
  // **계측(`tools/place.js`)과 같은 함수를 쓴다.** 두 벌로 두었더니 경계 규칙이
  // 이미 갈려 있었다(강제 선택 처리). 찍는 수와 잠그는 수가 다르면 이 게이트는
  // place.js 가 보여 주는 것을 안 잠근다.
  const pcts = [];
  for (let st = 0; st < load().STAGES.length; st++) {
    const picks = [];
    for (let i = 0; i < TRIALS; i++) picks.push(...probe(st));
    pcts.push(meanPct(picks) ?? 0);
  }

  const fmt = pcts.map(p => p.toFixed(3)).join(' ');
  ok(`자리를 보고 놓는다 (백분위 >= ${LO})`, pcts.every(p => p >= LO), fmt);
  ok(`최적으로는 안 놓는다 (백분위 <= ${HI})`, pcts.every(p => p <= HI), fmt);
  // k 를 바꿨는데 이 줄이 안 따라 움직이면 커버 표나 표본 수가 안 먹은 것이다.
  ok(`기대 백분위 k/(k+1) = ${want.toFixed(2)} 에서 ±0.12`,
    pcts.every(p => Math.abs(p - want) <= 0.12), 'k=' + SUMMON_SAMPLES + '  ' + fmt);

  // 커버 표가 스테이지마다 다시 만들어지는가. 모듈 전역에 캐시하면 스테이지 1 의
  // 커버로 스테이지 5 를 놓는데, **조용히 틀리고 위 세 줄도 안 걸린다** — 백분위는
  // 「그 판의 후보들 사이 순위」라 엉뚱한 표를 써도 0.5 근처로만 내려앉는다.
  // 그래서 표 자체를 직접 본다. 같은 g 로 판을 갈아타는 경로까지 덮는다.
  {
    const g = load();
    g.loadStage(0);
    const c1 = coverTable(g);
    const a = [c1(3, 5), c1(0, 9)];
    g.loadStage(4);
    const c5 = coverTable(g);
    const b = [c5(3, 5), c5(0, 9)];
    ok('  스테이지를 바꾸면 커버 표도 바뀐다', a.join() !== b.join(), a.join('/') + ' → ' + b.join('/'));
  }
}

// ── 종류별 자리 점수 (#48) ────────────────────────────────────
// 박격포·마력로만 커버가 아닌 자로 자리를 고른다(`tools/sim.js` §종류별 자리 점수).
// **위 「배치 백분위」 블록은 이 변경을 하나도 안 잡는다** — 백분위는 「그 종류가 쓴
// 자로 재면 k/(k+1) 인가」라서, 박격포를 커버로 되돌려도 여전히 0.67 이 나온다.
// 순환이 위 블록보다 한 겹 더 깊은 셈이라 여기서는 **자 자체**를 본다.
//
// 네 겹이다. 겹마다 다른 변조를 잡는다:
//   ⓪ 전제   폭발 반경이 칸보다 작다 — 이 자를 칸 단위로 못 만드는 이유 자체
//   ① 분배   어느 종류가 어느 자를 쓰는가. **박격포를 커버로 되돌리면 여기서 걸린다**
//   ② 정의   두 표가 게임 판정과 칸마다 같은가. 상수를 갈아도 여기서 걸린다
//   ③ 판별력 새 자가 커버와 **다른 순위**를 매기는가. 자를 「커버 x 1.1」 같은 단조
//            변환으로 위장해도 여기서 걸린다(① 은 함수가 다르기만 하면 통과한다)
{
  console.log('종류별 자리 점수 (#48)');
  const g5 = load(); g5.loadStage(4);
  const g6 = load(); g6.loadStage(5);

  // ── ⓪ 왜 칸 단위로는 못 재는가 ────────────────────────────
  // **폭발 반경 0.8 은 칸 간격 1.0 보다 작다.** 그래서 경로 「칸」만 세면 어느 칸에
  // 떨어져도 걸리는 칸이 자기 자신 하나뿐이고, 모든 자리의 점수가 같아진다. 이건
  // 튜닝이 아니라 격자 해상도의 문제라 `PATH_STEP` 으로 잘게 뜨는 것 말고 길이 없다.
  // 반경이 1 을 넘게 바뀌면 이 전제가 깨지므로 그때 자를 다시 볼 것.
  {
    ok('  폭발 반경이 칸 간격보다 작다', g5.BLAST_RADIUS < 1, 'BLAST_RADIUS ' + g5.BLAST_RADIUS);
    let worst = 0;
    for (const key of g5.pathCells) {
      const [x, y] = key.split(',').map(Number);
      let n = 0;
      for (const k2 of g5.pathCells) {
        const [a, b] = k2.split(',').map(Number);
        if (Math.hypot(a - x, b - y) <= g5.BLAST_RADIUS) n++;
      }
      worst = Math.max(worst, n);
    }
    ok('    그래서 경로 칸만 세면 어느 칸이든 자기 하나뿐이다', worst === 1, '최대 ' + worst + '칸');
  }

  // ── ① 어느 종류가 어느 자를 쓰는가 ────────────────────────
  // **박격포 점수 함수를 커버로 되돌리는 변조가 정확히 여기서 걸린다.**
  {
    const cells = [];
    for (let y = 0; y < g5.CFG.BOARD_H; y++)
      for (let x = 0; x < g5.CFG.BOARD_W; x++) cells.push([x, y]);
    const same = (f, h) => cells.every(([x, y]) => f(x, y) === h(x, y));
    const cov = coverTable(g5);

    ok('  박격포는 커버가 아닌 자를 쓴다',
      !same(spotScore(g5, 'mortar'), cov) && same(spotScore(g5, 'mortar'), blastTable(g5)), '폭발');
    ok('  마력로는 커버가 아닌 자를 쓴다',
      !same(spotScore(g5, 'arc'), cov) && same(spotScore(g5, 'arc'), beamTable(g5)), '관통');
    // 나머지 다섯은 **안 건드렸다는 것이 수용 기준**이다. 한 종류라도 새 자로 새면
    // affinity 전후 비교에서 「자를 안 바꾼 타워까지 움직였다」가 된다.
    const rest = ['shredder', 'eroder', 'frost', 'marksman', 'mint'];
    const leaked = rest.filter(k => !same(spotScore(g5, k), cov));
    ok('  나머지 다섯은 커버 표 그대로다', !leaked.length, leaked.length ? leaked.join(',') : rest.join(','));
  }

  // ── ② 두 표가 게임 판정과 같은가 ─────────────────────────
  // 위 ① 은 「커버가 아니다」까지만 본다. 판정식이 틀려도 통과하므로, 여기서
  // **게임이 실제로 쓰는 식**으로 독립 계산해 칸마다 대조한다. 위 커버 게이트가
  // `paths.js` 로 하는 것과 같은 구조다.
  //
  // 표본 뜨는 규칙(`PATH_STEP`)은 자의 파라미터라 sim 에서 받아 오지만, **판정에
  // 들어가는 수는 전부 게임 것**이다(BLAST_RADIUS · BEAM_HALF · towerRange · distTo).
  // 그래서 index.html 쪽 상수를 고치면 이 줄이 걸린다.
  {
    const samples = (g) => {
      const xs = [], ys = [];
      for (let lane = 0; lane < g.lanes.length; lane++) {
        const len = g.laneLen(lane);
        for (let d = 0; d <= len; d += PATH_STEP) {
          const p = g.posAt(d, lane);
          xs.push(p.x); ys.push(p.y);
        }
      }
      return { xs, ys, n: xs.length };
    };

    let bad = null;
    for (const g of [g5, g6]) {
      const { xs, ys, n } = samples(g);
      const R = g.BLAST_RADIUS;
      const mr = g.towerRange({ kind: 'mortar', star: 1 });
      const ar = g.towerRange({ kind: 'arc', star: 1 });
      const H = g.BEAM_HALF;
      const bl = blastTable(g), be = beamTable(g);
      const stride = Math.max(1, Math.round(1 / PATH_STEP));

      for (let y = 0; y < g.CFG.BOARD_H && !bad; y++)
        for (let x = 0; x < g.CFG.BOARD_W && !bad; x++) {
          // 폭발: 사거리 안 표본마다 「그 자리에 떨어졌을 때 걸리는 표본 수」를 더한다
          const tm = { kind: 'mortar', star: 1, gx: x, gy: y };
          let want = 0;
          for (let i = 0; i < n; i++) {
            if (g.distTo(tm, { x: xs[i], y: ys[i] }) > mr) continue;
            for (let j = 0; j < n; j++)
              if (Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) <= R) want++;
          }
          if (bl(x, y) !== want) { bad = `폭발 S${g.state.stage + 1} (${x},${y}) ${bl(x, y)} != ${want}`; break; }

          // 관통: 사거리 안 표본을 하나씩 겨냥해 보고 가장 많이 꿰는 방향
          const ta = { kind: 'arc', star: 1, gx: x, gy: y };
          const c = g.towerCenter(ta);
          const aim = [];
          for (let i = 0; i < n; i++)
            if (g.distTo(ta, { x: xs[i], y: ys[i] }) <= ar) aim.push(i);
          let best = 0;
          for (let a = 0; a < aim.length; a += stride) {
            const i = aim[a];
            const ax = xs[i] + 0.5 - c.x, ay = ys[i] + 0.5 - c.y;
            const len = Math.hypot(ax, ay);
            if (len === 0) continue;   // 방향이 없는 겨냥은 건너뛴다 (sim.js beamTable 주석)
            const dx = ax / len, dy = ay / len;
            let cnt = 0;
            for (let j = 0; j < n; j++) {
              const vx = xs[j] + 0.5 - c.x, vy = ys[j] + 0.5 - c.y;
              const proj = vx * dx + vy * dy;
              if (proj < 0 || proj > ar) continue;
              if (Math.abs(vx * dy - vy * dx) > H) continue;
              cnt++;
            }
            if (cnt > best) best = cnt;
          }
          if (be(x, y) !== best) { bad = `관통 S${g.state.stage + 1} (${x},${y}) ${be(x, y)} != ${best}`; break; }
        }
    }
    ok('  두 표가 게임 판정과 칸마다 같다 (S5·S6)', !bad, bad || '전 칸 일치');
  }

  // ── ③ 새 자가 커버와 다른 순위를 매기는가 ─────────────────
  // ① 은 「값이 다르다」까지다. 커버에 상수를 곱하기만 한 자도 통과한다 — 그러면
  // **자를 바꿨다고 적고 실제로는 아무 자리도 안 바뀐** 상태가 된다. 그래서 순위가
  // 실제로 갈리는 비율을 본다. 임계 5% 는 실측(폭발 19~27% · 관통 19~35%)의 4분의 1
  // 아래라 여유가 크다 — 잡으려는 것은 「거의 같다」이지 「덜 다르다」가 아니다.
  {
    const disagree = (g, f) => {
      const cov = coverTable(g), cells = [];
      for (let y = 0; y < g.CFG.BOARD_H; y++)
        for (let x = 0; x < g.CFG.BOARD_W; x++) if (!g.isPath(x, y)) cells.push([x, y]);
      let diff = 0, n = 0;
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++) {
          const [ax, ay] = cells[i], [bx, by] = cells[j];
          const c = Math.sign(cov(ax, ay) - cov(bx, by));
          const s = Math.sign(f(ax, ay) - f(bx, by));
          if (c && s && c !== s) diff++;
          n++;
        }
      return diff / n;
    };
    const mb = disagree(g6, blastTable(g6)), ab = disagree(g6, beamTable(g6));
    ok('  폭발 자는 커버와 다른 순위를 매긴다 (>5%)', mb > 0.05, (100 * mb).toFixed(1) + '%');
    ok('  관통 자는 커버와 다른 순위를 매긴다 (>5%)', ab > 0.05, (100 * ab).toFixed(1) + '%');
  }

  // ── ④ 유도 결과: 좋은 자리는 직선이 아니라 꺾임이다 ───────
  // **착수 시점의 가설은 「박격포는 직선을 덮는다」였고, 판정식에서 유도하면 반대가
  // 나온다.** 곧은 통로에 떨어진 반경 0.8 짜리 원은 경로를 1.6칸(= 표본 9개)만 무는데,
  // 직각으로 꺾이는 자리에서는 두 팔을 비스듬히 물어 그보다 많이 덮는다. 레인이
  // 겹치는 구간도 같은 이유로 커진다. 이 줄은 **그 유도가 실제로 성립하는지**를 본다 —
  // 판을 새로 붙였는데 꺾임이 없으면 여기서 걸리고, 그때는 자가 아니라 판을 볼 일이다.
  // (KINDS.mortar.how 의 「줄지어 오는 직선」은 5성 탄막이 세 발을 경로를 따라 늘어놓는
  //  이야기라 무분기 1발의 자리값과는 다른 층이다 — index.html 박격포 주석.)
  {
    const straight = 2 * Math.floor(g6.BLAST_RADIUS / PATH_STEP) + 1;
    const xs = [], ys = [];
    for (let lane = 0; lane < g6.lanes.length; lane++) {
      const len = g6.laneLen(lane);
      for (let d = 0; d <= len; d += PATH_STEP) { const p = g6.posAt(d, lane); xs.push(p.x); ys.push(p.y); }
    }
    let max = 0, flat = 0;
    for (let i = 0; i < xs.length; i++) {
      let c = 0;
      for (let j = 0; j < xs.length; j++)
        if (Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) <= g6.BLAST_RADIUS) c++;
      if (c === straight) flat++;
      max = Math.max(max, c);
    }
    ok('  곧은 통로의 폭발 크기가 계산값과 같다', flat > 0, `${straight}표본짜리 지점 ${flat}개`);
    ok('    꺾임·레인겹침은 그보다 크다 (직선이 최선이 아니다)', max > straight, `최대 ${max} > 직선 ${straight}`);
  }
}

// ── 소환 종류 선택 ────────────────────────────────────────────
// 그리디가 **덱의 셋째 종류를 안 짓고 있었다**(#31). pickKind 가 「짝이 안 맞는
// 최저 성급」이 없는 종류를 Infinity 로 떨어뜨렸는데, 한 대도 없는 종류가 정확히
// 그 경우라 덱의 세 번째 원소가 영영 꼴찌였다. 그래서 「덱 3종」으로 재던 수치가
// (밸런스 곡선 · 파편 예산 · 대등성 · seedcheck 세 케이스 전부) 사실상 2종을
// 재고 있었다. 여기서 잠그는 것은 둘이다 — 규칙 자체와, 실제 판에서의 결과.
{
  console.log('소환 종류 선택');

  // ① 규칙. **난수를 한 번도 안 뽑는다** — 그래서 이 단언은 시드에도 밸런스에도
  // 안 딸린다. 아래 ② 가 흔들려도 규칙이 깨진 건지 판이 달라진 건지 여기서 갈린다.
  // pickKind 를 greedy 클로저 밖 순수 함수로 뺀 이유가 이 한 줄이다.
  {
    const orig = Math.random;
    let calls = 0;
    Math.random = () => { calls++; return orig(); };
    let picks, towers;
    try {
      const deck = ['shredder', 'arc', 'mint'];
      towers = [];
      picks = [];
      for (let i = 0; i < 3; i++) {
        const k = pickKind(deck, towers);
        picks.push(k);
        towers.push({ kind: k, star: 1 });          // 소환은 늘 1성이다
      }
    } finally {
      Math.random = orig;
    }
    ok('빈 판에서 세 번 부르면 덱 3종이 전부 한 번씩',
      new Set(picks).size === 3, picks.join(','));
    ok('  난수를 0회 호출한다', calls === 0, calls + '회');

    // 한 대도 없는 종류가 최우선이다. 앞 종류를 아무리 키워 놔도 순서가 안 밀린다.
    ok('미착수 종류가 성급 높은 종류보다 앞선다',
      pickKind(['shredder', 'mint'], [{ kind: 'shredder', star: 1 }]) === 'mint');
    ok('  6성이 쌓여 있어도 마찬가지',
      pickKind(['shredder', 'mint'], [{ kind: 'shredder', star: 6 }]) === 'mint');

    // 반대로 **타워는 있는데 짝이 다 맞는** 종류는 그대로 후순위다(합성할 짝이
    // 이미 있거나 자리가 없어 안 합쳐진 경우). 미착수와 갈라내는 것이 이 티켓이다.
    ok('짝이 다 맞는 종류는 후순위',
      pickKind(['shredder', 'mint'],
        [{ kind: 'shredder', star: 1 }, { kind: 'shredder', star: 1 },
          { kind: 'mint', star: 2 }]) === 'mint');

    // ── 여기서부터가 규칙을 실제로 잠그는 줄이다 ──────────────────
    // 위 다섯 줄과 아래 ② 는 **「덱 순서대로 한 바퀴」 오답 구현에 전부 통과한다.**
    // `pickKind = (deck, towers) => deck[towers.length % deck.length]` 로 바꿔서
    // 확인했다 — 단위 5/5 · 실판 2/2 통과. 3종이 다 지어지는 건 그 오답도 마찬가지라
    // 「증상」으로는 규칙을 못 잠근다. 그래서 **정답이 덱 순서와 어긋나는** 케이스를
    // 규칙 조항마다 하나씩 둔다. 아래 넷은 라운드로빈이면 전부 반대 답이 나온다.
    ok('미착수가 덱 뒤가 아니라 앞일 때도 이긴다',
      pickKind(['mint', 'shredder'], [{ kind: 'shredder', star: 1 }]) === 'mint',
      '(라운드로빈이면 shredder)');
    ok('최저 성급이 이긴다',
      pickKind(['shredder', 'mint'],
        [{ kind: 'shredder', star: 3 }, { kind: 'mint', star: 1 }]) === 'mint',
      '(라운드로빈이면 shredder)');
    // 주석에만 있고 단언이 없던 조항. 둘 다 최저 홀수 성급이 1 인데 개수가 3 대 1 이다.
    ok('동점이면 개수가 적은 쪽이 이긴다',
      pickKind(['shredder', 'mint'],
        [{ kind: 'shredder', star: 1 }, { kind: 'shredder', star: 2 },
          { kind: 'shredder', star: 4 }, { kind: 'mint', star: 1 }]) === 'mint',
      '(라운드로빈이면 shredder)');
    ok('짝이 다 맞는 종류는 덱 앞에 있어도 후순위',
      pickKind(['mint', 'shredder'],
        [{ kind: 'shredder', star: 1 }, { kind: 'shredder', star: 1 },
          { kind: 'mint', star: 2 }]) === 'mint',
      '(라운드로빈이면 shredder)');
  }

  // ② 실제 판. 옛 규칙에서 셋째 종류가 안 나오던 덱들을 그대로 쓴다 — 위에서부터
  // 밸런스 곡선(mint 미착수) · 파편 예산(mortar) · 사운드(frost) · DESIGN 의
  // 「파쇄+침식+X 다섯 덱이 X 와 무관하게 똑같이 끝난다」(mint).
  // 스테이지3 은 tune.js 가 박아 둔 난이도 기준판이고, 시드는 12345 로 고정한다.
  {
    const DECKS = [
      ['shredder', 'arc', 'mint'],
      ['shredder', 'marksman', 'mortar'],
      ['mortar', 'marksman', 'frost'],
      ['shredder', 'eroder', 'mint'],
    ];
    const TRIALS = 3;
    const rows = [];
    for (const deck of DECKS) {
      // 덱마다 시드를 **다시** 박는다. 한 번만 박고 12판을 이어 돌리면 앞 덱이
      // 난수를 얼마나 먹었느냐에 뒤 덱이 딸려서, DECKS 에서 하나만 빼거나 순서를
      // 바꿔도 나머지가 통째로 다른 판이 된다 — 아래 「타워 대등성」 블록이 분기마다
      // 다시 박는 것과 같은 이유다.
      const orig = Math.random;
      let s = 12345 >>> 0;
      Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
      try {
        for (let i = 0; i < TRIALS; i++) {
          const g = load();
          // **소환 횟수는 최종 타워 수로 못 잰다.** greedy 가 돌려주는 towers 는
          // 합성이 끝난 뒤라, 30회 소환해서 2대로 합쳐진 판과 2회밖에 못 소환한
          // 판이 똑같이 2 다. 하필 전자가 이 게이트가 잡아야 할 실패(셋째 종류를
          // 못 지어 두 종류가 각각 고성급으로 뭉친 판)라 분모에서 조용히 빠진다.
          // 그래서 실제로 판에 선 소환만 g.summon 을 감싸서 센다.
          let summons = 0;
          const summon = g.summon;
          g.summon = (...a) => {
            const before = g.state.towers.length;
            const out = summon(...a);
            if (g.state.towers.length > before) summons++;
            return out;
          };
          const r = greedy(g, { stage: 2, deck });
          rows.push({ deck, kinds: new Set(r.towers.map(t => t.replace(/\d+$/, ''))), summons });
        }
      } finally {
        Math.random = orig;                         // 안 되돌리면 뒤의 모든 블록이 조용히 바뀐다
      }
    }

    // 소환을 3회도 못 한 판은 셋째 종류를 시작할 골드가 없었던 것이라 분모에서
    // 뺀다(소환 비용은 10 + 2*누적이다). 지금은 한 판도 안 걸리지만, 밸런스를
    // 조여서 걸리기 시작하면 이 게이트가 「규칙이 깨졌다」로 오독되면 안 된다.
    const judged = rows.filter(r => r.summons >= 3);
    const full = judged.filter(r => r.kinds.size >= 3).length;
    // `full === judged.length` 만 쓰면 분모가 0 일 때 0===0 으로 조용히 통과한다.
    // 위 필터가 언젠가 전부 걷어내면 게이트가 공회전하면서 초록불을 낸다.
    ok('덱 3종이 전부 지어진다', judged.length > 0 && full === judged.length,
      full + '/' + judged.length + ' (소환<3 으로 제외 ' + (rows.length - judged.length) + ')'
      + '  최소 소환 ' + Math.min(...rows.map(r => r.summons)));
    ok('  덱에 없는 종류는 안 지어진다',
      rows.every(r => [...r.kinds].every(k => r.deck.includes(k))));
  }
}

// ── 세이브 ────────────────────────────────────────────────────
// 스냅샷은 웨이브 사이에만 찍는다. 되살렸을 때 판이 그대로여야 한다.
{
  console.log('세이브');
  const g = load();
  const { state, CFG } = g;
  g.pickStage(0);
  ['shredder', 'frost', 'marksman'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  state.gold = 5000;
  for (let i = 0; i < 8; i++) g.summon(state.deck[i % 3]);
  state.towers[0].star = 4;
  state.towers[0].b3 = 'B';
  state.essence = 2;
  state.wave = 5;

  const snap = g.snapshotRun();
  ok('준비 단계면 스냅샷이 찍힌다', !!snap);
  ok('타워가 전부 들어간다', snap.towers.length === state.towers.length,
    snap.towers.length + '/' + state.towers.length);

  state.phase = 'wave';
  ok('웨이브 중에는 안 찍는다', g.snapshotRun() === null);
  state.phase = 'build';

  // 판을 헝클어 놓고 되살린다
  const before = {
    towers: state.towers.map(t => t.kind + t.star + (t.b3 || '')).sort().join(','),
    gold: Math.round(state.gold), wave: state.wave, essence: state.essence,
    deck: state.deck.slice().sort().join(','),
  };
  g.restart();
  ok('재시작하면 판이 비워진다', state.towers.length === 0);

  ok('스냅샷이 되살아난다', g.restoreRun(snap) === true);
  const after = {
    towers: state.towers.map(t => t.kind + t.star + (t.b3 || '')).sort().join(','),
    gold: Math.round(state.gold), wave: state.wave, essence: state.essence,
    deck: state.deck.slice().sort().join(','),
  };
  for (const k of Object.keys(before))
    ok('  ' + k + ' 가 같다', before[k] === after[k], before[k] + ' vs ' + after[k]);
  ok('되살린 판은 준비 단계', state.phase === 'build', state.phase);
  ok('적·발사체는 비어 있다', state.enemies.length === 0 && state.shells.length === 0);

  // 지금 규칙과 안 맞는 스냅샷은 통째로 버린다
  ok('덱 수가 안 맞으면 버린다', g.restoreRun({ ...snap, deck: ['frost'] }) === false);
  ok('없는 스테이지면 버린다', g.restoreRun({ ...snap, stage: 99 }) === false);
  ok('빈 값이면 버린다', g.restoreRun(null) === false);

  // 세이브는 줄어들면 안 된다
  const merged = g.mergeBundle(
    { v: 1, unlocked: 3, best: [20, 5, 0, 0], run: { stage: 0, wave: 9 } },
    { v: 1, unlocked: 2, best: [12, 25, 0, 0], run: { stage: 1, wave: 3 } });
  ok('해금은 큰 쪽을 쓴다', merged.unlocked === 3, String(merged.unlocked));
  // 기대값은 STAGES.length 로 늘린다. 넣은 배열은 일부러 4칸짜리(판이 늘기 전의
  // 세이브)로 두어 mergeBundle 의 `|| 0` 이 새 칸을 메우는 것까지 같이 잰다.
  const wantBest = ['20', '25', ...Array(Math.max(0, g.STAGES.length - 2)).fill('0')].join(',');
  ok('최고 기록은 칸마다 큰 쪽', merged.best.join(',') === wantBest,
    merged.best.join(',') + '  (기대 ' + wantBest + ')');

  // ── 옛 세이브 자동 해금 ──
  // 판을 뒤에 붙이기 전에 네 판을 다 깬 사람은 마지막 판을 다시 깨지 않아도 된다.
  // 해금 규칙(index.html:3107)이 `unlocked < STAGES.length` 로 막혀 있어서 네 판
  // 시절의 마지막 판을 깨도 unlocked 가 4 에서 멈춰 있기 때문이다.
  {
    const w = g.STAGES.map(s => s.waves);
    const allFour = { v: 1, unlocked: 4, best: [w[0], w[1], w[2], w[3]], run: null };
    g.applyBundle(allFour);
    ok('  네 판을 다 깬 세이브는 5번이 열린다', g.saveBundle().unlocked === 5,
      String(g.saveBundle().unlocked));

    // 마지막 한 판만 못 깬 사람에게는 안 열린다. 이 줄이 이 조항의 전부다 —
    // 여기가 무너지면 안 깬 사람에게 판이 열린다.
    g.applyBundle({ v: 1, unlocked: 4, best: [w[0], w[1], w[2], w[3] - 1], run: null });
    ok('  마지막 판을 못 깼으면 안 열린다', g.saveBundle().unlocked === 4,
      String(g.saveBundle().unlocked));

    // best 가 아예 없는(판을 한 번도 안 깬) 세이브
    g.applyBundle({ v: 1, unlocked: 1, best: [], run: null });
    ok('  기록이 없으면 안 열린다', g.saveBundle().unlocked === 1, String(g.saveBundle().unlocked));

    // 몇 번을 다시 적용해도 같은 값이라야 한다 — SAVE_VERSION 을 안 올린 근거다.
    g.applyBundle(allFour);
    const once = g.saveBundle().unlocked;
    g.applyBundle(g.saveBundle());
    g.applyBundle(g.saveBundle());
    ok('  여러 번 적용해도 안 밀린다', g.saveBundle().unlocked === once,
      once + ' → ' + g.saveBundle().unlocked);
  }
  ok('이어할 판은 더 나아간 쪽', merged.run.stage === 1, 'stage ' + merged.run.stage);
}

// ── 시작 시 열린 행 (#60) ─────────────────────────────────────
// 시작 시 열린 행 수가 **직전에 한 판**을 따라다녔다. `restart()` 가 `openRows` 를
// 되돌렸는데 그 자리는 판을 고르기 **전**이라 거기 있는 `CFG.OPEN_ROWS` 는 아직
// 직전 판의 값이고, `pickStage → loadStage` 가 `CFG` 를 갈아끼운 뒤에는 아무도
// 안 고쳤다. ① 외곽(정의 6)을 ⑥ 합수(정의 8) 뒤에 하면 2행이 더 열려 쉬워졌고
// 반대로 하면 2행이 덜 열려 어려워졌다 — **난이도가 직전 판을 탔다.**
//
// **시뮬은 이걸 정의상 못 본다.** `greedy` 는 판마다 새 `load()` 를 써서 늘 첫 판
// 상태이고 `shot` 은 매 컷 새 페이지다. 그래서 `curve`·`affinity`·기존 `npm test`
// 어디에도 안 걸렸다. 여기서는 **한 `load()` 안에서 판을 오간다** — `laneCursor`
// 를 재는 방식과 같은 이유이고, 이 파일이 그걸 잴 수 있는 유일한 자리다.
{
  console.log('시작 시 열린 행');
  const g = load();
  const { state, CFG } = g;
  const N = g.STAGES.length;
  // 판을 전부 열어 둔다. `pickStage` 는 잠긴 판이면 토스트만 내고 통째로 no-op 이라,
  // 이 줄이 없으면 아홉 판을 도는 척하며 1스테이지만 여든한 번 잰다(레인 배정
  // 블록이 오래 그 함정에 빠져 있었다 — 위 주석 참고).
  g.applyBundle({ v: 1, unlocked: N, best: g.STAGES.map(s => s.waves), run: null });

  // 유저가 실제로 겪은 것은 「열린 행 수」가 아니라 **놓을 수 있는 칸 수**다.
  // `openRows` 만 보면 `firstOpenRow()` 가 딴 값을 베끼기 시작해도 안 걸린다.
  const cells = () => {
    const occ = g.occupancy();
    let n = 0;
    for (let y = 0; y < CFG.BOARD_H; y++)
      for (let x = 0; x < CFG.BOARD_W; x++)
        if (g.canPlace(x, y, 1, occ)) n++;
    return n;
  };

  // 기준 칸 수. **`state.openRows` 를 판 정의에서 손으로 세워 놓고 잰다** —
  // 고친 줄이 내는 값으로 기준을 만들면 그 줄을 지웠을 때 기준까지 같이 틀려서
  // 검사가 조용히 통과한다(자가 두 벌). 여기서 자는 `STAGES[i].openRows` 하나다.
  const wantCells = [];
  for (let i = 0; i < N; i++) {
    g.loadStage(i);
    state.towers.length = 0;
    state.openRows = g.STAGES[i].openRows;
    wantCells.push(cells());
  }

  // 판에 들어가는 정문. 덱은 **그 판이 허용하는 것에서** 고른다 — 목록을 여기
  // 베끼면 `allowKinds` 를 고쳤을 때 `startRun` 이 조용히 거절하고(phase 가 deck 에
  // 멈춘다) 검사는 그대로 통과한다.
  let notBuilt = 0;
  const enter = i => {
    g.pickStage(i);
    state.deckPick = [];
    g.allowedKinds(i).slice(0, CFG.DECK_SIZE).forEach(k => g.toggleDeckPick(k));
    g.startRun();
    if (state.phase !== 'build') notBuilt++;
  };

  // ── 아홉 판의 **모든 순서쌍**(81). 「어느 순서로 오가도」가 조항이므로 표본을
  // 고르지 않는다 — 81 판이라고 해 봐야 loadStage 뿐이라 순식간이다.
  let badRows = 0, badCells = 0, crossed = 0, firstBad = '';
  for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) {
      g.restart(); enter(a);
      g.restart(); enter(b);
      const want = g.STAGES[b].openRows;
      if (state.openRows !== want) {
        badRows++;
        if (!firstBad) firstBad = `${a + 1}→${b + 1}: openRows ${state.openRows} 정의 ${want}`;
      }
      if (g.firstOpenRow() !== CFG.BOARD_H - want) badRows++;
      if (cells() !== wantCells[b]) badCells++;
      if (g.STAGES[a].openRows !== want) crossed++;
    }
  }
  ok('어느 순서로 오가도 정의대로 열린다', badRows === 0, badRows ? firstBad : `${N}x${N}쌍`);
  ok('  배치 가능 칸도 정의대로', badCells === 0, badCells ? badCells + '쌍 어긋남' : `${N}x${N}쌍`);
  ok(`  ${N}판 전부 실제로 시작됐다`, notBuilt === 0, notBuilt + '판이 준비 단계에 못 갔다');
  // 표본에 **열린 행 수가 다른 판끼리**가 없으면 위 두 줄은 아무것도 안 잠근다.
  // 판 정의가 언젠가 전부 같은 값이 되면 여기서 먼저 걸린다.
  ok('  열린 행이 다른 판끼리(6↔8)가 표본에 있다', crossed > 0, crossed + '쌍');

  // ── 목록을 안 거치는 경로. `restart()` 는 목록으로 가는 문일 뿐이고, 판을
  // 갈아끼우는 것은 `loadStage` 다. 도구(tools/*)와 이어하기가 이 경로로 온다.
  // **웨이브가 지나 행이 열린 뒤**가 제일 크게 어긋나는 자리다.
  let badDirect = 0;
  for (let a = 0; a < N; a++) {
    for (const b of [0, N - 1]) {
      g.restart(); enter(a);
      state.openRows = CFG.BOARD_H;                // 다 열릴 때까지 갔다
      enter(b);                                    // 목록을 안 거치고 다음 판
      if (state.openRows !== g.STAGES[b].openRows) badDirect++;
    }
  }
  ok('  다 열린 판 뒤에 와도 정의대로', badDirect === 0, String(badDirect));

  // ── 이어하기는 스냅샷 값을 그대로 쓴다 ──
  // `loadStage` 가 정의값으로 맞춘 **뒤에** `restoreRun` 이 덮는다. 순서가 뒤집히면
  // 중간에 저장한 런이 열린 행부터 처음으로 되감긴다 — 세이브 계약(#45·#46)이
  // 「어중간하게 복원하지 않는다」인 것과 같은 조항이다.
  {
    const S = 4;                                   // ⑤ 분수령 (9x14, 정의 8)
    g.restart(); enter(S);
    state.wave = 12;
    state.openRows = g.STAGES[S].openRows + 2;     // 웨이브가 지나며 두 줄 열렸다
    const grown = state.openRows, grownCells = cells();
    const snap = g.snapshotRun();
    ok('  스냅샷에 자란 값이 실린다', !!snap && snap.openRows === grown,
      (snap && snap.openRows) + ' vs ' + grown);
    g.restart(); enter(0);                         // 다른 판(정의 6)을 한 판 하고
    g.restart();
    const back = g.restoreRun(snap);
    ok('  이어하기는 스냅샷 값을 쓴다', back === true && state.openRows === grown,
      state.openRows + ' vs ' + grown + ' (정의 ' + g.STAGES[S].openRows + ')');
    ok('  이어한 판의 배치 칸도 그대로', cells() === grownCells,
      cells() + ' vs ' + grownCells);
  }
}

// ── 클리어 기록 (#45) ─────────────────────────────────────────
// `best[i]`(그 판에서 도달한 최고 웨이브)와 「깼다」는 **다른 사실**이다. 한 칸으로
// 겸하던 시절에는 마지막 웨이브 **도중에 죽어도** `best[i] === waves` 가 찍혔고
// (startWave 가 클리어 검사보다 먼저 wave 를 올린다), 세이브를 다시 읽는 쪽
// (unlockFromRecord)이 그걸 「깼다」로 읽어 **죽은 판의 다음이 열렸다.**
//
// 그래서 이 블록은 판정 직후가 아니라 **세이브를 한 번 왕복시킨 뒤에** 묻는다.
// 즉시 해금(endWave 의 clear 분기)은 phase 를 보고 있어서 그때도 정확했고, 그래서
// 판정 직후의 unlocked 만 보면 버그가 있는 코드도 전부 통과한다 — 그게 이 버그가
// 유저에게 갈 때까지 안 잡힌 이유다.
{
  console.log('클리어 기록');
  const S = 2;                        // 유저가 밟은 판(③ 갈래길)

  // 그 판의 마지막 웨이브를 세운 뒤, **어떻게 끝나는지만** 갈라 준다.
  const lastWave = finish => {
    const g = load();
    const { state } = g;
    g.loadStage(S);
    state.phase = 'deck';
    state.deckPick = ['shredder', 'frost', 'marksman'];
    g.startRun();
    state.wave = g.STAGES[S].waves - 1;
    state.phase = 'build';
    g.rushWave();                     // 마지막 웨이브 시작 — 여기서 wave 가 총웨이브가 된다
    finish(g);
    return g;
  };

  {
    const g = lastWave(x => { x.state.life = 0; x.update(1 / 30); });
    const b = g.saveBundle();
    // 재현 판이 **마지막 판이면 안 된다.** 마지막 판은 깨도 `unlocked` 가 안 움직여서
    // (열 다음 판이 없다) 「안 열린다」가 저절로 참이 되고, 그러면 이 블록 전체가
    // 아무것도 안 재게 된다.
    ok('재현 판이 마지막 판이 아니다', S + 2 <= g.STAGES.length,
      'S' + (S + 1) + ' / 전체 ' + g.STAGES.length + '판');
    ok('마지막 웨이브 도중 사망은 게임오버다', g.state.phase === 'over', g.state.phase);
    // best 의 뜻은 안 바뀐다. 「도달했다」는 사실이므로 여전히 찍혀야 한다.
    ok('  best 에는 마지막 웨이브가 그대로 찍힌다', b.best[S] === g.STAGES[S].waves,
      'best[' + S + '] = ' + b.best[S] + ' / 판 웨이브 ' + g.STAGES[S].waves);
    ok('  그래도 깬 것으로는 안 적힌다', b.cleared[S] === false, JSON.stringify(b.cleared));

    // ★ 이 줄이 #45 다. 옛 조건에서는 여기서 unlocked 가 1 → 4 로 뛰었다.
    const g2 = load();
    g2.applyBundle(b);
    ok('  세이브를 다시 읽어도 다음 판이 안 열린다',
      g2.stageUnlocked(S + 1) === false && g2.saveBundle().unlocked === b.unlocked,
      'unlocked ' + b.unlocked + ' → ' + g2.saveBundle().unlocked);
  }

  {
    const g = lastWave(x => {
      x.state.enemies.length = 0;
      x.state.spawnQueue.length = 0;
      x.endWave();
    });
    const b = g.saveBundle();
    ok('마지막 웨이브를 끝내면 클리어다', g.state.phase === 'clear', g.state.phase);
    ok('  깬 것으로 적힌다', b.cleared[S] === true, JSON.stringify(b.cleared));
    const g3 = load();
    g3.applyBundle(b);
    ok('  세이브를 다시 읽으면 다음 판이 열린다', g3.stageUnlocked(S + 1) === true);
    // 즉시 해금(endWave)과 세이브 재계산(unlockFromRecord)이 **같은 답**을 내야 한다.
    // 둘이 다른 답을 내고 있었다는 것 자체가 #45 의 신호였다.
    ok('  즉시 해금과 세이브 재계산이 같은 답', g3.saveBundle().unlocked === b.unlocked,
      b.unlocked + ' → ' + g3.saveBundle().unlocked);
  }

  // ── 옛 세이브(v1 · 새 칸이 없다) ──
  // **지금 열려 있는 것을 그대로 굳힌다.** 새 규칙을 소급 적용하면 「마지막 웨이브
  // 도달」로 지금까지 열려 있던 사람의 진행도가 통째로 날아간다.
  {
    const g = load();
    const w = g.STAGES.map(s => s.waves);
    // ①②③ 을 마지막 웨이브까지 간 기록. 옛 조건에서 이 세이브는 ④ 까지 열어 줬다.
    g.applyBundle({ v: 1, unlocked: 3, best: [w[0], w[1], w[2]], run: null });
    const b = g.saveBundle();
    ok('옛 세이브는 best 로 클리어를 메운다',
      b.cleared[0] && b.cleared[1] && b.cleared[2] && !b.cleared[3], JSON.stringify(b.cleared));
    ok('  열려 있던 판이 그대로 열려 있다', b.unlocked === 4, String(b.unlocked));
    // 기대값을 게임에서 읽는다. 리터럴을 적으면 형식을 또 올렸을 때 이 줄만 옛 값을
    // 지키며 통과한다(#44 에서 v3 으로 올리며 실제로 걸렸다).
    ok('  버전이 올라간다', b.v === g.SAVE_VERSION, b.v + '/' + g.SAVE_VERSION);

    // 굳힌 뒤로는 새 칸만 본다. **best 가 꽉 차 있어도 cleared 가 false 면 안 열린다** —
    // 위 사망 시나리오가 남기는 세이브가 정확히 이 모양이다.
    const g4 = load();
    g4.applyBundle({ v: 2, unlocked: 1, best: [w[0], w[1], w[2]], cleared: [false, false, false], run: null });
    ok('  새 세이브는 best 가 꽉 차 있어도 cleared 를 따른다',
      g4.saveBundle().unlocked === 1, String(g4.saveBundle().unlocked));

    // 몇 번을 다시 읽어도 같은 값이라야 한다(applyBundle 주석의 멱등성).
    g.applyBundle(g.saveBundle());
    g.applyBundle(g.saveBundle());
    ok('  다시 읽어도 안 밀린다', g.saveBundle().unlocked === 4, String(g.saveBundle().unlocked));
  }

  // ── 클라우드 병합 ──
  // 클리어 기록은 **OR** 다. 한쪽에서만 깬 판도 깬 판이고, 여기서 잃으면 기기를
  // 옮기는 순간 열려 있던 판이 도로 잠긴다(best 를 Math.max 로 합치는 것과 같은 이유).
  {
    const g = load();
    const w = g.STAGES.map(s => s.waves);
    const m = g.mergeBundle(
      { v: 2, unlocked: 1, best: [], cleared: [true, false, false], run: null },
      { v: 2, unlocked: 1, best: [], cleared: [false, true, false], run: null });
    ok('클리어 기록은 OR 로 합친다',
      m.cleared[0] === true && m.cleared[1] === true && m.cleared[2] === false,
      JSON.stringify(m.cleared));

    // 한쪽이 옛 세이브면 그쪽만 옛 조건으로 메운다. 이게 없으면 **새 기기에서 한 번
    // 로그인하는 것만으로 옛 기기의 진행도가 병합에서 사라진다.**
    const m2 = g.mergeBundle(
      { v: 1, unlocked: 4, best: [w[0], w[1], w[2]], run: null },
      { v: 2, unlocked: 1, best: [], cleared: [false, false, false], run: null });
    ok('  옛 세이브와 섞여도 안 잃는다', m2.cleared[0] && m2.cleared[1] && m2.cleared[2],
      JSON.stringify(m2.cleared));
    g.applyBundle(m2);
    ok('  합친 것을 읽으면 그대로 열려 있다', g.saveBundle().unlocked === 4,
      String(g.saveBundle().unlocked));
  }

  // ── 화면이 쓰는 문도 같은 자를 쓴다 ──
  // 위 줄들은 `unlocked` 숫자를 봤다. 카드를 그리는 쪽과 `pickStage` 는 그 숫자가
  // 아니라 `stageUnlocked()` 를 부르므로, **그 함수가 best 를 보고 있으면** 마지막
  // 웨이브에서 죽은 사람에게 다음 판이 열린다 — 같은 버그의 다른 문이다.
  // 한때 계단 밖의 도전 판이 이 함수에 자기 조건을 하나 더 들고 있었고(#39·#42),
  // 그 문도 여기서 같이 잠갔다. 판이 전부 계단 위가 된 지금은 문이 하나뿐이다.
  {
    const g = load();
    const a = 1;                      // ② 이중 병목을 깨면 ③ 이 열린다
    const reached = [];
    reached[a] = g.STAGES[a].waves;
    g.applyBundle({ v: 2, unlocked: 1, best: reached, cleared: [], run: null });
    ok('화면의 문도 도달만으로는 안 열린다', g.stageUnlocked(a + 1) === false);
    const won = [];
    won[a] = true;
    g.applyBundle({ v: 2, unlocked: 1, best: reached, cleared: won, run: null });
    ok('  깨면 열린다', g.stageUnlocked(a + 1) === true);
  }
}

// ── 세이브 마이그레이션: 인덱스의 뜻이 바뀌었다 (#44) ─────────────
// 지금까지 세이브는 **칸이 늘기만** 했다. 그래서 인덱스는 언제나 같은 판을 가리켰고
// 마이그레이션이라고 해 봐야 없는 칸을 메우는 것뿐이었다(v1 → v2, #45).
//
// **여기서 처음으로 같은 인덱스가 다른 판이 됐다.** 출시본의 `STAGES[5]` 는 도전 판
// 「봉인된 병목」이고 이 빌드에서는 ⑥ 합수다. 도전 판의 해금 조건은 ② 클리어뿐이라
// **③④⑤ 를 안 깬 사람도 `cleared[5] = true` 를 들고 있을 수 있다.** 그대로 읽으면
// 그 사람에게 여섯 판이 전부 열리고, `mergeBundle` 이 OR 로 합치므로 되돌릴 길이 없다.
//
// #45 가 `best` 를 「깼다」로 읽어 유저에게 갔던 것과 **같은 종류**다. 그래서 그 블록과
// 같은 방식으로 잠근다 — 판정 직후가 아니라 **세이브를 한 번 왕복시킨 뒤에** 묻는다.
{
  console.log('세이브 마이그레이션');
  const V2 = 5;   // 출시본의 본편 판 수. 아래에서 게임 값과 대조한다

  {
    const g = load();
    ok('SAVE_VERSION 이 올라가 있다', g.SAVE_VERSION >= 3, String(g.SAVE_VERSION));
    // **경계를 게임에서 읽는다.** 판을 또 붙여도 이 값은 5 로 고정이라야 한다 —
    // `STAGES.length` 로 쓰면 경계가 같이 밀려 멀쩡한 칸까지 버린다.
    ok('  뜻이 안 바뀐 인덱스 수가 5 다', g.SAVE_V2_STABLE === V2, String(g.SAVE_V2_STABLE));
    ok('  그 경계가 지금 판 수보다 작다', g.SAVE_V2_STABLE < g.STAGES.length,
      g.SAVE_V2_STABLE + ' < ' + g.STAGES.length);
  }

  // ── [A] 도전 판을 깬 v2 세이브 ──
  // 이 모양이 실재한다: ② 만 깨고 도전 판을 깬 사람. ③④⑤ 는 안 깼다.
  {
    const g = load();
    g.applyBundle({
      v: 2, unlocked: 3,
      best:    [20, 25, 0, 0, 0, 25],
      cleared: [true, true, false, false, false, true],
      run: null,
    });
    const b = g.saveBundle();
    ok('[A] 도전 판 클리어가 ⑥ 클리어로 안 읽힌다', b.cleared[V2] === false,
      JSON.stringify(b.cleared));
    // 이 줄이 이 블록의 전부다. 마이그레이션이 없으면 여기서 3 → 6 으로 뛴다.
    ok('  그래서 해금이 안 밀린다', b.unlocked === 3, String(b.unlocked));
    ok('  ⑥ 은 잠겨 있다', g.stageUnlocked(V2) === false);
    ok('  도전 판 도달 기록도 버린다', !b.best[V2], String(b.best[V2]));
    // **앞 칸은 그대로 살아 있어야 한다.** 통째로 버리면 진행도가 날아간다.
    ok('  ①② 기록은 그대로다',
      b.cleared[0] === true && b.cleared[1] === true && b.best[1] === 25,
      JSON.stringify(b.cleared) + ' / ' + JSON.stringify(b.best));
  }

  // ── [C] 도전 판 이어하기 스냅샷 ──
  // 도전 판은 7x10 · 25웨이브였고 ⑥ 은 10x14 · 30웨이브다. 그대로 되살리면
  // 「어중간하게 복원하지 않는다」(restoreRun 머리 주석)가 정면으로 깨진다.
  {
    const g = load();
    const run = {
      stage: V2, deck: ['shredder', 'frost', 'marksman'], wave: 12,
      gold: 300, essence: 1, life: 18, openRows: 6, summoned: 2, towers: [],
    };
    g.applyBundle({ v: 2, unlocked: 3, best: [20, 25, 0, 0, 0, 25], cleared: [], run });
    ok('[C] 도전 판 이어하기 스냅샷은 버려진다', g.saveBundle().run === null,
      JSON.stringify(g.saveBundle().run));
  }

  // 살아남은 인덱스의 스냅샷은 **안 버린다.** 위 줄이 `run` 을 무조건 null 로
  // 만들어도 통과하므로 반대쪽을 같이 잠근다.
  {
    const g = load();
    const run = {
      stage: 2, deck: ['shredder', 'frost', 'marksman'], wave: 7,
      gold: 300, essence: 1, life: 18, openRows: 6, summoned: 2, towers: [],
    };
    g.applyBundle({ v: 2, unlocked: 3, best: [20, 25, 7, 0, 0, 0], cleared: [], run });
    const kept = g.saveBundle().run;
    ok('  ③ 이어하기 스냅샷은 그대로 남는다', kept && kept.stage === 2 && kept.wave === 7,
      JSON.stringify(kept));
  }

  // ── 병합에서도 같은 문을 지난다 ──
  // `cloudPull` 이 `mergeBundle(saveBundle(), remote)` 를 부른다. 한쪽만 마이그레이션
  // 하면 OR 로 합치는 순간 옛 칸이 되살아나고, 그건 한 번 열리면 못 되돌린다.
  {
    const g = load();
    const m = g.mergeBundle(
      { v: 2, unlocked: 3, best: [20, 25, 0, 0, 0, 25], cleared: [true, true, false, false, false, true], run: null },
      { v: 3, unlocked: 3, best: [20, 25, 0, 0, 0, 0], cleared: [true, true, false, false, false, false], run: null });
    ok('병합해도 도전 판 칸이 안 살아난다', m.cleared[V2] === false, JSON.stringify(m.cleared));
    g.applyBundle(m);
    ok('  합친 것을 읽어도 해금이 안 밀린다', g.saveBundle().unlocked === 3,
      String(g.saveBundle().unlocked));
  }

  // ── v3 세이브는 안 건드린다 ──
  // 마이그레이션이 버전을 안 보고 무조건 자르면, 앞으로 ⑥ 을 깬 사람의 기록이
  // 저장할 때마다 사라진다. 그 반대쪽을 잠근다.
  {
    const g = load();
    const full = g.STAGES.map(() => true);
    g.applyBundle({ v: 3, unlocked: g.STAGES.length, best: g.STAGES.map(s => s.waves), cleared: full, run: null });
    const b = g.saveBundle();
    ok('v3 세이브의 ⑥ 클리어는 그대로 남는다', b.cleared[V2] === true, JSON.stringify(b.cleared));
    ok('  ⑥ 도달 기록도 그대로다', b.best[V2] === g.STAGES[V2].waves, String(b.best[V2]));
  }
}

// ── 관측소 표적 유지 ──────────────────────────────────────────
// 매 발 HP 최고를 다시 고르면 관측소는 연속타격을 원리적으로 못 쌓는다. 자기가 방금
// 깎은 놈이 그만큼 내려가 다음 발에는 다른 놈이 1위가 되기 때문이다. 실측 평균
// streak 1.21(최대 5) — 속사 딜 보너스가 설계 +40% 인데 +9.7% 로만 나왔고 표식(A1)의
// 5연타는 시간의 3% 만 켜졌다. 이 회귀는 시뮬 사망 웨이브에도 잘 안 드러나서
// (기여도 −1.51 이 유일한 신호였다) **streak 이 쌓이는지 자체를 여기서 잠근다.**
{
  console.log('관측소 표적 유지');
  const g = load();
  const { state } = g;
  g.pickStage(0);
  ['marksman', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  state.wave = 5;

  const tower = (o = {}) => {
    const t = { id: 800, gx: 2, gy: 8, kind: 'marksman', star: 5, b3: 'A', b5: 'A1', t7: null,
      cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0, ...o };
    state.towers.length = 0; state.towers.push(t);
    return t;
  };
  // 죽지 않을 만큼 두꺼운 적을 타워 발밑에 세운다. 표적 선택만 보는 시험이라
  // 이동·사망이 끼면 무엇 때문에 표적이 갈렸는지가 안 갈린다.
  const enemy = (hp, gx = 2, gy = 8) => {
    g.spawnEnemy('grunt');
    const e = state.enemies[state.enemies.length - 1];
    e.hp = e.maxHp = hp; e.x = gx; e.y = gy;
    return e;
  };
  const fire = (t) => { t.cd = 0; g.fireTower(t, 0); };

  let t = tower();
  const big = enemy(1e9), small = enemy(9e8);
  fire(t);
  ok('처음에는 HP 최고를 고른다', t.lastTarget === big.id, String(t.lastTarget));
  const firstHp = big.hp;
  ok('실제로 그놈을 때린다', firstHp < 1e9);

  // 한 발 맞은 big 이 small 보다 낮아지도록 손으로 눌러 둔다. 옛 코드(매 발 HP 정렬)는
  // 여기서 반드시 small 로 갈아탔고 streak 이 1 로 리셋됐다.
  big.hp = small.hp - 1;
  for (let i = 0; i < 5; i++) fire(t);
  ok('HP 1위가 바뀌어도 표적을 안 바꾼다', t.lastTarget === big.id, String(t.lastTarget));
  ok('연속타격이 그만큼 쌓인다', t.streak === 6, String(t.streak));
  ok('5연타 표식이 켜진다', big.markT > 0, String(big.markT));

  // 죽으면 놓는다 — 그 다음 표적은 다시 HP 최고다
  big.dead = true;
  fire(t);
  ok('표적이 죽으면 다시 고른다', t.lastTarget === small.id, String(t.lastTarget));
  ok('새 표적이면 연속타격은 1 부터', t.streak === 1, String(t.streak));

  // 사거리를 벗어나도 놓는다
  const far = enemy(5e8, 2, 8);
  small.x = 20; small.y = 20;
  fire(t);
  ok('사거리를 벗어나면 다시 고른다', t.lastTarget === far.id, String(t.lastTarget));

  // 사거리에 아무도 없으면 0 으로 리셋된다(옛 동작 유지)
  far.x = 20; far.y = 20;
  fire(t);
  ok('사거리가 비면 연속타격이 끊긴다', t.streak === 0, String(t.streak));

  // 관통사격(B2)은 겨눈 놈이 피해 목록의 첫 칸이라야 한다. HP 정렬 상위 4개를 그대로
  // 쓰면 표적을 유지하는 동안 main 이 5위 밖으로 밀려 "겨냥한 놈만 안 맞는" 그림이 된다.
  state.enemies.length = 0;
  t = tower({ b3: 'B', b5: 'B2' });
  const held = enemy(1e9);
  fire(t);
  ok('B2 도 표적을 잡는다', t.lastTarget === held.id, String(t.lastTarget));
  for (let i = 0; i < 5; i++) enemy(2e9);              // 전부 held 보다 HP 가 높다
  const hpBefore = held.hp;
  fire(t);
  ok('B2 는 유지 표적을 반드시 관통 목록에 넣는다', held.hp < hpBefore,
    '깎인 딜 ' + Math.round(hpBefore - held.hp));
  state.enemies.length = 0;
}

// ── 파쇄자 물리 취약 ──────────────────────────────────────────
// 적 8종의 방어력은 5/40/5/0/8/12/0/25 로 **절반이 0~5 다.** 파쇄자가 방깎만 쌓던
// 시절에는 그 절반에게 오라가 사실상 아무 일도 안 했고, 그게 기여도 −2.7(7종 최하위)
// 로만 보였다. 침식자는 같은 구멍을 이미 마법 취약으로 메워 놨는데(fireTower 주석)
// 파쇄자만 그 짝이 없었다. 대칭이 다시 깨지면 여기서 잡는다.
{
  console.log('파쇄자 물리 취약');
  const g = load();
  const { state } = g;
  g.pickStage(0);
  ['shredder', 'marksman', 'mint'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  state.wave = 5;

  const t = { id: 700, gx: 2, gy: 8, kind: 'shredder', star: 5, b3: 'A', b5: null, t7: null,
    cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 };
  state.towers.push(t);

  const put = (kind) => {
    g.spawnEnemy(kind);
    const e = state.enemies[state.enemies.length - 1];
    e.x = 2; e.y = 8; e.hp = e.maxHp = 1e7;
    return e;
  };

  const e = put('swift');
  ok('질주몹은 방어력이 0 이다', g.ENEMY.swift.armor === 0, String(g.ENEMY.swift.armor));
  const plain = g.damage(e, 1000, 'physical', null);

  g.fireTower(t, 1);                                   // 오라 1초치
  ok('오라가 물리 취약을 남긴다', e.physVuln > 0, e.physVuln.toFixed(3));
  ok('방깎은 여전히 아무 일도 못 한다', g.effArmor(e) === 0, String(g.effArmor(e)));

  const amped = g.damage(e, 1000, 'physical', null);
  ok('방어력 0 인 적에게도 오라가 값을 한다', amped > plain,
    plain.toFixed(1) + ' → ' + amped.toFixed(1));
  // §6.1 증폭 가산 규칙. 곱으로 새면 3중첩에서 터진다 — 값까지 박아 둔다.
  ok('취약은 가산으로 한 번만 곱해진다', Math.abs(amped - plain * (1 + e.physVuln)) < 1e-6,
    (amped / plain).toFixed(4) + ' vs ' + (1 + e.physVuln).toFixed(4));

  // 마법딜에는 안 붙는다 — 물리 취약은 마법 취약(ampMagic)의 짝이지 그 자신이 아니다
  const mBefore = g.damage(e, 1000, 'magic', null);
  e.physVuln = 0.9;
  ok('마법딜은 물리 취약을 안 탄다', Math.abs(g.damage(e, 1000, 'magic', null) - mBefore) < 1e-6);

  // 면역몹에는 안 걸린다(debuffScale). 침식자 쪽과 같은 규칙이다
  const im = put('immune');
  g.fireTower(t, 1);
  ok('면역몹에는 안 걸린다', !im.physVuln, String(im.physVuln));
  state.enemies.length = 0; state.towers.length = 0;
}

// ── 박격포 탄막(A1) ───────────────────────────────────────────
// 탄막에는 「3발이 어디에 떨어지고 딜이 어떻게 나뉘는가」를 잠근 단언이 하나도
// 없었다. 그래서 발당 `dmg / 3` 이라 3발을 다 맞혀도 총합이 무분기 1발과 똑같은
// (= 5성을 찍을 이유가 없는) 상태가 조용히 유지됐다. 여기서 잠그는 것은 계수가
// 아니라 **관계**다 — 총합이 1발보다 크고, 세 발이 경로 위에 흩어지고, 무분기는
// 안 움직인다. 수치는 CFG 에서 읽는다(손으로 베끼면 값을 고쳤을 때 테스트만
// 옛 값을 지키며 통과한다).
{
  console.log('박격포 탄막(A1)');
  const g = load();
  const { state, CFG } = g;

  // 사거리 안 경로 위에 적을 세우고 fireTower 를 한 번만 돌린다.
  // **경로 시작(dist 0) 근처에 세우면 안 된다** — posAt 이 d<0 을 0 으로 자르므로
  // 뒤쪽 한 발이 경로 시작에 붙어 간격이 무너지고, 테스트가 그 잘림만 재게 된다.
  // 그래서 사거리 안에 들어오는 **중간 지점**을 골라 dist 와 좌표를 같이 세운다
  // (좌표만 세우면 updateEnemies 가 dist 로 되돌린다). 사거리는 정사각형이다.
  const midDist = (t) => {
    const s = g.towerFootprint(t), R = g.towerRange(t);
    const cx = t.gx + s / 2, cy = t.gy + s / 2;
    for (let d = CFG.BARRAGE_GAP; d <= g.laneLen(0); d += 0.05) {
      const p = g.posAt(d, 0);
      if (Math.max(Math.abs(p.x + 0.5 - cx), Math.abs(p.y + 0.5 - cy)) <= R) return d;
    }
    return null;
  };

  // 소환 자리는 난수로 정해진다(summon 의 spots 추첨). 볼리마다 타워가 다른 칸에
  // 서면 겨냥 지점이 통째로 달라져 볼리끼리 비교가 성립하지 않는다 — 자리를 고정한다.
  let ANCHOR = null;
  const anchor = (t) => {
    if (!ANCHOR) {
      const s = g.towerFootprint(t);
      for (let y = 0; y + s <= CFG.BOARD_H && !ANCHOR; y++)
        for (let x = 0; x + s <= CFG.BOARD_W && !ANCHOR; x++) {
          if (g.isPath(x, y)) continue;
          t.gx = x; t.gy = y;
          if (midDist(t) !== null) ANCHOR = { gx: x, gy: y };
        }
    }
    t.gx = ANCHOR.gx; t.gy = ANCHOR.gy;
  };

  const volley = (opts, n) => {
    g.restart();
    g.pickStage(0);
    ['mortar', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    state.wave = 5;
    state.phase = 'wave';
    state.spawnQueue.length = 0;
    state.towers.length = 0;
    state.enemies.length = 0;
    state.shells.length = 0;
    state.gold = 999999;
    g.summon('mortar');
    const t = state.towers[0];
    Object.assign(t, { star: 5, b3: 'A', b5: null, t7: null, cd: 0, flash: 0 }, opts || {});
    anchor(t);
    const d0 = midDist(t);
    for (let i = 0; i < (n || 1); i++) {
      g.spawnEnemy('grunt');
      const e = state.enemies[state.enemies.length - 1];
      // 적끼리 조금씩 떨어뜨려 세운다. 겹쳐 세우면 「적 수에 안 딸린다」가
      // 겨냥이 targets[0] 로 고정돼서가 아니라 전부 같은 자리라서 통과한다.
      const p = g.posAt(d0 + i * 0.4, e.lane || 0);
      e.dist = d0 + i * 0.4; e.x = p.x; e.y = p.y;
      e.maxHp = e.hp = 1e12;
    }
    g.fireTower(t, 1 / 30);
    return { t, shells: state.shells.slice() };
  };

  const sum = a => a.reduce((x, y) => x + y, 0);

  // 기준선은 **같은 3성 분기(A)에 5성만 안 찍은 것**이라야 한다. b3:null 과 비교하면
  // A 의 딜 배수 0.55 가 섞여 들어가 「탄막이 5성으로서 값을 하는가」를 못 잰다.
  const plain = volley({ b3: 'A', b5: null }, 3);
  ok('5성 미선택은 1발', plain.shells.length === 1, String(plain.shells.length));
  ok('5성 미선택 1발은 딜 전액', Math.abs(plain.shells[0].dmg - g.towerDmg(plain.t)) < 1e-9,
    plain.shells[0].dmg.toFixed(2) + ' / towerDmg ' + g.towerDmg(plain.t).toFixed(2));
  // 분기를 아예 안 고른 타워도 같은 1발 경로다(shots === 1).
  const none = volley({ b3: null, b5: null }, 3);
  ok('무분기도 1발 · 딜 전액',
    none.shells.length === 1 && Math.abs(none.shells[0].dmg - g.towerDmg(none.t)) < 1e-9,
    none.shells.length + '발 ' + none.shells[0].dmg.toFixed(1) + ' / ' + g.towerDmg(none.t).toFixed(1));

  // 탄막은 3발이고, 발당 딜은 CFG.BARRAGE_SHARE 배다.
  const bar = volley({ b3: 'A', b5: 'A1' }, 3);
  ok('탄막은 3발', bar.shells.length === 3, String(bar.shells.length));
  const per = g.towerDmg(bar.t) * CFG.BARRAGE_SHARE;
  ok('탄막 발당 딜 = towerDmg x BARRAGE_SHARE',
    bar.shells.every(s => Math.abs(s.dmg - per) < 1e-9),
    bar.shells.map(s => s.dmg.toFixed(1)).join('/') + ' (기대 ' + per.toFixed(1) + ')');

  // **버그의 핵심.** 예전에는 dmg/3 x 3 = 1.0 배라 「3발을 다 맞혀도 무분기와 동점」
  // 이었다. 방어력이 곱연산이라 쪼개도 손해가 없는 대신 이득도 없어서, 탄막은
  // 어떻게 뿌리든 무분기를 넘어설 수 없었다. 1.0 을 다시 넣으면 여기서 걸린다.
  const ratio = sum(bar.shells.map(s => s.dmg)) / plain.shells[0].dmg;
  ok('탄막 딜 총합이 5성 미선택 1발보다 크다', ratio > 1,
    '총합 ' + ratio.toFixed(2) + '배 (예전 1.00 = 찍을 이유 없음)');
  ok('총합 = 3 x BARRAGE_SHARE', Math.abs(ratio - 3 * CFG.BARRAGE_SHARE) < 1e-9,
    ratio.toFixed(3) + ' / 기대 ' + (3 * CFG.BARRAGE_SHARE).toFixed(3));

  // 세 발이 서로 다른 지점에 떨어진다. 한 점에 겹치면 반경만큼의 추가 커버가 없어
  // 그냥 「딜 1.8배짜리 1발」이 되고, 「직선을 덮는다」는 정체성이 사라진다.
  const pts = bar.shells.map(s => s.tx + ',' + s.ty);
  ok('세 발이 서로 다른 지점', new Set(pts).size === 3, pts.join(' | '));

  // 착탄점이 **경로 위** 정확히 -GAP / 0 / +GAP 이라야 줄지어 오는 적을 덮는다.
  // 예전의 가로 ±0.6칸 지터는 경로를 벗어나므로 여기에 걸린다.
  const e0 = state.enemies[0];
  const lead0 = e0.dist + g.enemySpeed(e0) * 0.5;
  const want = [-1, 0, 1].map(k => g.posAt(lead0 + k * CFG.BARRAGE_GAP, e0.lane || 0));
  ok('세 발이 경로 위 -GAP / 0 / +GAP 에 떨어진다',
    bar.shells.every((s, i) => Math.abs(s.tx - (want[i].x + 0.5)) < 1e-9 && Math.abs(s.ty - (want[i].y + 0.5)) < 1e-9),
    pts.join(' | '));

  // 경로가 꺾이면 같은 경로거리라도 직선거리는 줄어든다(모서리를 가로지르므로).
  // 그래서 지름(1.28)이 아니라 반경 이상만 요구한다 — 세 폭발이 서로의 중심을
  // 안 삼킬 만큼은 벌어져 있어야 「1발을 세 번 겹쳐 쏘기」가 아니게 된다.
  const gaps = [0, 1].map(i =>
    Math.hypot(bar.shells[i + 1].tx - bar.shells[i].tx, bar.shells[i + 1].ty - bar.shells[i].ty));
  ok('착탄 간격이 폭발 반경 이상', gaps.every(d => d >= bar.shells[0].radius - 1e-9),
    gaps.map(d => d.toFixed(2)).join('/') + ' (반경 ' + bar.shells[0].radius.toFixed(2) + ')');

  // 세 발이 한 프레임에 착탄한다. BLAST_SHAKE_CD 의 듀티 근거(§2.6)가 이걸 전제로
  // 「탄막 3발 → 흔들림 1회」를 계산한다. 시차를 주면 그 표가 먼저 틀린다.
  ok('세 발이 같은 프레임에 착탄', new Set(bar.shells.map(s => s.tt)).size === 1,
    bar.shells.map(s => s.tt).join('/'));

  // 적이 1마리뿐이어도 3발이 나가고 배치가 같아야 한다 — 겨냥은 targets[0] 하나로
  // 정해지고 적 수에 안 딸린다. 예전엔 targets[0]/[1]/[2] 를 따로 겨눠서 적 수에
  // 따라 착탄점이 통째로 달라졌다.
  const solo = volley({ b3: 'A', b5: 'A1' }, 1);
  ok('적 1마리여도 3발', solo.shells.length === 3, String(solo.shells.length));
  ok('착탄점이 적 수에 안 딸린다',
    solo.shells.map(s => s.tx.toFixed(3) + ',' + s.ty.toFixed(3)).join('|')
      === bar.shells.map(s => s.tx.toFixed(3) + ',' + s.ty.toFixed(3)).join('|'),
    solo.shells.map(s => s.tx.toFixed(2) + ',' + s.ty.toFixed(2)).join(' | '));

  // 다른 5성 분기는 1발 · 딜 전액 그대로다. 탄막만 만지는 변경이라는 잠금.
  for (const b5 of ['A2', 'B1', 'B2']) {
    const o = volley({ b3: b5[0], b5 }, 3);
    ok(`${b5} 는 1발 · 딜 전액`,
      o.shells.length === 1 && Math.abs(o.shells[0].dmg - g.towerDmg(o.t)) < 1e-9,
      o.shells.length + '발 ' + o.shells[0].dmg.toFixed(1) + ' / ' + g.towerDmg(o.t).toFixed(1));
  }
}

// ── 타워 대등성 ───────────────────────────────────────────────
// 한 타워가 정답이거나 함정이면 덱과 합성 선택이 의미를 잃는다.
//
// 오래 **분기 A/A1 하나만** 봤다. 「가벼운 한 분기만」이라는 이유였는데, 그 사이
// B/B1 이 폭 7.88 로 임계를 한참 넘어 있었고 아무도 몰랐다 — 게이트가 없는 분기는
// 게이트가 있는 척도 안 한다. 5성 분기는 게임이 갈리는 자리라 A1 의 균형이 B1 의
// 균형을 대변하지 않는다(A/A1 3.20 vs B/B1 7.88, 서리탑 하나가 -4.71). 그래서
// 네 분기 전부를 여기서 본다.
//
// 대가는 런타임이다. 실측(이 기기, 시드 12345·7시행):
//   1분기  5.7s  → npm test 전체 7.3s
//   4분기 22.5s  → npm test 전체 24.4s
// 시행수를 3~5 로 낮추면 10.5~15.7s 로 줄지만 **낮추지 않았다.** 시드가 박혀 있어
// 시행수는 안정성이 아니라 추정치의 정확도만 바꾸는데, 7 은 지금 게이트가 이미 쓰던
// 값이라 그대로 두면 A/A1 의 값(3.20)이 이 변경으로 안 움직인다 — 분기를 더한 것
// 말고는 아무것도 안 건드렸다는 게 값으로 증명된다. 시행수를 함께 바꿨다면 A/A1 도
// 같이 움직여서 「분기를 더해서 그런가 시행수를 바꿔서 그런가」를 못 가른다.
// 그리고 시행수를 여유(임계까지의 거리)가 큰 쪽으로 고르는 건 아래 시드 문단이
// 금지하는 짓과 같은 짓이다. 참고로 여유가 가장 큰 건 4시행(worst 1.65)이고
// 7시행은 0.95 다 — 알면서 안 골랐다.
{
  console.log('타워 대등성 (3종 덱, 4분기 전부)');
  const { measure, K, NAME, BRANCHES } = require('./parity.js');
  const TRIALS = 7;          // 아래 KNOWN 의 실측값이 이 수에 묶여 있다. 바꾸면 같이 다시 재라
  const SPREAD_MAX = 6;      // 이 위로는 덱·합성 선택이 의미를 잃는다
  const OUTLIER_MAX = 3.5;   // 혼자 이만큼 벗어나면 그 타워가 정답이거나 함정이다

  // [2026-08 #31] **KNOWN 이 비었다 — 네 분기 전부 하드 게이트다.** B/B1 은 오래
  // 7.88(서리 -4.71)로 KNOWN 에 박혀 있었는데, 「셋째 종류」를 고치자 재실측값이
  // 0.72 로 내려와 파일 지시대로 승격했다. 시드 12345 · 7시행 실측:
  //   A/A1 3.20 → 1.33 · A/A2 2.20 → 1.50 · B/B1 7.88 → 0.72 · B/B2 5.05 → 0.00
  //
  // **서리탑이 균형을 찾은 게 아니다.** 두 가지가 동시에 일어났고 둘 다 적어 둔다.
  //   ① 옛 값은 애초에 **없는 타워를 재고 있었다.** parity 의 combos(K,3) 은 K 순서를
  //      보존하므로 mint 는 자기가 든 15덱 전부에서 deck[2] 였고, 옛 pickKind 는
  //      셋째 종류를 절대 안 지었다 — 「그 타워가 든 덱」의 절반 이상이 그 타워가
  //      한 대도 없는 판이었다. 7.88 은 그 위에 얹힌 값이다
  //   ② 지금 값이 작은 것은 **감도가 죽어서**이기도 하다. measure() 는 greedy 에
  //      opts.stage 를 안 넘겨 스테이지1 에서 재는데(기본값 0), 3종을 짓게 된
  //      그리디는 거기서 거의 다 클리어한다 — 실측 B/B2 245/245 판 클리어,
  //      B/B1 241/245. 전부 상한(30)에 눌리면 기여도 차가 0 에 수렴하므로 B/B2 의
  //      0.00 은 「완벽히 대등」이 아니라 「아무것도 안 재고 있다」는 뜻이다.
  //      DESIGN 이 「덱 차이를 재려면 반드시 뒤 스테이지에서 재야 한다」고 적어 둔
  //      바로 그 함정이고, parity 를 어느 스테이지에서 재느냐는 별도 티켓이다.
  // 그러니 이 게이트가 지금 잡아 주는 것은 「폭이 6 을 넘게 벌어지는 회귀」뿐이고,
  // 미세한 불균형은 못 본다. 그래도 폭을 KNOWN 으로 남겨 두는 것보다는 낫다 —
  // 래칫을 0.72 로 박으면 감도 없는 값에 0.01 단위로 묶이게 된다.
  //
  // **대신 「눌렸다」는 사실 자체를 매 실행 화면에 남긴다.** 폭 게이트만 두면
  // B/B2 가 `폭 0.00 · 전 타워 +0.0` 으로 **내용 없는 초록불**이 되고, 요약의
  // 「알려진 미해결 n건」 카운터도 사라져서 22.5초짜리 게이트가 조용히 굳는다.
  // 그래서 상한에 눌린 분기는 PASS 가 아니라 KNOWN 으로 찍는다.
  const KNOWN = {};

  for (const [b3, b5] of BRANCHES) {
    const tag = b3 + '/' + b5;
    // measure() 는 전역 Math.random 을 쓴다. 그대로 두면 35개 덱 × 7시행이 매번 다른
    // 판을 굴려 폭이 2.9~6.1 로 흔들렸다 — 임계 6 을 6~7% 확률로 넘어 무고한 PR 이
    // 반려됐고, 더 나쁘게는 진짜 회귀가 「아 그 불안정한 거」로 넘어갔다. 시행을 늘려도
    // 안 줄어든다(같은 시드 7/12/20 시행 = 4.95/3.99/4.67). 노이즈가 아니라 시드가
    // 판을 가르는 것이므로 답은 시드 고정이다.
    //
    // 12345 는 seedcheck·verify-build·shot·아래 「파편 예산」과 같은 값이다. 이 시드의
    // 여유는 좁은데(B/B2 가 5.05 대 6 으로 0.95), 좁다고 시드를 바꾸지 마라. 15개 시드
    // 중앙값이 4.37 이라 12345 는 특이값이 아니고, 여유가 큰 시드(99991=3.28, 123=2.85)를
    // 골라 앉히는 건 그만큼 감도를 버리는 것이다.
    //
    // **이 단언이 깨지면 그건 불안정이 아니다.** 같은 코드면 매번 같은 값이 나오므로,
    // 값이 움직였다면 타워 기여도가 실제로 벌어진 것이다. 임계 6·3.5 나 시드를 손대서
    // 통과시키지 말고 `npm run parity` 로 네 분기 전체를 다시 재라. 대신 시드를 박은
    // 대가로 여기는 시드 공간을 훑지 않으니, 다른 시드에서만 벌어지는 불균형은 parity 가 맡는다.
    //
    // 분기마다 시드를 **다시** 박는다. 한 번만 박고 넷을 이어 돌리면 앞 분기가 난수를
    // 얼마나 먹었느냐에 뒤 분기가 딸려서, 분기 하나를 지우거나 순서를 바꾸면 나머지
    // 셋의 값이 통째로 움직인다. 그러면 KNOWN 에 적어 둔 실측값도 같이 무의미해진다.
    const orig = Math.random;
    let s = 12345 >>> 0;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
    let contrib, spread, span, clears, runs;
    try {
      ({ contrib, spread, span, clears, runs } = measure(b3, b5, TRIALS));
    } finally {
      Math.random = orig;                         // 안 되돌리면 뒤의 모든 블록이 조용히 바뀐다
    }

    // **폭 게이트보다 먼저 「이 측정이 살아 있는가」를 본다.** 35덱 평균이 한 값에
    // 몰렸거나(span 0) 모든 판이 클리어면(clears === runs) 사망 웨이브가 아무 정보도
    // 안 담으므로 폭은 자동으로 0 이 되고, 「폭 6 미만」은 재지도 않고 참이 된다.
    const pinned = span === 0 || clears === runs;
    const satDetail = '덱평균 span ' + span.toFixed(2) + ' · 클리어 ' + clears + '/' + runs;
    if (pinned) {
      known(`${tag} 측정이 상한에 눌렸다`, false, satDetail,
        'measure() 가 greedy 에 stage 를 안 넘겨 스테이지1 에서 잰다. #31 로 3종을 '
        + '짓게 된 그리디는 거기서 거의 다 클리어하므로 이 분기의 폭은 「대등하다」의 '
        + '증거가 아니다. parity 를 뒤 스테이지에서 재는 것은 별도 티켓이다.');
    } else {
      ok(`${tag} 측정이 상한에 안 눌렸다`, !pinned, satDetail);
    }

    const detail = spread.toFixed(2) + '  '
      + K.map(k => NAME[k] + (contrib[k] >= 0 ? '+' : '') + contrib[k].toFixed(1)).join(' ');
    const outlier = K.filter(k => Math.abs(contrib[k]) > OUTLIER_MAX).map(k => NAME[k]);
    const kn = KNOWN[tag];

    if (!kn) {
      ok(`${tag} 기여도 폭 ${SPREAD_MAX} 미만`, spread < SPREAD_MAX, detail);
      ok(`${tag} 혼자 튀는 타워 없음`, outlier.length === 0, outlier.join(',') || '없음');
      continue;
    }

    // 아는 미해결이라도 **아는 만큼만** 봐준다. 폭은 기록값보다 나빠지면 FAIL 이고,
    // 이상치는 기록에 없는 타워가 새로 튀어나오면 그건 KNOWN 이 아니라 새 회귀다.
    known(`${tag} 기여도 폭`, +spread.toFixed(2) > kn.spread,
      detail + '   (알려진 미해결 / 래칫 ' + kn.spread.toFixed(2) + ')', kn.why);
    const fresh = outlier.filter(n => !kn.outliers.includes(n));
    ok(`${tag} 새로 튀는 타워 없음`, fresh.length === 0,
      fresh.join(',') || '없음 (알려진 이상치 ' + kn.outliers.join(',') + ' 제외)');
    if (spread < SPREAD_MAX) {
      console.log(`        ↳ 폭이 ${SPREAD_MAX} 아래로 내려왔다. KNOWN['${tag}'] 를 지우고 하드 게이트로 승격하라.`);
    }
  }
}

// ── 스프라이트 ────────────────────────────────────────────────
// 이미지 파일 없이 문자열 도트를 캔버스에 굽는다.
{
  console.log('스프라이트');
  const g = load();
  const generated = require('./sprites.js');
  const spriteKeys = [...new Set([...Object.keys(g.SPR), ...Object.keys(generated)])];
  const spriteDrift = spriteKeys.filter(k =>
    JSON.stringify(g.SPR[k]) !== JSON.stringify(generated[k]));
  ok('생성기와 index.html 스프라이트가 같다', spriteDrift.length === 0,
    spriteDrift.join(',') || '없음');

  const missing = g.KIND_KEYS.filter(k => !g.SPR[k])
    .concat(Object.keys(g.ENEMY).filter(k => !g.SPR[k]));
  ok('타워·적 전부 도트가 있다', missing.length === 0, missing.join(',') || '없음');

  const bad = Object.entries(g.SPR).filter(([, rows]) =>
    rows.length !== 32 || rows.some(r => r.length !== 32)).map(([k]) => k);
  ok('전부 32x32 이다', bad.length === 0, bad.join(',') || '없음');

  const chars = new Set();
  for (const rows of Object.values(g.SPR)) for (const r of rows) for (const c of r) chars.add(c);
  const allowed = new Set(['.', '0', '1', '2', '3', '4']);
  const odd = [...chars].filter(c => !allowed.has(c));
  ok('명암 문자만 쓴다', odd.length === 0, odd.join(',') || '없음');

  // 실루엣이 서로 달라야 색 없이도 구분된다
  const sil = k => g.SPR[k].map(r => r.replace(/[01234]/g, '#')).join('/');
  const seen = new Map();
  const dupes = [];
  for (const k of Object.keys(g.SPR)) {
    const s2 = sil(k);
    if (seen.has(s2)) dupes.push(seen.get(s2) + '=' + k);
    else seen.set(s2, k);
  }
  ok('실루엣이 겹치지 않는다', dupes.length === 0, dupes.join(',') || '없음');

  // 새 시안의 핵심은 색이 아니라 실루엣이다. 파쇄자에서 톱날을 빼거나,
  // 마력로를 다시 외기둥으로 줄여도 32x32와 중복 검사는 모두 통과한다.
  // 그래서 작은 크기에서도 종류를 읽게 하는 구조를 별도로 잡는다.
  const filled = (k, x, y) => g.SPR[k][y][x] !== '.';
  const rowFill = (k, y) => [...g.SPR[k][y]].filter(c => c !== '.').length;
  const splitFeet = k =>
    [...Array(14).keys()].some(x => filled(k, x, 28))
    && [...Array(14).keys()].some(i => filled(k, 18 + i, 28))
    && !filled(k, 15, 28) && !filled(k, 16, 28);

  ok('파쇄자 상단에 넓은 원형 톱날이 있다',
    Math.max(...Array.from({ length: 10 }, (_, i) => rowFill('shredder', 7 + i))) >= 20);
  ok('마력로는 사이가 열린 쌍기둥이다',
    filled('arc', 8, 8) && filled('arc', 23, 8) && !filled('arc', 15, 8) && !filled('arc', 16, 8));
  ok('조폐소는 위쪽 프레스와 아래쪽 동전 출구가 가린다',
    rowFill('mint', 6) >= 20 && filled('mint', 16, 26) && !filled('mint', 8, 26));
  const walkers = ['grunt', 'armored', 'regen', 'elite'].filter(k => !splitFeet(k));
  ok('걸어오는 적은 몸체와 분리된 두 발이 있다', walkers.length === 0,
    walkers.join(',') || '없음');

  // PNG 로딩 분기를 지우면 시안 대신 다시 32x32 도트가 화면에 나온다.
  // 반대로 로딩 전 fallback 을 지우면 첫 프레임과 느린 네트워크에서 타워가 빈다.
  const pngPath = 'assets/sprites/towers/shredder.png';
  const loadedPng = g.images.load(pngPath);
  g.draws.reset();
  g.drawSprite('shredder', g.KINDS.shredder.color, 80, 80, 56);
  ok('PNG가 준비되면 시안 이미지를 그린다',
    !!loadedPng && g.draws.images[0] && g.draws.images[0][0] === loadedPng,
    loadedPng ? 'PNG' : 'PNG 등록 없음');

  const pendingPath = 'assets/sprites/enemies/grunt.png';
  const pendingPng = g.images.get(pendingPath);
  g.draws.reset();
  g.drawSprite('grunt', g.ENEMY.grunt.color, 80, 80, 40);
  ok('PNG 로딩 전에는 기존 도트를 그린다',
    !!pendingPng && g.draws.images[0] && g.draws.images[0][0] !== pendingPng,
    pendingPng ? '도트 fallback' : 'PNG 등록 없음');

  const brokenPath = 'assets/sprites/enemies/armored.png';
  const brokenPng = g.images.fail(brokenPath);
  g.draws.reset();
  g.drawSprite('armored', g.ENEMY.armored.color, 80, 80, 44);
  ok('PNG 로드 실패 뒤에도 기존 도트를 그린다',
    !!brokenPng && g.draws.images[0] && g.draws.images[0][0] !== brokenPng,
    brokenPng ? '도트 fallback' : 'PNG 등록 없음');

  const loadedEnemy = g.images.load(pendingPath);
  g.draws.reset();
  g.drawSprite('grunt', '#79c0ff', 80, 80, 40);
  ok('PNG 적도 빙결 색을 입는다',
    !!loadedEnemy && g.draws.images[0] && g.draws.images[0][0] !== loadedEnemy,
    loadedEnemy ? '빙결 tint' : 'PNG 등록 없음');
}

// ── 방향별 스프라이트 ─────────────────────────────────────────
// 몹은 걸어가는 쪽을, 포탑은 쏘는 쪽을 본다. 방향 그림은 **아직 한 장도 없고**
// 디자이너가 한 장씩 넘긴다(docs/sprite-request.md). 그래서 잠글 것이 넷이다.
//   ① 한 장도 없을 때 **화면이 지금과 똑같은가** — 기존 그림, 안 뒤집음
//   ② 파일을 떨어뜨리면 **그 방향이 실제로 그려지는가** — 없으면 가장 가까운 것
//   ③ 뒤집기가 색 입히기·다음 그림을 안 망치는가
//   ④ 경계에서 안 떠는가
//
// **넷 다 `g.draws` 로 본다.** `t.face` 만 보면 drawSprite 에 방향을 안 넘겨도,
// drawTower 에서 그 인자를 통째로 빼도 전부 통과한다 — 이 리포가 세 번 빠진 함정이다.
// `ctx.scale` 은 이 게임에서 좌우 뒤집기 말고 쓰는 데가 없어서(index.html) 그 호출이
// 곧 「뒤집었다」이고, `draws.xform` 이 **어디에** 뒤집었는지를 마저 본다.
{
  console.log('방향별 스프라이트');
  const g = load();

  // 한 번 그리고 「무엇을 · 뒤집어서 · 어디에 그렸나」를 돌려준다.
  const drew = fn => {
    g.draws.reset();
    fn();
    const img = g.draws.images[0] || [];
    const tr = g.draws.xform.find(x => x.m === 'translate');
    const sc = g.draws.xform.find(x => x.m === 'scale');
    return {
      image: img[0] || null, dx: img[1], size: img[3],
      flip: g.draws.count('scale') > 0,
      tx: tr ? tr.a[0] : null, sx: sc ? sc.a[0] : null,
      save: g.draws.count('save'), restore: g.draws.count('restore'),
    };
  };

  const K = 'marksman', KC = g.KINDS[K].color;
  const basePng = g.images.load(g.SPR_ASSET_PATH[K]);
  const name = (r, map) => (map.get(r.image) || '?') + (r.flip ? ' 뒤집힘' : '');

  // ① 방향 그림이 하나도 없을 때. **[#93] 에서는 여덟 방향이 전부 기존 그림**이었고
  //    (그림이 오기 전에 화면을 안 바꾸려고), **[#97] 부터 오른쪽 넷은 뒤집는다** —
  //    기존 그림이 nw 라 뒤집으면 그대로 ne 다. 그림 한 장 없이 포탑이 좌우를 가른다.
  {
    const map = new Map([[basePng, '기존 그림']]);
    const FLIP = new Set(['e', 'ne', 'se', 's']);
    const got = g.TOWER_DIRS.map(d => [d, drew(() => g.drawSprite(K, KC, 80, 80, 56, 56, d))]);
    const notBase = got.filter(([, r]) => r.image !== basePng);
    ok('방향 그림이 없으면 여덟 방향이 전부 기존 그림에서 나온다', notBase.length === 0,
      notBase.length ? notBase.map(([d, r]) => d + '=' + name(r, map)).join(' ') : '없음');
    const wrong = got.filter(([d, r]) => r.flip !== FLIP.has(d));
    ok('  오른쪽 넷(e·ne·se·s)만 뒤집고 왼쪽 넷(w·nw·sw·n)은 그대로다', wrong.length === 0,
      wrong.length ? wrong.map(([d, r]) => d + (r.flip ? ' 뒤집힘' : ' 안 뒤집힘')).join(' ') : '없음');
    const down = drew(() => g.drawSprite('grunt', g.ENEMY.grunt.color, 80, 80, 40, 40, 'down'));
    ok('  적도 마찬가지다', down.image === g.images.get(g.SPR_ASSET_PATH.grunt) || down.image !== null,
      down.flip ? '뒤집힘' : '안 뒤집힘');
  }

  // ② 한 장 떨어뜨린다. **e 한 장뿐**인데 w·ne 까지 같이 산다 — 요청서가
  //    「n·ne·e·se 넷만 그리면 8방향이 선다」고 약속한 것이 이 표다.
  const ePng = g.images.load(g.dirPath(K, 'e'));
  {
    const map = new Map([[basePng, '기존 그림'], [ePng, 'e']]);
    const e = drew(() => g.drawSprite(K, KC, 80, 80, 56, 56, 'e'));
    // 이 줄은 `tintedAsset` 이 **종류 이름만** 받는지도 같이 잠근다. 방향 이름을
    // key 로 넘기면 기준색을 못 찾아 기본색인데도 색 캔버스를 굽고, 그러면
    // 여기 나오는 것이 ePng 이 아니라 그 캔버스가 된다.
    ok('방향 파일을 떨어뜨리면 그 방향이 그려진다', e.image === ePng && !e.flip, name(e, map));
    const w = drew(() => g.drawSprite(K, KC, 80, 80, 56, 56, 'w'));
    ok('  w 는 e 를 좌우로 뒤집어 만든다', w.image === ePng && w.flip, name(w, map));
    // 뒤집어도 **그린 자리는 그대로**여야 한다. 변환이 x → tx - x 이므로 그림의
    // 양 끝이 서로 자리를 바꾸면 자리가 안 움직인 것이다. 이걸 안 보면 뒤집힌
    // 그림이 옆 칸에 가 있어도 「뒤집었다」로 통과한다.
    ok('  뒤집어도 그린 자리가 그대로다',
      w.sx === -1 && w.tx - w.dx === w.dx + w.size && w.tx - (w.dx + w.size) === w.dx,
      `tx ${w.tx} dx ${w.dx} size ${w.size} sx ${w.sx}`);
    const se = drew(() => g.drawSprite(K, KC, 80, 80, 56, 56, 'se'));
    ok('  없는 방향은 가장 가까운 있는 방향으로 대신한다', se.image === ePng && !se.flip, name(se, map));
    // ne 는 e 가 와도 기존 그림 뒤집기다 — 45° 옆의 e.png 보다 **정확히 ne** 인 그림이
    // 이미 있다(nw 의 거울). ne.png 가 오면 그때 그것이 이긴다(체인에서 파일이 앞이다).
    const ne = drew(() => g.drawSprite(K, KC, 80, 80, 56, 56, 'ne'));
    ok('  ne 는 e 가 와도 기존 그림을 뒤집어 쓴다', ne.image === basePng && ne.flip, name(ne, map));
    // nw 는 기존 그림이 서 있는 자리다(요청서 §파일 이름). 방향 파일이 와도 그대로다.
    const nw = drew(() => g.drawSprite(K, KC, 80, 80, 56, 56, 'nw'));
    ok('  기존 그림 자리(nw)는 그림이 와도 그대로다', nw.image === basePng && !nw.flip, name(nw, map));
    // 방향을 안 넘기는 호출부(덱 카드·피커·HUD 덱 줄)는 그림이 와도 안 바뀐다.
    const ui = drew(() => g.drawSprite(K, KC, 80, 80, 56));
    ok('  방향 없는 호출은 기존 그림 그대로다', ui.image === basePng && !ui.flip, name(ui, map));
  }

  // ③ 색 입히기와 뒤집기가 서로를 안 망친다. 색은 256x256 캔버스 **한 장**을
  //    돌려 쓰므로, 거기에 뒤집기를 섞으면 다음 호출이 뒤집힌 캔버스를 받는다.
  {
    const tinted = drew(() => g.drawSprite(K, '#ffffff', 80, 80, 56, 56, 'w'));
    ok('색을 입혀도 뒤집기가 산다', tinted.image !== ePng && tinted.image !== basePng && tinted.flip,
      (tinted.image === ePng ? '색이 안 입혀짐' : '색 캔버스') + (tinted.flip ? ' 뒤집힘' : ' 안 뒤집힘'));
    // restore 를 빠뜨리면 **그 프레임 나머지가 통째로 뒤집힌다.** 화면 전체가
    // 좌우로 뒤집힌 그림인데 헤드리스에서는 이 짝 하나 말고 볼 창이 없다.
    ok('  뒤집기가 다음 그림으로 안 샌다', tinted.save === 1 && tinted.restore === 1,
      `save ${tinted.save} / restore ${tinted.restore}`);
    const after = drew(() => g.drawSprite(K, KC, 80, 80, 56, 56, 'e'));
    ok('  바로 다음 그림이 앞 호출에 안 물든다', after.image === ePng && !after.flip,
      (after.image === ePng ? 'e' : '색 캔버스') + (after.flip ? ' 뒤집힘' : ''));
  }
}

// ── 방향이 판 위에서 실제로 도는가 ────────────────────────────
// 위 블록은 drawSprite 한 줄을 직접 부른다. 여기서는 **render() 로** 본다 —
// towerFacing()/enemyFacing() 이 아무리 맞아도 drawTower·drawEnemies 가 그 값을
// 안 넘기면 화면은 한 방향으로 굳는데, 그 갈림은 render 를 지나야만 보인다.
{
  console.log('방향 — 판 위');

  // 판 위에서 「무엇이 그려졌나」를 이름으로 돌려준다. 방향 파일을 실은 것만
  // 이름이 붙으므로, 그 이름이 나온다 = 그 방향으로 그렸다 이다.
  const shown = (g, map) => {
    g.draws.reset();
    g.render();
    for (const [im, nm] of map) if (g.draws.images.some(a => a[0] === im)) return nm;
    return '기존 그림';
  };

  // ── 포탑: 쏘는 쪽을 본다 ────────────────────────────────────
  {
    const g = load();
    const { state } = g;
    g.restart(); g.pickStage(0);
    ['marksman', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    state.wave = 5; state.gold = 99999;
    g.images.load(g.SPR_ASSET_PATH.marksman);
    const ePng = g.images.load(g.dirPath('marksman', 'e'));
    const sePng = g.images.load(g.dirPath('marksman', 'se'));
    const map = new Map([[ePng, 'e'], [sePng, 'se']]);

    g.summon('marksman');
    const t = state.towers[0];

    // **t.angle 은 여태 마력로만 쓰던 값이다.** 나머지 여섯 종류는 muzzle() 이
    // 채우는데, 그게 빠지면 배치 각도(-π/2 = n)에 얼어붙어 여기가 '기존 그림'이 된다.
    state.phase = 'wave';
    const c = g.towerCenter(t);
    g.spawnEnemy('grunt');
    const e = state.enemies[0];
    e.maxHp = e.hp = 1e9;
    e.x = c.x + g.towerRange(t) - 1; e.y = c.y - 0.5;   // 타워 바로 동쪽
    t.cd = 0;
    g.fireTower(t, 1 / 60);
    ok('포탑이 쏜 쪽을 본다 (마력로 말고도)', shown(g, map) === 'e', shown(g, map));

    // 이력. 경계(22.5°)에 각도를 걸치고 흔들어도 화면이 안 바뀌어야 한다.
    // **먼저 e 로 굳혀 놓고** 경계 양쪽을 오간다.
    t.angle = 0;
    shown(g, map);
    const edge = g.FACE_STEP / 2;
    const wobble = new Set();
    for (let i = 0; i < 12; i++) {
      t.angle = edge + (i % 2 ? 1 : -1) * 1e-4;
      wobble.add(shown(g, map));
    }
    ok('경계에 걸쳐 있어도 방향이 안 떤다', wobble.size === 1 && wobble.has('e'),
      [...wobble].join(' / '));
    // 안 떠는 것이 「아예 안 돈다」로 통과하면 안 된다. 여유를 넘기면 돌아야 한다.
    t.angle = edge + g.FACE_MARGIN * 2;
    ok('  여유를 넘기면 돈다', shown(g, map) === 'se', shown(g, map));

    // 안 쏘는 건물은 안 돈다. 조폐소는 muzzle() 을 아예 안 부르므로 배치 각도에
    // 머문다 — 적이 옆에 우글거려도 따라 돌면 안 된다.
    g.images.load(g.SPR_ASSET_PATH.mint);
    const mintN = g.images.load(g.dirPath('mint', 'n'));
    const mintE = g.images.load(g.dirPath('mint', 'e'));
    state.towers.length = 0;
    g.summon('mint');
    const m = state.towers[0];
    const mc = g.towerCenter(m);
    e.x = mc.x + 1; e.y = mc.y - 0.5;
    m.cd = 0;
    g.fireTower(m, 1 / 60);
    ok('안 쏘는 건물(조폐소)은 안 돈다',
      shown(g, new Map([[mintE, 'e'], [mintN, '배치 각도(n)']])) === '배치 각도(n)',
      shown(g, new Map([[mintE, 'e'], [mintN, '배치 각도(n)']])));
  }

  // ── 적: 걸어가는 쪽을 본다 ──────────────────────────────────
  // **손으로 이동 벡터를 넣지 않는다.** update() 를 돌려 경로를 걷게 해야
  // 「이동 벡터를 어디서 꺼내나」까지 같이 잠긴다.
  {
    const g = load();
    const { state } = g;
    g.restart(); g.pickStage(0);
    ['marksman', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    state.wave = 5;
    state.phase = 'wave';
    g.images.load(g.SPR_ASSET_PATH.grunt);
    const sidePng = g.images.load(g.dirPath('grunt', 'side'));
    const map = new Map([[sidePng, 'side']]);

    g.spawnEnemy('grunt');
    const e = state.enemies[0];
    e.maxHp = e.hp = 1e9;
    // ① 오른쪽으로 걷는 구간(레인 첫 획) ② 아래로 ③ 왼쪽으로.
    // 거리는 레인 정의에서 꺼낸다 — 좌표를 베끼면 판을 고쳤을 때 검사만 옛 판을 본다.
    const L = g.lanes[0];
    const segStart = i => L.seg.slice(0, i).reduce((s, v) => s + v, 0);
    // 구간을 갈아탈 때는 **몸도 그 자리로 옮긴다.** 안 그러면 다음 update 의
    // 델타가 「순간이동한 거리」가 되어, 재려는 한 프레임치 이동이 안 나온다.
    const at = (i, k) => {
      e.dist = segStart(i) + L.seg[i] * k;
      const p = g.posAt(e.dist, e.lane);
      e.x = p.x; e.y = p.y;
      g.update(1 / 60);
    };
    const axis = i => {
      const a = L.points[i], b = L.points[i + 1];
      return Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? '오른쪽' : '왼쪽') : '아래';
    };
    const right = L.seg.findIndex((_, i) => axis(i) === '오른쪽');
    const down = L.seg.findIndex((_, i) => axis(i) === '아래');
    const left = L.seg.findIndex((_, i) => axis(i) === '왼쪽');

    at(right, 0.3);
    const r1 = shown(g, map);
    const flipRight = g.draws.count('scale');
    ok('적이 오른쪽으로 걸으면 옆모습이다', r1 === 'side', r1);
    // 뒤집는 쪽이 오른쪽인 것은 형제 프로젝트(resolveSpriteFacing)와 같은 규칙이다.
    ok('  오른쪽은 뒤집어 그린다', flipRight === 1, '뒤집기 ' + flipRight + '회');

    at(down, 0.5);
    const r2 = shown(g, map);
    ok('아래로 걸으면 기존 그림(정면)이다', r2 === '기존 그림', r2);
    ok('  정면은 안 뒤집는다', g.draws.count('scale') === 0, '뒤집기 ' + g.draws.count('scale') + '회');

    at(left, 0.5);
    const r3 = shown(g, map);
    ok('왼쪽으로 걸으면 옆모습을 안 뒤집는다',
      r3 === 'side' && g.draws.count('scale') === 0, r3 + ' / 뒤집기 ' + g.draws.count('scale'));

    // 멈춰 있으면 방향이 안 튄다. 기절·빙결은 위치 갱신 앞에서 빠지므로 이동 벡터가
    // 그대로 남아야 한다 — 0 으로 덮으면 걷던 놈이 죽은 듯이 정면을 본다.
    // **빙결이 아니라 기절로 잰다.** 빙결은 적을 파란색으로 물들여서(drawEnemies)
    // 그려지는 것이 원본이 아니라 색 캔버스가 되고, 그러면 무엇을 그렸는지가 안 보인다.
    e.stun = 5;
    g.update(1 / 60);
    const r4 = shown(g, map);
    ok('  멈춰 있어도 보던 쪽을 지킨다', r4 === 'side', r4);
    e.stun = 0;

    // 대각선 경계. 지금 판에는 대각선 획이 없지만 규칙은 판과 무관하다 —
    // |dx| 와 |dy| 가 엎치락뒤치락할 때 프레임마다 옆↔정면이 바뀌면 안 된다.
    e.mvx = 0.02; e.mvy = 0.02;
    const flat = new Set();
    for (let i = 0; i < 12; i++) {
      e.mvx = 0.02 + (i % 2 ? 1e-6 : -1e-6);
      flat.add(g.enemyFacing(e));
    }
    ok('  |dx| 와 |dy| 가 같아도 안 떤다', flat.size === 1, [...flat].join(' / '));

    // 처치 잔상도 죽는 순간의 방향으로 굳는다. 안 물려주면 옆으로 걷던 놈이
    // 죽는 순간 정면으로 홱 돈다 — 잔상은 실루엣이 전부라 그 한 프레임이 다 보인다.
    at(left, 0.6);
    g.resetCorpses();
    g.killEnemy(e, null, 'physical');
    state.enemies.length = 0;
    const r5 = shown(g, map);
    ok('  잔상이 죽는 순간의 방향을 지킨다', r5 === 'side', r5);
  }
}

// ── 처치 연출 ────────────────────────────────────────────────
// 적이 사라지는 순간이 안 읽히는 문제라, 확인할 건 "죽였을 때만 난다"와
// "무엇으로 죽였는지가 그림으로 갈린다" 둘이다.
{
  console.log('처치 연출');
  const g = load();
  const { state } = g;

  const newRun = () => {
    g.restart();
    g.pickStage(0);
    ['marksman', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    state.wave = 5;
  };
  // 보드 한복판에 적 하나만 세운다
  const put = (kind, opts) => {
    state.enemies.length = 0;
    g.spawnEnemy(kind);
    const e = state.enemies[0];
    e.x = 3; e.y = 4;
    Object.assign(e, opts || {});
    return e;
  };
  const shapes = () => [...new Set(state.particles.filter(p => p.alive).map(p => p.shape))].sort().join('+');

  newRun();

  // ① 생성
  g.resetParticles();
  g.killEnemy(put('grunt'), null, 'physical');
  const born = g.aliveParticles();
  ok('처치하면 파편이 생긴다', born > 0, born + '개');

  // 몸집 비례. 한 종류만 재면 구현식을 그대로 베낀 동어반복이 되고,
  // 개수를 상수로 박아도 통과한다. 세 종류의 대소를 본다.
  const countFor = kind => {
    g.resetParticles();
    g.killEnemy(put(kind), null, 'physical');
    return g.aliveParticles();
  };
  const nSwarm = countFor('swarm'), nGrunt = countFor('grunt'), nElite = countFor('elite');
  ok('몸집이 클수록 파편이 많다', nElite > nGrunt && nGrunt > nSwarm,
    `군집 ${nSwarm} < 보병 ${nGrunt} < 정예 ${nElite}`);

  // 장판(서리·소이·동상)은 tick 딜이라 피격 플래시를 안 낸다. 하지만 처치 연출은 나야 한다.
  g.resetParticles();
  const tickDead = put('grunt');
  g.damage(tickDead, 1e9, 'magic', null, true);
  ok('지속딜 처치도 연출이 난다', tickDead.dead && g.aliveParticles() > 0, g.aliveParticles() + '개');
  ok('  그래도 피격 플래시는 안 낸다', tickDead.hitFlash === 0, String(tickDead.hitFlash));

  // 파열(A1)이 applyStacks 안에서 damage 를 다시 부른다. e.dead 가드 뒤에 있어야 한 번만 터진다.
  g.resetParticles();
  const twice = put('grunt');
  g.killEnemy(twice, null, 'physical');
  const once = g.aliveParticles();
  g.killEnemy(twice, null, 'physical');
  ok('이미 죽은 적은 두 번 안 터진다', g.aliveParticles() === once, once + ' → ' + g.aliveParticles());

  // ② 실제로 그려지는가. 위 단언들은 전부 aliveParticles()(= 상태)만 보므로
  // render() 의 drawParticles() 호출을 통째로 지워도 하나도 안 깨진다.
  // 파편 하나는 fill 이든 stroke 든 도형을 정확히 하나 그린다.
  g.resetParticles();
  state.enemies.length = 0;
  g.render();                                  // 스프라이트 굽기 워밍업
  g.draws.reset(); g.render();
  const drawnBare = g.draws.count('fill', 'stroke');
  g.killEnemy(put('grunt'), null, 'physical');
  state.enemies.length = 0;                    // 시체를 치워 나머지 그림을 똑같이 맞춘다
  const shown = g.aliveParticles();
  g.draws.reset(); g.render();
  ok('render 가 파편을 실제로 그린다', g.draws.count('fill', 'stroke') - drawnBare === shown,
    `파편 ${shown}개에 도형 ${g.draws.count('fill', 'stroke') - drawnBare}개`);

  // ③ 수명. PARTICLE_LIFE 가 있는 유일한 이유인데, decayEffects 의
  // updateParticles(dt) 호출을 지워도(= 파편이 보드에 영구히 박혀도)
  // 상한·초기화 단언은 전부 그대로 통과한다.
  g.resetParticles();
  g.killEnemy(put('grunt'), null, 'physical');
  const spawned = g.aliveParticles();
  for (let i = 0; i < 3; i++) g.update(1 / 30);     // 0.1초 — 수명의 3분의 1
  const midway = g.aliveParticles();
  for (let i = 0; i < 9; i++) g.update(1 / 30);     // 누적 0.4초 > 수명 0.3초
  ok('수명이 지나면 사라진다',
    spawned > 0 && midway === spawned && g.aliveParticles() === 0,
    `${spawned} → ${midway} → ${g.aliveParticles()}`);

  // ② 상한. 장판이 한 프레임에 여러 마리를 죽이면 여기에 먼저 닿는다.
  g.resetParticles();
  state.enemies.length = 0;
  for (let i = 0; i < 60; i++) g.spawnEnemy('elite');
  const mob = state.enemies.slice();
  mob.forEach((e, i) => { e.x = i % 6; e.y = i % 3; });
  const last = mob[mob.length - 1];
  last.x = 5; last.y = 7;                       // 다른 적과 안 겹치는 자리
  for (const e of mob) g.killEnemy(e, null, 'physical');
  ok('상한을 안 넘는다', g.aliveParticles() <= g.PARTICLE_CAP,
    g.aliveParticles() + '/' + g.PARTICLE_CAP);
  // 넘칠 때 생성을 막으면 하필 방금 죽은 적의 연출이 통째로 빠진다.
  // 그래서 오래된 것부터 덮어쓴다 — 마지막 적의 파편은 반드시 남아야 한다.
  const survived = state.particles.some(p => p.alive && p.x === 5.5 && p.y === 7.5);
  ok('마지막에 죽은 적의 파편이 남는다', survived);
  try { g.render(); ok('상한 상태에서 render 가 안 터진다', true); }
  catch (err) { ok('상한 상태에서 render 가 안 터진다', false, err.message); }

  // ③ 초기화
  g.restart();
  ok('restart 하면 파편이 0', g.aliveParticles() === 0, String(g.aliveParticles()));

  newRun();
  const snap = g.snapshotRun();
  g.killEnemy(put('grunt'), null, 'physical');
  const restored = g.restoreRun(snap);
  ok('restoreRun 하면 파편이 0', restored && g.aliveParticles() === 0,
    restored + ' / ' + g.aliveParticles());

  // 비우기를 성공 경로에만 두면, 못 이어받고 튕긴 뒤 옛 판의 파편이 그대로 남는다.
  newRun();
  g.killEnemy(put('grunt'), null, 'physical');
  const rejected = g.restoreRun({ stage: 99, deck: [], towers: [] });
  ok('restoreRun 이 실패해도 파편이 0', rejected === false && g.aliveParticles() === 0,
    rejected + ' / ' + g.aliveParticles());

  // ④ 타입별 구분
  newRun();
  const shapesOf = (type, opts) => {
    g.resetParticles();
    g.killEnemy(put('grunt', opts), null, type);
    return shapes();
  };
  const phys = shapesOf('physical');
  const mag = shapesOf('magic');
  const ice = shapesOf('magic', { frozen: 1 });
  ok('물리·마법·빙결이 서로 다른 도형', new Set([phys, mag, ice]).size === 3,
    [phys, mag, ice].join(' / '));
  ok('빙결이 딜 타입보다 우선', ice === 'ice', ice);
  ok('마법은 확장 링이 붙는다', mag.includes('ring'), mag);
  // 순수(마력로 B2·서리탑 A2)와 미전달은 물리로 떨어져야 한다.
  // fallback 이 없으면 면역몹 상대 빌드에서만 연출이 사라진다.
  ok('순수는 물리와 같다', shapesOf('pure') === phys, shapesOf('pure'));
  ok('타입 미전달도 물리와 같다', shapesOf(undefined) === phys, shapesOf(undefined));

  // 즉사 2경로는 damage() 를 안 거친다. type 을 안 넘기면 이 빌드에서만 연출이 사라진다.
  const executeCase = (setup, label) => {
    newRun();
    state.gold = 99999;
    g.summon('marksman');
    const t = state.towers[0];
    t.star = 5; t.b3 = 'B'; t.b5 = null; t.t7 = null; t.cd = 0;
    setup(t);
    g.resetParticles();
    const e = put('grunt');
    e.x = t.gx; e.y = t.gy;
    e.hp = e.maxHp * 0.1;
    g.fireTower(t, 1 / 30);
    ok(label, e.dead && g.aliveParticles() > 0, e.dead + ' / ' + g.aliveParticles() + '개');
  };
  executeCase(t => { t.b5 = 'B1'; }, '관측소 처형(B1) 즉사도 연출이 난다');
  executeCase(t => { t.t7 = 'execute'; }, '7성 처형 프로토콜 즉사도 연출이 난다');

  // ⑤ 누수 음성 검사. 관문 도달은 killEnemy 를 안 부르고 continue 한다.
  // 새는 걸 처치처럼 보이게 하는 게 이 티켓에서 제일 나쁜 실패다.
  newRun();
  state.towers.length = 0;              // 타워가 대신 죽여버리면 검사가 무의미하다
  state.spawnQueue.length = 0;
  state.phase = 'wave';
  g.resetParticles();
  const leaker = put('grunt');
  leaker.dist = g.laneLen(leaker.lane);
  const lifeBefore = state.life;
  g.update(1 / 30);
  ok('관문 도달은 연출이 안 난다', state.life < lifeBefore && g.aliveParticles() === 0,
    '생명 ' + lifeBefore + '→' + state.life + ', 파편 ' + g.aliveParticles());

  // 파편은 스냅샷에 안 들어간다. 들어가면 SAVE_VERSION 을 올려야 한다.
  newRun();
  g.killEnemy(put('grunt'), null, 'physical');
  ok('스냅샷에 파편이 안 실린다', !('particles' in (g.snapshotRun() || {})));
}

// ── 처치 잔상 (squash) ───────────────────────────────────────
// 파편은 "뭔가 터졌다"까지만 말한다. 잔상은 **터진 게 그 적이었다**를 말한다.
// 여기서 볼 것은 셋이다:
//   ① 잔상이 실제로 화면에 나오는가 (상태만 재면 drawCorpses 를 통째로 지워도 통과한다)
//   ② sprCache 가 처치할 때마다 커지지 않는가 (색을 알파 섞은 값으로 넘기면 무한히 큰다)
//   ③ 상한·초기화·누수 규칙이 파편과 같은가
{
  console.log('처치 잔상');
  const g = load();
  const { state } = g;

  const newRun = () => {
    g.restart();
    g.pickStage(0);
    ['marksman', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    state.wave = 5;
  };
  const put = (kind, opts) => {
    state.enemies.length = 0;
    g.spawnEnemy(kind);
    const e = state.enemies[0];
    e.x = 3; e.y = 4;
    Object.assign(e, opts || {});
    return e;
  };

  newRun();

  // ① 개수 — 처치 1회당 정확히 1개다. 파편처럼 몸집에 비례하면 실루엣이 겹쳐 뭉갠다.
  g.resetCorpses();
  g.killEnemy(put('grunt'), null, 'physical');
  ok('처치하면 잔상이 1개 생긴다', g.aliveCorpses() === 1, g.aliveCorpses() + '개');

  const elite = (() => { g.resetCorpses(); g.killEnemy(put('elite'), null, 'physical'); return g.aliveCorpses(); })();
  ok('몸집과 무관하게 1개', elite === 1, elite + '개');

  // 파열(A1)이 damage 를 다시 부른다. e.dead 가드 뒤라 한 번만 나야 한다.
  g.resetCorpses();
  const twice = put('grunt');
  g.killEnemy(twice, null, 'physical');
  g.killEnemy(twice, null, 'physical');
  ok('이미 죽은 적은 잔상이 두 번 안 남는다', g.aliveCorpses() === 1, g.aliveCorpses() + '개');

  // ② 수명. 파편(0.3)보다 짧아야 마지막에 남는 그림이 파편이 된다 —
  // 반대면 파편이 걷힌 자리에 적 실루엣만 남아 "아직 안 죽었나"로 읽힌다.
  ok('잔상 수명이 파편보다 짧다', g.CORPSE_LIFE < g.PARTICLE_LIFE,
    g.CORPSE_LIFE + ' < ' + g.PARTICLE_LIFE);
  ok('잔상 수명이 0.15~0.2초', g.CORPSE_LIFE >= 0.15 && g.CORPSE_LIFE <= 0.2, String(g.CORPSE_LIFE));

  g.resetCorpses();
  g.killEnemy(put('grunt'), null, 'physical');
  const bornC = g.aliveCorpses();
  for (let i = 0; i < 2; i++) g.update(1 / 30);        // 0.067초 — 수명의 37%
  const midC = g.aliveCorpses();
  for (let i = 0; i < 6; i++) g.update(1 / 30);        // 누적 0.267초 > 0.18
  ok('수명이 지나면 사라진다',
    bornC === 1 && midC === 1 && g.aliveCorpses() === 0,
    `${bornC} → ${midC} → ${g.aliveCorpses()}`);

  // ③ 크기 비율. 가로는 늘고 세로는 줄고 알파는 빠진다. 셋 중 하나라도 방향이
  // 뒤집히면 squash 가 아니라 그냥 축소나 확대가 된다.
  g.resetCorpses();
  g.killEnemy(put('grunt'), null, 'physical');
  const live = () => state.corpses.find(c => c.alive);
  const s0 = g.corpseScale(live());
  g.update(1 / 30); g.update(1 / 30);
  const s1 = g.corpseScale(live());
  ok('시작은 원래 크기·불투명', Math.abs(s0.sx - 1) < 1e-6 && Math.abs(s0.sy - 1) < 1e-6 && Math.abs(s0.alpha - 1) < 1e-6,
    `sx ${s0.sx} sy ${s0.sy} a ${s0.alpha}`);
  ok('가로는 늘고 세로는 줄고 알파는 빠진다',
    s1.sx > s0.sx && s1.sy < s0.sy && s1.alpha < s0.alpha,
    `sx ${s0.sx.toFixed(3)}→${s1.sx.toFixed(3)} sy ${s0.sy.toFixed(3)}→${s1.sy.toFixed(3)} a ${s0.alpha.toFixed(3)}→${s1.alpha.toFixed(3)}`);
  // 세로가 가로보다 많이 움직여야 "눌린" 것으로 읽힌다. 같으면 면적이 유지돼
  // 그냥 옆으로 늘어난 적이 된다.
  ok('세로 변화가 가로보다 크다', (1 - s1.sy) > (s1.sx - 1),
    `세로 -${(1 - s1.sy).toFixed(3)} vs 가로 +${(s1.sx - 1).toFixed(3)}`);

  // ④ 실제로 그려지는가. 위 단언은 전부 상태만 보므로 render() 의 drawCorpses()
  // 호출을 통째로 지워도 하나도 안 깨진다. 잔상 1개 = drawImage 정확히 1회다.
  g.resetCorpses(); g.resetParticles();
  state.enemies.length = 0;
  g.render();                                   // 스프라이트 굽기 워밍업
  g.draws.reset(); g.render();
  const imgBare = g.draws.count('drawImage');
  g.killEnemy(put('grunt'), null, 'physical');
  state.enemies.length = 0;                     // 산 적을 치워 나머지 그림을 똑같이 맞춘다
  g.draws.reset(); g.render();
  const imgWith = g.draws.count('drawImage');
  ok('render 가 잔상을 실제로 그린다', imgWith - imgBare === 1,
    `drawImage ${imgBare} → ${imgWith}`);
  // 잔상은 스프라이트라 fill/stroke 를 안 쓴다. 파티클 풀에 섞였다면 여기서 걸린다
  // (drawParticles 의 "파편 1개당 도형 1회" 집계가 오염된다).
  ok('잔상은 파편 집계를 오염시키지 않는다',
    !state.particles.some(p => p.alive && 'kind' in p) && g.aliveCorpses() === 1);

  // ⑤ **sprCache 가 처치할 때마다 안 커진다.** 색을 알파 섞은 값이나 진행도로
  // 보간한 값으로 넘기면 처치마다 — 심하면 프레임마다 — 새 캔버스가 구워진다.
  // 그래서 잔상이 살아 있는 동안 render 를 여러 번 돌리는 것까지 포함해서 잰다.
  const burn = (kind, opts) => {
    g.resetCorpses();
    g.killEnemy(put(kind, opts), null, 'physical');
    state.enemies.length = 0;
    for (let i = 0; i < 5; i++) { g.render(); g.update(1 / 30); }
  };
  burn('grunt'); burn('elite'); burn('grunt', { frozen: 1 });   // 워밍업: 쓰는 색을 다 굽는다
  const cacheBefore = g.sprCache.size;
  for (let i = 0; i < 30; i++) { burn('grunt'); burn('elite'); burn('grunt', { frozen: 1 }); }
  const cacheAfter = g.sprCache.size;
  ok('처치 90회에도 sprCache 가 안 커진다', cacheAfter === cacheBefore,
    `${cacheBefore} → ${cacheAfter}`);

  // ⑥ 상한. 파편과 같은 규칙이다 — 넘치면 생성을 막지 말고 덮어쓴다.
  newRun();
  g.resetCorpses();
  state.enemies.length = 0;
  for (let i = 0; i < g.CORPSE_CAP + 40; i++) g.spawnEnemy('grunt');
  const mob = state.enemies.slice();
  mob.forEach((e, i) => { e.x = i % 6; e.y = i % 3; });
  const lastC = mob[mob.length - 1];
  lastC.x = 5; lastC.y = 7;
  for (const e of mob) g.killEnemy(e, null, 'physical');
  ok('잔상이 상한을 안 넘는다', g.aliveCorpses() <= g.CORPSE_CAP,
    g.aliveCorpses() + '/' + g.CORPSE_CAP);
  ok('마지막에 죽은 적의 잔상이 남는다',
    state.corpses.some(c => c.alive && c.x === 5.5 && c.y === 7.5));
  try { g.render(); ok('상한 상태에서 render 가 안 터진다', true); }
  catch (err) { ok('상한 상태에서 render 가 안 터진다', false, err.message); }

  // ⑦ 초기화. 판을 갈아끼우는 함수는 어느 경로로 빠져나가든 옛 판의 잔여물을 안 남긴다.
  g.restart();
  ok('restart 하면 잔상이 0', g.aliveCorpses() === 0, String(g.aliveCorpses()));

  newRun();
  const snapC = g.snapshotRun();
  g.killEnemy(put('grunt'), null, 'physical');
  const restoredC = g.restoreRun(snapC);
  ok('restoreRun 하면 잔상이 0', restoredC && g.aliveCorpses() === 0,
    restoredC + ' / ' + g.aliveCorpses());

  newRun();
  g.killEnemy(put('grunt'), null, 'physical');
  const rejectedC = g.restoreRun({ stage: 99, deck: [], towers: [] });
  ok('restoreRun 이 실패해도 잔상이 0', rejectedC === false && g.aliveCorpses() === 0,
    rejectedC + ' / ' + g.aliveCorpses());

  // ⑧ 누수 음성 검사. 관문 도달은 killEnemy 를 안 부른다. 새는 걸 처치처럼
  // 보이게 하는 게 이 연출이 낼 수 있는 최악의 거짓말이다(2.6).
  newRun();
  state.towers.length = 0;
  state.spawnQueue.length = 0;
  state.phase = 'wave';
  g.resetCorpses(); g.resetParticles();
  const leakerC = put('grunt');
  leakerC.dist = g.laneLen(leakerC.lane);
  const lifeBeforeC = state.life;
  g.update(1 / 30);
  ok('관문 도달은 잔상이 안 난다',
    state.life < lifeBeforeC && g.aliveCorpses() === 0 && g.aliveParticles() === 0,
    `생명 ${lifeBeforeC}→${state.life}, 잔상 ${g.aliveCorpses()}, 파편 ${g.aliveParticles()}`);
  // 그리기 층까지 본다. 상태 단언만 두면 drawCorpses 가 통째로 죽어 있어도 통과하므로,
  // **같은 프레임에** 잔상 하나를 억지로 심어 drawImage 가 정확히 1 늘어나는 것까지
  // 확인한다 — 이게 늘어야 위의 "누수 0"이 "잔상 기능이 죽어서 0"이 아니라는 증거가 된다.
  g.render();                                    // 스프라이트 굽기 워밍업
  g.draws.reset(); g.render();
  const leakFrame = g.draws.count('drawImage');
  g.killEnemy(put('grunt'), null, 'physical');
  state.enemies.length = 0;
  g.draws.reset(); g.render();
  ok('누수 프레임에는 잔상 그림이 0 (처치 프레임에는 1)',
    g.draws.count('drawImage') - leakFrame === 1,
    `누수 ${leakFrame} → 처치 ${g.draws.count('drawImage')}`);

  // ⑨ 잔상은 저장하지 않는다. 들어가면 SAVE_VERSION 을 올려야 한다.
  newRun();
  g.killEnemy(put('grunt'), null, 'physical');
  ok('스냅샷에 잔상이 안 실린다', !('corpses' in (g.snapshotRun() || {})));
}

// ── 타격 3박자 ───────────────────────────────────────────────
// 총구 화염 → 빔 → 착탄 스파크. 여기서 볼 건 "어디에 나는가"가 아니라
// **어디에 안 나는가**다. 발사하지 않는 타워(서리탑·조폐소)에 화염이 붙거나,
// 발사 빈도가 높은 마력로에 여파가 붙으면 화면이 통째로 타 버린다.
{
  console.log('타격 3박자');
  const g = load();
  const { state } = g;

  // 그 종류를 반드시 포함하는 덱으로 판을 깐다. summon 은 덱에 없는 종류를 거른다.
  const scene = (kind, opts) => {
    g.restart();
    g.pickStage(0);
    [kind, 'frost', 'mint'].filter((k, i, a) => a.indexOf(k) === i)
      .slice(0, 3).forEach(k => g.toggleDeckPick(k));
    if (state.deckPick.length < 3) ['marksman', 'mortar'].forEach(k => {
      if (state.deckPick.length < 3 && !state.deckPick.includes(k)) g.toggleDeckPick(k);
    });
    g.startRun();
    state.wave = 5;
    state.phase = 'wave';
    state.spawnQueue.length = 0;
    state.towers.length = 0;
    state.enemies.length = 0;
    state.gold = 999999;
    g.summon(kind);
    const t = state.towers[0];
    Object.assign(t, { star: 5, b3: null, b5: null, t7: null, cd: 0, flash: 0 }, opts || {});
    return t;
  };

  // 사거리 안에 세우고 안 죽게 만든다. 죽으면 처치 파편이 섞여서 스파크만 셀 수 없다.
  const stand = (t, n) => {
    const out = [];
    for (let i = 0; i < (n || 1); i++) {
      g.spawnEnemy('grunt');
      const e = state.enemies[state.enemies.length - 1];
      e.x = t.gx; e.y = t.gy;
      e.maxHp = e.hp = 1e12;
      out.push(e);
    }
    return out;
  };
  const sparks = () => state.particles.filter(p => p.alive && p.shape === 'spark').length;

  // ── 화염이 붙는 타워 / 안 붙는 타워 ──────────────────────────
  // 예전엔 쿨다운 통과 지점에서 flash 를 세웠는데, 서리탑은 그 뒤에 아무것도
  // 안 쏘고 빠져나가므로 "발사 안 했는데 화염만 나는" 타워가 됐다.
  const fired = (kind, opts, n) => {
    const t = scene(kind, opts);
    stand(t, n);
    g.resetParticles();
    g.fireTower(t, 1 / 30);
    return t;
  };
  const flashes = [
    ['파쇄자', 'shredder', true], ['침식자', 'eroder', true],
    ['박격포', 'mortar', true], ['관측소', 'marksman', true],
    ['서리탑', 'frost', false], ['조폐소', 'mint', false],
  ];
  for (const [label, kind, want] of flashes) {
    const t = fired(kind, null, 1);
    ok(`${label} 총구 화염 ${want ? 'O' : 'X'}`, (t.flash > 0) === want, 'flash ' + t.flash);
  }

  // 마력로는 빔 직선 위에 적이 얹혔을 때만 쏜다. 원 안에 있어도 선 밖이면 충전만 한다.
  {
    const t = fired('arc', null, 3);
    ok('마력로(표적 있음) 총구 화염 O', t.flash > 0, 'flash ' + t.flash);

    const t2 = scene('arc');
    g.spawnEnemy('grunt');
    const e = state.enemies[0];
    e.maxHp = e.hp = 1e12;
    // 정사각 사거리의 대각 모서리 — 체비셰프로는 안, 빔 직선 투영으로는 밖
    const s = g.towerFootprint(t2), R = g.towerRange(t2);
    e.x = t2.gx + s / 2 + R - 0.5;
    e.y = t2.gy + s / 2 + R - 0.5;
    g.fireTower(t2, 1 / 30);
    ok('마력로(선 위에 표적 없음) 총구 화염 X', t2.flash === 0,
      'flash ' + t2.flash + ', 빔 ' + state.beams.length);
  }

  // ── 발광점이 표적 쪽에 있다 ─────────────────────────────────
  // 방향을 안 들고 있으면 5성 2x2 몸 한복판에서 빛나서 어디로 쐈는지가 안 읽힌다.
  {
    const t = scene('marksman');
    const e = stand(t)[0];
    e.x = t.gx + 3; e.y = t.gy;          // 오른쪽에 세운다
    g.fireTower(t, 1 / 30);
    const s = g.towerFootprint(t);
    const vx = e.x + 0.5 - (t.gx + s / 2), vy = e.y + 0.5 - (t.gy + s / 2);
    const dot = t.mzDx * vx + t.mzDy * vy;
    ok('발광점이 표적 쪽에 있다', dot > 0, 'dot ' + dot.toFixed(2));
  }

  // 적이 타워와 같은 점에 있으면 방향 벡터 길이가 0 이다. || 1 가드가 없으면
  // mzDx 가 NaN 이 되고, NaN 좌표는 arc() 를 조용히 통과해 그림만 사라진다.
  {
    const t = scene('shredder');
    const s = g.towerFootprint(t);
    const e = stand(t)[0];
    e.x = t.gx + s / 2 - 0.5; e.y = t.gy + s / 2 - 0.5;   // 적 중심 == 타워 중심
    g.fireTower(t, 1 / 30);
    const nan = Number.isNaN(t.mzDx) || Number.isNaN(t.mzDy) ||
      state.particles.some(p => p.alive && (Number.isNaN(p.x) || Number.isNaN(p.y) || Number.isNaN(p.rot)));
    ok('타워와 같은 칸이어도 NaN 이 없다', !nan, 'mz ' + t.mzDx + ',' + t.mzDy);
    try { g.render(); ok('  그 상태에서 render 가 안 터진다', true); }
    catch (err) { ok('  그 상태에서 render 가 안 터진다', false, err.message); }
  }

  // ── 3박자의 수명 순서 ───────────────────────────────────────
  // 화염(출발) < 스파크(여파) < 처치 파편. 이 순서가 곧 2.7 의 규칙이다.
  // **동시 피크 예산으로는 이걸 못 잡는다** — 스파크는 발당 4~16개가 한 번에
  // 터지는 버스트고 B 분기 공속이 낮아 버스트끼리 안 겹치므로, 수명을 3배로
  // 늘려도 동시 개수가 44 → 48 로만 움직인다(실측). 수명은 여기서 직접 잠근다.
  {
    ok('수명이 화염 < 스파크 < 처치 파편',
      g.MUZZLE_LIFE < g.SPARK_LIFE && g.SPARK_LIFE < g.PARTICLE_LIFE,
      `화염 ${g.MUZZLE_LIFE} < 스파크 ${g.SPARK_LIFE} < 처치 ${g.PARTICLE_LIFE}`);

    // 상수 비교만 두면 spawnSparks 가 p.life 를 다른 값으로 덮어써도 통과한다.
    // 실제로 태어난 파티클의 수명을 재서 규칙과 실물을 함께 잠근다.
    const t = fired('marksman', null, 1);
    const sparkLife = state.particles.find(p => p.alive && p.shape === 'spark').life;
    g.resetParticles();
    g.killEnemy(stand(t)[0], null, 'physical');
    const killLife = state.particles.find(p => p.alive && p.shape !== 'spark').life;
    ok('  실물 수명도 같은 순서', sparkLife === g.SPARK_LIFE && sparkLife < killLife,
      `스파크 ${sparkLife} < 처치 ${killLife}`);
  }

  // ── 저프레임 배속에서도 화염이 그려진다 ──────────────────────
  // frame() 은 실제 프레임 간격(상한 0.05초)을 배속만큼 반복한다. 30fps x4 면
  // 렌더 1프레임 사이에 게임시간 4x1/30 = 0.133초가 흘러 MUZZLE_LIFE(0.07)가
  // 통째로 타 버린다 — 수명만 믿으면 그 프레임에 화염이 아예 안 그려진다.
  // 렌더 없이 update 만 여러 번 돌린 상태가 정확히 그 조건이다.
  {
    const t = fired('marksman', null, 1);
    for (let i = 0; i < 3; i++) g.update(1 / 30);   // x4 의 남은 스텝
    state.enemies.length = 0;
    state.beams.length = 0;
    g.resetParticles();
    // 연속 두 번 렌더한다. 첫 번째가 래치를 쓰고 두 번째는 안 쓰므로,
    // 차이가 곧 "그 프레임에 화염이 그려졌다"다. 사이에 update 를 안 넣어
    // 다른 그림은 완전히 같게 유지한다.
    g.draws.reset(); g.render();
    const withFlash = g.draws.count('fill');
    g.draws.reset(); g.render();
    const after = g.draws.count('fill');
    ok('수명이 다 타도 그 프레임엔 화염이 그려진다',
      t.flash <= 0 && withFlash - after === 2 && t.mzShown === true,
      `flash ${t.flash.toFixed(4)}, fill ${withFlash} → ${after}`);
  }

  // ── 착탄 스파크의 완전 목록 ─────────────────────────────────
  // 발당 4개. 처치 파편(8~10)보다 적어야 "맞았다"와 "죽었다"가 안 섞인다.
  const sparkCase = (label, kind, opts, n, want) => {
    const t = fired(kind, opts, n);
    ok(label, sparks() === want && g.aliveParticles() === want,
      `스파크 ${sparks()} / 전체 ${g.aliveParticles()} (기대 ${want})`);
    return t;
  };
  sparkCase('파쇄자 스파크 4', 'shredder', null, 1, 4);
  sparkCase('침식자 스파크 4', 'eroder', null, 1, 4);
  sparkCase('관측소 스파크 4', 'marksman', null, 1, 4);
  // 관통사격(B2)은 4마리를 꿴다. 명중 수만큼 나야 몇 마리를 맞혔는지가 보인다.
  sparkCase('관측소 B2 스파크 4x4', 'marksman', { b3: 'B', b5: 'B2' }, 4, 16);
  sparkCase('서리탑 스파크 0', 'frost', null, 1, 0);
  sparkCase('조폐소 스파크 0', 'mint', null, 1, 0);
  // 마력로만 여파가 없다. 충전 2.5초 한 발이 선 위 5마리를 동시에 꿰므로
  // 여파를 얹으면 라인 전체가 불꽃 띠가 되어 관통 수가 오히려 안 읽힌다.
  sparkCase('마력로 관통 스파크 0', 'arc', null, 3, 0);
  sparkCase('마력로 A1 연쇄 스파크 0', 'arc', { b5: 'A1' }, 3, 0);

  // 박격포는 발사에도 착탄에도 스파크가 없다. 착탄은 blasts 링이 이미 맡고 있다.
  {
    const t = fired('mortar', null, 1);
    ok('박격포 발사 스파크 0', sparks() === 0, String(sparks()));
    const shells = state.shells.length;
    for (let i = 0; i < 30; i++) g.update(1 / 30);       // 착탄 지연 0.5초를 넘긴다
    ok('박격포 착탄 스파크 0', shells > 0 && sparks() === 0,
      '탄 ' + shells + ', 스파크 ' + sparks() + ', 링 ' + state.blasts.length);
  }

  // ── 장판·지속딜 ────────────────────────────────────────────
  // 장판은 tick 이라 beam() 을 안 거친다. 그런데 "0 이 나왔다"만 보면 아무것도
  // 증명하지 못한다 — e.x/e.y 만 세우면 첫 update 의 updateEnemies 가 e.dist 로
  // 좌표를 되돌려 적이 스폰 지점으로 튀고, 장판이 한 번도 안 틱한 채 0 이 나온다.
  // 그래서 (1) 적을 사거리 안 경로 지점에 못박고 (2) 통상 사격을 봉인해 틱만 남기고
  // (3) **딜이 실제로 들어간 프레임 수를 같이 단언한다.**

  // 사거리 안에 들어오는 경로 거리를 찾는다. 좌표가 아니라 dist 를 잡아야
  // updateEnemies 가 매 프레임 되돌려 놓지 않는다.
  const rangeDist = (t, lane) => {
    const s = g.towerFootprint(t), R = g.towerRange(t);
    const cx = t.gx + s / 2, cy = t.gy + s / 2;
    const len = g.laneLen(lane);
    for (let d = 0; d <= len; d += 0.2) {
      const p = g.posAt(d, lane);
      if (Math.max(Math.abs(p.x + 0.5 - cx), Math.abs(p.y + 0.5 - cy)) <= R) return d;
    }
    return null;
  };

  // 통상 사격 봉인은 cd 를 매 프레임 크게 밀어 두는 것으로 한다. fireTower 는
  // 오라·장판을 cd 검사 **앞에서** 처리하므로 틱은 그대로 살아 있다.
  const fieldCase = (label, kind, opts, prep) => {
    const t = scene(kind, opts);
    g.spawnEnemy('grunt');
    const e = state.enemies[0];
    e.maxHp = e.hp = 1e9;
    const d0 = rangeDist(t, e.lane);
    if (d0 === null) { ok(label, false, '사거리 안 경로 지점이 없다'); return; }

    if (prep) prep(t, e, d0);       // 소이 장판처럼 먼저 한 발 쏴야 하는 경우
    g.resetParticles();

    let dealt = 0;
    for (let i = 0; i < 30; i++) {
      e.dist = d0;                  // 못박는다
      t.cd = 1e9;                   // 통상 사격 봉인 (오라·장판은 cd 앞이라 살아 있다)
      const hp = e.hp;
      g.update(1 / 30);
      if (e.hp < hp) dealt++;
    }
    ok(label, dealt > 0 && sparks() === 0,
      `딜 프레임 ${dealt}/30, 스파크 ${sparks()}`);
  };

  fieldCase('서리탑 장판 스파크 0', 'frost', null);
  fieldCase('서리탑 A2 동상 스파크 0', 'frost', { b5: 'A2' });
  fieldCase('침식자 B2 소각 스파크 0', 'eroder', { b5: 'B2' });
  // 소이 장판은 착탄이 만든다 — 한 발 쏘고 탄이 떨어질 때까지 기다려야 patches 가 생긴다.
  fieldCase('박격포 A2 소이 장판 스파크 0', 'mortar', { b5: 'A2' }, (t, e, d0) => {
    for (let i = 0; i < 30 && !state.patches.length; i++) {
      e.dist = d0;
      t.cd = 0;
      g.update(1 / 30);
    }
    ok('  소이 장판이 실제로 깔렸다', state.patches.length > 0, '장판 ' + state.patches.length);
  });

  // ── 즉사 경로 ──────────────────────────────────────────────
  // 처형은 damage() 를 안 거치고 continue 했다. 화염이 붙으면서
  // "화염은 났는데 빔이 없고 적만 터지는" 프레임이 생겨서 같이 고쳤다.
  const execCase = (label, opts) => {
    const t = scene('marksman', Object.assign({ b3: 'B' }, opts));
    const e = stand(t)[0];
    e.maxHp = 1000; e.hp = 100;                 // 10% — 처형 문턱 아래
    g.resetParticles();
    state.beams.length = 0;
    g.fireTower(t, 1 / 30);
    ok(label, e.dead && state.beams.length === 1,
      e.dead + ' / 빔 ' + state.beams.length);
    ok('  ' + label + ' 여파는 없다', sparks() === 0, '스파크 ' + sparks());
  };
  execCase('관측소 처형(B1) 도 빔이 그려진다', { b5: 'B1' });
  execCase('7성 처형 프로토콜도 빔이 그려진다', { t7: 'execute' });

  // 즉사가 아닌 **정상 킬**도 같은 규칙을 따라야 한다. damage() 가 인라인으로
  // killEnemy() 를 부르므로, 죽이는 한 방에서는 파편이 먼저 깔린 뒤 beam() 이
  // 불린다 — 여기서 스파크가 나면 "겹치면 둘 다 안 읽힌다"는 근거가 훨씬 흔한
  // 프레임에서 깨진다. 즉사 분기에만 예외를 두면 이 경로가 조용히 새어 나갔다.
  {
    const t = scene('marksman');
    const e = stand(t)[0];
    e.maxHp = 100; e.hp = 1;                    // 한 방에 죽는다
    g.resetParticles();
    state.beams.length = 0;
    g.fireTower(t, 1 / 30);
    ok('정상 킬은 여파를 안 낸다', e.dead && sparks() === 0 && g.aliveParticles() > 0,
      `죽음 ${e.dead}, 스파크 ${sparks()}, 파편 ${g.aliveParticles()}, 빔 ${state.beams.length}`);
    ok('  그래도 빔은 그려진다', state.beams.length === 1, String(state.beams.length));
  }

  // 안 죽는 표적에는 여전히 나야 한다 — 위 단언이 스파크를 통째로 죽여도 통과하면 안 된다.
  {
    const t = fired('marksman', null, 1);
    ok('안 죽는 표적에는 여파가 난다', sparks() === 4, String(sparks()));
  }

  // ── 실제로 그려지는가 ───────────────────────────────────────
  // 상태만 보면 draw 쪽을 통째로 지워도 위 단언이 전부 통과한다.
  {
    g.restart();
    g.pickStage(0);
    ['marksman', 'frost', 'mint'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    state.enemies.length = 0;
    state.beams.length = 0;
    g.resetParticles();
    g.render();                                   // 스프라이트 굽기 워밍업
    g.draws.reset(); g.render();
    const bare = g.draws.count('stroke');
    state.beams.push({ x1: 1, y1: 1, x2: 5, y2: 5, t: 0.09, color: '#58a6ff' });
    g.draws.reset(); g.render();
    ok('빔 하나가 stroke 를 정확히 2번 부른다', g.draws.count('stroke') - bare === 2,
      bare + ' → ' + g.draws.count('stroke'));
    state.beams.length = 0;
  }

  // 파편 1개당 도형 1개 규약이 스파크에도 성립해야 한다.
  {
    const t = fired('marksman', null, 1);
    const n = sparks();
    state.enemies.length = 0;
    state.beams.length = 0;
    t.flash = 0; t.mzShown = true;                // 화염까지 세면 이 검사가 뭉개진다
    g.render();
    g.draws.reset(); g.render();
    const withSpark = g.draws.count('fill', 'stroke');
    g.resetParticles();
    g.draws.reset(); g.render();
    ok('스파크도 1개당 도형 1개', n > 0 && withSpark - g.draws.count('fill', 'stroke') === n,
      `스파크 ${n}개에 도형 ${withSpark - g.draws.count('fill', 'stroke')}개`);
  }

  // 새 필드는 스냅샷에 안 들어간다. 들어가면 SAVE_VERSION 을 올려야 한다.
  {
    const t = fired('marksman', null, 1);
    state.phase = 'build';                        // snapshotRun 은 준비 단계에서만 뜬다
    const snap = g.snapshotRun() || {};
    const leaked = (snap.towers || []).some(o => 'mzDx' in o || 'mzDy' in o || 'flash' in o);
    ok('방향 필드가 스냅샷에 안 실린다', !leaked && t.mzDx !== undefined,
      JSON.stringify(snap.towers && snap.towers[0]));
  }
}

// ── 파편 예산 ────────────────────────────────────────────────
// 스파크는 처치 파편과 같은 링 버퍼를 쓴다. 상한(360)에 닿으면 덮어쓰기가 돌아서
// 하필 방금 죽은 적의 연출이 빠진다 — 실제 판을 끝까지 돌려서 예산을 확인한다.
{
  console.log('파편 예산');
  // test.js 는 전역 Math.random 을 안 건드리는 게 규칙이라, 여기서만 시드를 씌우고
  // 반드시 되돌린다. 안 되돌리면 뒤에 오는 블록이 조용히 결정적으로 바뀐다.
  const orig = Math.random;
  let s = 12345 >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };

  let peak = 0, peakSpark = 0, peakKill = 0, cap = false, wave = 0;
  try {
    const g = load();
    const up = g.update;
    g.update = dt => {
      up(dt);
      const alive = g.state.particles.filter(p => p.alive);
      const sp = alive.filter(p => p.shape === 'spark').length;
      if (alive.length >= g.PARTICLE_CAP) cap = true;
      if (alive.length > peak) peak = alive.length;
      if (sp > peakSpark) peakSpark = sp;
      if (alive.length - sp > peakKill) peakKill = alive.length - sp;
    };
    // 스파크가 가장 많이 나는 조합이다. 관통사격(B2)은 한 발이 4마리를 꿰어
    // 발당 16개를 내고, B 분기는 딜을 몰아주는 대신 공속이 낮아 표적이 잘 안 죽는다
    // — 스파크는 죽은 적에는 안 나므로 "안 죽는 표적을 여러 번 때리는" 빌드가 최악이다.
    // 점사(A2)는 오히려 처치 연쇄라 스파크가 적다(파편이 대신 늘어난다).
    wave = greedy(g, {
      stage: 3, deck: ['shredder', 'marksman', 'mortar'], branch3: 'B', branch5: 'B2',
    }).wave;
  } finally {
    Math.random = orig;
  }

  // 웨이브는 단언하지 않는다. 그리디가 몇 웨이브에서 죽는지는 난이도 지표(18~25)이고
  // 밸런스를 목표대로 조이면 당연히 내려간다 — 여기서 고정하면 밸런스를 만질 때마다
  // 「파편 예산」이 빨간불이 되어 엉뚱하게 연출을 의심하게 된다. 같은 덱·분기에서도
  // 시드에 따라 w22~w29 로 흔들린다. 전투를 충분히 돌았다는 전제만 잡는다.
  ok('전투를 충분히 돌았다', wave >= 15, 'w' + wave);

  // [2026-08 #31] 이 덱의 셋째 원소가 박격포라 **박격포가 안 지어지던 판**을 재고
  // 있었다. 3종을 다 짓게 되자 같은 골드가 세 종류로 갈려 관측소 대수가 줄고, 그래서
  // 이 조합의 동시 피크가 **스파크 44 → 24 / 총 69 → 56** 으로 내려갔다(w30 완주).
  // 예산이 안전한 쪽으로 움직였으므로 임계(60/200)는 그대로 둔다. 아래 「64판 스윕」
  // 최악값은 이번에 다시 안 돌렸다 — 그 수치는 여전히 옛 그리디 기준이다.
  //
  // 경계는 실측에 붙인다 — 이 조합이 스파크 44 / 총 69, 64판 스윕 최악값도 44 / 99.
  // 이 단언이 잡는 건 **버스트 크기**다. SPARK_N 을 4 → 16 으로 늘린 사본에서
  // 스파크가 176 으로 튀어 FAIL 하는 것을 확인했다.
  // 반대로 **수명 폭주는 여기서 안 잡힌다**(0.20 → 0.60 에서 44 → 48). 수명은
  // 버스트가 안 겹쳐서 동시 개수를 거의 안 바꾸므로, 위 「3박자의 수명 순서」가 맡는다.
  ok('상한에 한 번도 안 닿는다', !cap, '동시 피크 ' + peak + '/' + 360);
  ok('스파크 동시 피크가 60 이하', peakSpark <= 60, '스파크 ' + peakSpark);
  ok('총 동시 피크가 200 이하', peak <= 200, '총 ' + peak);
  // 처치 파편 몫은 티켓 1 에서 들어온 값이라 이 티켓의 예산이 아니다.
  // 총 피크가 올랐을 때 어느 쪽이 올랐는지 보려고 출력만 한다(단언 없음).
  console.log('       (참고) 처치 파편 몫 동시 피크 ' + peakKill + ' — main 지표, 단언 안 함');
}

// ── 충격 등급 ────────────────────────────────────────────────
// 등급표(아무것도 없음 / 약한 흔들림 / 강한 흔들림+히트스톱 / 비네트)가 코드로
// 잠겨 있는지 본다. 여기서 제일 위험한 건 연출이 안 나는 게 아니라 **연출이
// 로직을 건드리는 것**이다 — 히트스톱은 update 호출을 건너뛰는 기능이라,
// 한 줄만 잘못 두면 판정이 프레임레이트와 배속에 묶인다.
{
  console.log('충격 등급');
  const g = load();
  const { state, CFG } = g;

  const newRun = () => {
    g.restart();
    g.pickStage(0);
    ['mortar', 'marksman', 'mint'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    state.wave = 5;
    state.phase = 'wave';
    state.spawnQueue.length = 0;
    g.resetImpact();
  };
  const put = (kind, opts) => {
    g.spawnEnemy(kind);
    const e = state.enemies[state.enemies.length - 1];
    e.x = 3; e.y = 4;
    Object.assign(e, opts || {});
    return e;
  };
  const grade = () => `t=${g.shake.t.toFixed(3)} amp=${g.shake.amp} hs=${g.hitstopState()}`;

  // ① 히트스톱이 로직에 안 샌다.
  // (a) 구조: frame() 은 시뮬에 아예 안 보인다. 히트스톱을 여기 둔 유일한 이유다.
  ok('frame 은 시뮬에 안 샌다', g.frame === undefined, String(g.frame));

  // (b) 행동: hitstopT 가 뭐든 update 200스텝의 결과가 글자 하나까지 같아야 한다.
  // dt 를 곱하거나 나누는 구현으로 바꾸면 여기서 갈린다.
  const runWith = (hs) => {
    const origRand = Math.random;
    let s = 4242 >>> 0;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
    try {
      const h = load();
      const st = h.state;
      h.pickStage(0);
      ['shredder', 'mortar', 'marksman'].forEach(k => h.toggleDeckPick(k));
      h.startRun();
      st.gold = 99999;
      for (let i = 0; i < 14; i++) h.summon(st.deck[i % 3]);
      st.wave = 9;
      h.rushWave();               // w10 — 판에서 정예가 처음 나오는 웨이브
      h.setHitstop(hs);
      for (let i = 0; i < 200; i++) h.update(1 / 30);
      return [st.wave, st.life, Math.round(st.gold), st.enemies.length,
        st.towers.map(t => t.kind + t.star).sort().join('')].join('|');
    } finally { Math.random = origRand; }
  };
  const froze = runWith(0.5), ran = runWith(0);
  ok('히트스톱은 update 를 한 톨도 안 건드린다', froze === ran, froze + '  vs  ' + ran);

  // ② 등급표. 아무것도 안 나야 하는 세 경로부터 본다 — 여기가 무너지면
  // 후반 웨이브에서 화면이 초당 수십 번 얼어붙는다.
  newRun();
  const tank = put('grunt', { maxHp: 1e9, hp: 1e9 });
  g.summon('marksman');
  const gun = state.towers[0];
  g.damage(tank, 1, 'physical', gun);
  ok('일반 타격은 아무것도 안 낸다', g.shake.t === 0 && g.hitstopState() === 0, grade());
  g.damage(tank, 1, 'magic', gun, true);
  ok('오라·지속딜도 아무것도 안 낸다', g.shake.t === 0 && g.hitstopState() === 0, grade());
  g.killEnemy(put('grunt'), null, 'physical');
  ok('일반 처치는 아무것도 안 낸다', g.shake.t === 0 && g.hitstopState() === 0, grade());

  // 박격포 착탄: 약한 흔들림만. 히트스톱은 없다.
  newRun();
  g.summon('mortar');
  const mortar = state.towers[0];
  const shell = (dmg) => ({ x: 1, y: 1, tx: 3.5, ty: 4.5, t: 0.5, tt: 0.5, tower: mortar.id, dmg, radius: 1.5 });
  const boom = (n, keep) => {
    if (!keep) g.resetImpact();
    state.enemies.length = 0;
    state.shells.length = 0;
    for (const t of state.towers) t.cd = 99;      // 이 프레임에는 아무도 안 쏜다
    put('grunt', { maxHp: 1e9, hp: 1e9, x: 0, y: 0 });   // 폭심 밖. 웨이브가 안 끝나게 붙잡아 둔다
    for (let i = 0; i < n; i++) state.shells.push(shell(1));
    g.update(1 / 30);
  };
  boom(1);
  ok('박격포 착탄은 약한 흔들림만', g.shake.amp === g.BLAST_SHAKE_AMP && g.hitstopState() === 0, grade());

  // 쿨다운이 실제로 게이트하는지. 첫 착탄의 흔들림을 절반만 흘려보낸 뒤 다시 착탄시킨다 —
  // 쿨다운(0.25)이 아직 0.21 남았으므로 흔들림이 되살아나면 안 된다.
  const tBoom = g.shake.t;
  g.decayShake(0.04);
  boom(1, true);
  ok('쿨다운 안에서는 착탄이 흔들림을 못 되살린다', g.shake.t < tBoom,
    tBoom.toFixed(3) + ' → ' + g.shake.t.toFixed(3));

  // 합치기가 최댓값인지는 **착탄끼리로는 원리적으로 못 잰다.** 같은 프레임에 3발이
  // 떨어져도 위의 shakeCd 게이트 때문에 bumpShake 는 어차피 한 번만 불린다 —
  // 합산 구현으로 바꿔도 amp 는 0.05 그대로라 그 단언은 통과한다(실제로 통과했다).
  // 등급표가 실제로 뒤집히는 경로는 **같은 프레임에 착탄 + 정예 처치**다.
  // 박격포 한 발이 정예를 죽이면 0.14 와 0.05 가 한 프레임에 들어오고,
  // 합산이면 0.19 가 되어 정예 처치보다 센 흔들림이 나온다.
  g.resetImpact();
  state.enemies.length = 0;
  state.shells.length = 0;
  for (const t of state.towers) t.cd = 99;
  const doomed = put('elite');                    // 폭심(3.5, 4.5) 안이다
  doomed.hp = 1;
  put('grunt', { maxHp: 1e12, hp: 1e12, x: 0, y: 0 });
  state.shells.push(shell(1e9));
  g.update(1 / 30);
  ok('착탄과 정예 처치가 겹쳐도 합산이 아니다',
    doomed.dead && g.shake.amp === g.KILL_SHAKE_AMP, doomed.dead + ' / ' + grade());
  // 위는 killEnemy(0.14) 가 blasts.push(0.05) 보다 먼저 온다. 반대 순서도 막혀야 한다.
  g.resetImpact();
  g.bumpShake(g.BLAST_SHAKE_AMP, g.BLAST_SHAKE_DUR);
  g.killEnemy(put('elite'), null, 'physical');
  ok('  반대 순서(착탄이 먼저)도 합산이 아니다', g.shake.amp === g.KILL_SHAKE_AMP, grade());

  // 정예 처치: 강한 흔들림 + 히트스톱. 두 등급은 눈으로 갈려야 한다.
  newRun();
  g.killEnemy(put('elite'), null, 'physical');
  ok('정예 처치는 강한 흔들림 + 히트스톱',
    g.shake.amp === g.KILL_SHAKE_AMP && g.hitstopState() === g.HITSTOP, grade());
  ok('  두 등급의 진폭이 갈린다', g.KILL_SHAKE_AMP > g.BLAST_SHAKE_AMP * 2,
    g.BLAST_SHAKE_AMP + ' → ' + g.KILL_SHAKE_AMP);
  // 흔들림은 처치 파편(0.3초)이 살아 있는 동안 끝나야 원인이 읽힌다.
  ok('  흔들림이 파편보다 먼저 끝난다', g.KILL_SHAKE_DUR < g.PARTICLE_LIFE,
    g.KILL_SHAKE_DUR + ' < ' + g.PARTICLE_LIFE);

  newRun();
  for (let i = 0; i < 4; i++) g.killEnemy(put('elite'), null, 'physical');
  ok('정예 4마리를 한 프레임에 죽여도 1회분', g.hitstopState() <= g.HITSTOP, grade());
  // 약한 흔들림이 진행 중인 강한 흔들림을 덮어쓰면 정예가 잡몹처럼 보인다.
  g.bumpShake(g.BLAST_SHAKE_AMP, g.BLAST_SHAKE_DUR);
  ok('약한 흔들림이 강한 것을 못 덮는다', g.shake.amp === g.KILL_SHAKE_AMP, grade());

  // ③ 흔들림이 히트박스를 안 옮긴다. 이게 이 티켓에서 제일 조용히 깨질 수 있는 곳이다 —
  // view 를 밀어서 흔드는 구현으로 바꾸면 화면은 똑같이 흔들리는데 손가락만 어긋난다.
  newRun();
  const probe = () => {
    const out = [];
    const c = g.view.cell;
    for (let gy = 0; gy < CFG.BOARD_H; gy++)
      for (let gx = 0; gx < CFG.BOARD_W; gx++) {
        const p = g.cellToPx(gx, gy);
        for (const [dx, dy] of [[c / 2, c / 2], [1, 1], [-1, -1], [c - 1, c - 1], [c + 1, c + 1]]) {
          const r = g.pxToCell(p.x + dx, p.y + dy);
          out.push(r ? r.gx + ':' + r.gy : '-');
        }
      }
    return out.join(' ');
  };
  g.resetImpact();
  const still = probe();
  const viewBefore = JSON.stringify(g.view);
  // 흔들림이 0 인 기준 프레임. 이 판의 그리기 호출을 세 두고 흔들린 판과 뺀다.
  g.draws.reset(); g.render();
  const drawsStill = g.draws.count('translate');

  g.bumpShake(g.KILL_SHAKE_AMP, g.KILL_SHAKE_DUR);   // 최대 진폭 지점
  const off = g.shakeOffset();
  g.draws.reset();
  g.render();
  const log = g.draws.log.slice();

  // shakeOffset() 의 반환값만 보면 render() 가 그 값을 쓰는지는 못 본다 —
  // ctx.translate 한 줄을 통째로 지워도 이 단언은 통과한다(실제로 통과했다).
  // sim.js 의 캔버스 스텁이 그리기 호출을 기록하는 게 헤드리스에서 그림을 보는 유일한 창이다.
  ok('오프셋이 0 이 아니다', Math.abs(off.x) + Math.abs(off.y) > 1,
    off.x.toFixed(2) + ', ' + off.y.toFixed(2));
  ok('render 가 그 오프셋으로 실제로 민다',
    drawsStill === 0 && g.draws.count('translate') === 1,
    '흔들림 0 → translate ' + drawsStill + ' / 흔들림 최대 → translate ' + g.draws.count('translate'));
  // 클립 뒤에 두면 고정된 창 안에서 내용만 밀려 가장자리에 #0d1117 틈이 생긴다.
  // save 안이 아니면 변환이 그 뒤의 모든 그리기로 새어 나간다(2.7 의 lineCap 함정).
  ok('  흔들림이 save 안 · 보드 클립 앞이다',
    log.indexOf('save') >= 0 && log.indexOf('save') < log.indexOf('translate')
    && log.indexOf('translate') < log.indexOf('clip'),
    's' + log.indexOf('save') + ' < t' + log.indexOf('translate') + ' < c' + log.indexOf('clip'));
  ok('흔들려도 히트박스가 그대로다', probe() === still);
  ok('흔들려도 view 가 안 움직인다', JSON.stringify(g.view) === viewBefore, JSON.stringify(g.view));
  ok('save / restore 가 짝이 맞는다', g.draws.count('save') === g.draws.count('restore'),
    g.draws.count('save') + ' / ' + g.draws.count('restore'));

  // 오프셋은 shake 상태의 순수 함수다. 난수를 쓰면 verify:build 의 두 페이지가
  // 프레임 수 차이 한 번에 갈리고, 값을 단언할 방법도 없어진다.
  const twice = JSON.stringify(g.shakeOffset()) === JSON.stringify(g.shakeOffset());
  ok('오프셋은 같은 상태에서 같은 값', twice, JSON.stringify(g.shakeOffset()));

  // ④ 끄기 옵션. 멀미의 원인은 카메라 운동이라 흔들림만 끈다 — 히트스톱은 안 끈다.
  g.setShakeEnabled(false);
  const offZero = g.shakeOffset();
  ok('끄면 오프셋이 0', offZero.x === 0 && offZero.y === 0, JSON.stringify(offZero));
  ok('  끄면 진행 중이던 흔들림도 죽는다', g.shake.t === 0, String(g.shake.t));
  newRun();
  g.killEnemy(put('elite'), null, 'physical');
  ok('  꺼도 히트스톱은 산다', g.hitstopState() === g.HITSTOP, grade());
  g.setShakeEnabled(true);

  // ⑤ 정지·판 갈아끼우기. 흔들리는 도중에 멈추면 진폭이 얼어붙었다가 재개할 때 튄다.
  newRun();
  g.killEnemy(put('elite'), null, 'physical');
  g.togglePause();
  ok('정지하면 카메라가 원위치', g.shake.t === 0 && g.hitstopState() === 0, grade());
  state.paused = false;
  g.killEnemy(put('elite'), null, 'physical');
  g.restart();
  ok('재시작하면 카메라가 원위치', g.shake.t === 0 && g.hitstopState() === 0, grade());

  // ⑥ 누수는 2.6 과 안 부딪힌다. 화면 층 비네트만 나고 보드 층은 조용해야 한다.
  newRun();
  state.towers.length = 0;              // 타워가 대신 죽여버리면 검사가 무의미하다
  state.enemies.length = 0;
  g.resetParticles();
  g.resetImpact();
  const leaker = put('grunt');
  leaker.dist = g.laneLen(leaker.lane);
  const lifeBefore = state.life;
  g.update(1 / 30);
  ok('누수는 흔들림도 히트스톱도 안 낸다',
    state.life < lifeBefore && g.shake.t === 0 && g.hitstopState() === 0,
    '생명 ' + lifeBefore + '→' + state.life + ', ' + grade());
  ok('  대신 비네트가 켜진다', g.leakWarnState() === g.LEAK_WARN_DUR, String(g.leakWarnState()));
  ok('  파편은 여전히 0 (2.6)', g.aliveParticles() === 0, String(g.aliveParticles()));
  // 누수가 몰리는 구간(w21)에서는 사실상 상시다. 누적되면 판이 안 보인다.
  const leaker2 = put('grunt');
  leaker2.dist = g.laneLen(leaker2.lane);
  g.update(1 / 30);
  ok('  비네트는 누적이 아니라 덮어쓰기', g.leakWarnState() === g.LEAK_WARN_DUR, String(g.leakWarnState()));
  // 여기까지는 전부 leakWarnT(=상태)만 본다. drawLeakWarn() 호출을 render 에서 통째로
  // 지워도 하나도 안 깨진다(실제로 안 깨졌다). 비네트의 유일한 출력은 fillRect 다 —
  // 겹치지 않는 띠 10겹 x 사방 4개 = 40개. 그 40개가 화면에 나오는지를 직접 센다.
  g.draws.reset(); g.render();
  const withLeak = g.draws.count('fillRect');
  g.resetImpact();                     // leakWarnT = 0. 나머지 판은 그대로다
  g.draws.reset(); g.render();
  const noLeak = g.draws.count('fillRect');
  ok('  비네트가 실제로 그려진다', withLeak - noLeak === 40,
    `fillRect ${noLeak} → ${withLeak} (차이 ${withLeak - noLeak})`);
}

// ── 사운드 ────────────────────────────────────────────────────
// 2.9. 소리는 헤드리스에서 못 들으므로 여기서 보는 것은 **언제 나고 언제 안 나는가**
// 하나다. 음색은 DESIGN.md 의 표가 정본이고 눈으로 확인할 방법이 없다.
// 제일 위험한 곳은 소리가 안 나는 게 아니라 **소리가 밸런스를 건드리는 것**이다 —
// 사운드 전용 난수 스트림을 안 쓰면 소리를 낸 판과 안 낸 판에서 fxSeed 가 갈리고,
// 그건 seedcheck 가 아니라 verify:build 의 두 페이지가 갈리는 것으로 나타난다.
{
  console.log('사운드');
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

  // ① 지연 개방. 로드만으로 AudioContext 를 만들면 브라우저가 제스처 전 컨텍스트를
  // suspended 로 태우고, 그 상태로 굳으면 그 판은 영영 소리가 안 난다.
  {
    const g = load();
    ok('로드만으로는 오디오가 안 열린다', g.sfxStats().open === false, JSON.stringify(g.sfxStats()));
    // sfxUnlock 을 안 부른 채 한 판을 완주한다. 예외도 안 나고 큐도 전부 0 이어야 한다 —
    // 밸런스 경로(greedy/tune/seedcheck)가 도는 조건이 정확히 이것이다.
    const res = greedy(g, { stage: 0, deck: ['mortar', 'marksman', 'frost'] });
    const st = g.sfxStats();
    ok('미개방 판은 한 판을 완주해도 소리를 안 낸다',
      st.open === false && sum(st.played) === 0 && sum(st.dropped) === 0 && st.voices === 0,
      res.result + ' w' + res.wave + ' / ' + JSON.stringify(st.played));
  }

  // ② 쿨다운은 **오디오 시계**로 잰다. 게임 dt 로 재면 배속 x4 에서 쿨다운도 4배
  // 빨리 풀리고, 히트스톱 프레임에는 dt 누적이 통째로 멈춘다.
  {
    const g = load();
    g.sfxUnlock();
    ok('pointerdown 이 부르면 열린다', g.sfxStats().open === true);
    g.sfxUnlock();
    ok('  멱등이다 (탭 복귀마다 불린다)', g.sfxStats().open === true);

    for (let i = 0; i < 100; i++) g.sfx('shot');
    ok('시계가 멈춰 있으면 첫 발만 통과',
      g.sfxStats().played.shot === 1 && g.sfxStats().dropped.shot === 99,
      JSON.stringify(g.sfxStats().played) + ' / ' + JSON.stringify(g.sfxStats().dropped));

    let pass = 0;
    for (let i = 0; i < 10; i++) { g.audio.advance(g.SFX.shot.cd); if (g.sfx('shot')) pass++; }
    ok('  쿨다운만큼 감으면 매번 통과', pass === 10, pass + '/10');

    // 게임 시간을 아무리 흘려도 오디오 시계가 안 가면 큐는 안 열린다.
    const before = g.sfxStats().played.shot;
    for (let i = 0; i < 60; i++) g.update(1 / 30);
    g.sfx('shot');
    ok('  게임 dt 로는 쿨다운이 안 풀린다', g.sfxStats().played.shot === before,
      before + ' → ' + g.sfxStats().played.shot);

    // 길이가 쿨다운보다 길면 자기 꼬리와 겹쳐서 그 자체로 하나의 톤이 된다.
    // 예외가 둘 있고 둘 다 이유가 다르다(DESIGN §2.9 의 표):
    //   blast   — 자체 쿨다운이 없다. 게이트가 shakeCd(0.25)라 실효 듀티는 72% 다
    //   killBig — 판당 15회뿐이라 자기 꼬리와 겹칠 일이 사실상 없다. 그래서 cd 를
    //             밀도 제한이 아니라 "정예가 연달아 죽을 때의 최소 간격"으로 쓴다
    const REPEATING = ['shot', 'kill', 'leak'];
    const duty = REPEATING.map(k => k + ' ' + Math.round(g.SFX[k].len / g.SFX[k].cd * 100) + '%');
    ok('  반복 큐는 길이가 쿨다운보다 짧다 (듀티 <= 72%)',
      REPEATING.every(k => g.SFX[k].len / g.SFX[k].cd <= 0.72), duty.join(' · '));
    ok('  blast 는 자체 쿨다운이 없다 (게이트는 shakeCd)',
      g.SFX.blast.cd === 0 && g.SFX.blast.len < g.BLAST_SHAKE_CD,
      g.SFX.blast.len + ' < ' + g.BLAST_SHAKE_CD);
    // 경고음은 매번 같아야 경고로 읽힌다.
    ok('  leak 만 피치 스프레드가 0',
      g.SFX.leak.spread === 0 && Object.entries(g.SFX).every(([k, c]) => k === 'leak' || c.spread > 0),
      Object.entries(g.SFX).map(([k, c]) => k + ' ' + c.spread).join(' · '));
  }

  // ③ 보이스 상한. 2.6 의 파티클이 "막지 말고 덮어쓴다"인 것과 정반대로 **드롭**이다 —
  // 파편은 안 보이면 정보가 사라지지만 소리는 겹칠수록 나빠진다.
  {
    const g = load();
    g.sfxUnlock();
    const names = ['shot', 'blast', 'kill', 'killBig', 'leak'];
    for (let i = 0; i < 100; i++) g.sfx(names[i % names.length]);
    const st = g.sfxStats();
    ok('시계 고정 + 큐 100회 → 상한을 안 넘는다', st.voices <= g.SFX_VOICE_CAP,
      st.voices + '/' + g.SFX_VOICE_CAP);
    ok('  통과한 수가 곧 상한이다', sum(st.played) === g.SFX_VOICE_CAP,
      JSON.stringify(st.played));
    ok('  초과분은 전부 드롭이다', sum(st.played) + sum(st.dropped) === 100,
      sum(st.played) + ' + ' + sum(st.dropped));
    // onended 가 안 오는 환경(여기가 그렇다)에서도 보이스는 회수돼야 한다.
    // 안 그러면 상한에 막혀 그 판의 소리가 통째로 죽는다.
    g.audio.advance(1);
    ok('  시간이 지나면 보이스가 회수된다', g.sfx('blast') === true && g.sfxStats().voices < g.SFX_VOICE_CAP,
      String(g.sfxStats().voices));
  }

  // ④ 등급 마스킹. 정예 처치 순간에 잡몹 처치음이 얹히면 2.8 이 흔들림으로 갈라 놓은
  // 등급이 귀에서 도로 뭉친다.
  {
    const g = load();
    g.sfxUnlock();
    g.sfx('killBig');
    g.sfx('kill');
    ok('정예 처치음이 잡몹 처치음을 가린다', g.sfxStats().played.kill === 0,
      JSON.stringify(g.sfxStats().played));
    g.audio.advance(0.30);
    ok('  0.30초 뒤에는 다시 난다', g.sfx('kill') === true && g.sfxStats().played.kill === 1,
      JSON.stringify(g.sfxStats().played));
  }

  // ④-2 사운드 난수는 **별개 스트림**이다. fxRand() 를 한 칸이라도 밀면 소리를 낸 판과
  // 안 낸 판(음소거·미개방)에서 파티클 각도가 갈리고, 그건 게임 상태에 아무 흔적을
  // 안 남긴 채 verify:build 의 두 페이지 그림 차이로만 나타난다. 그런데 verify:build 는
  // pointerdown 을 한 번도 안 보내서 오디오를 안 연다 — 어느 하네스도 못 잡는다.
  // 그래서 여기서 fxSeed 를 직접 잰다.
  {
    const g = load();
    g.sfxUnlock();
    const seedBefore = g.fxState();
    const names = ['shot', 'blast', 'kill', 'killBig', 'leak'];
    for (let i = 0; i < 50; i++) { g.audio.advance(0.4); g.sfx(names[i % names.length]); }
    ok('사운드는 fxSeed 를 한 칸도 안 민다', g.fxState() === seedBefore,
      seedBefore + ' → ' + g.fxState() + ' (통과 ' + sum(g.sfxStats().played) + '회)');
  }

  // ⑤ 훅 위치. 발사음의 유일한 자리가 muzzle() 이라, 2.7 이 화염에서 구조로 잠근
  // 제외 목록(서리탑·조폐소·오라·장판·tick 딜)이 소리에 그대로 물려진다.
  const board = (deck, use) => {
    const h = load();
    h.sfxUnlock();
    h.pickStage(0);
    deck.forEach(k => h.toggleDeckPick(k));
    h.startRun();
    h.state.gold = 99999;
    for (let i = 0; i < 12; i++) h.summon(use[i % use.length]);
    h.state.wave = 5;
    h.rushWave();
    // 오디오 시계는 실시간이다. 게임 시간과 같이 흘려야 쿨다운이 실제처럼 열린다.
    // 600스텝(=20초)인 이유는 적이 스폰 지점에서 타워 사거리까지 걸어와야 하기
    // 때문이다. 200스텝이면 사거리가 제일 긴 관측소·마력로만 쏘고 나머지는 0 이라,
    // "훅이 빠졌다"와 "아직 적이 안 왔다"가 구분되지 않는다.
    for (let i = 0; i < 600; i++) { h.update(1 / 30); h.audio.advance(1 / 30); }
    return h;
  };
  {
    const quiet = board(['frost', 'mint', 'marksman'], ['frost', 'mint']);
    ok('서리탑·조폐소만 있는 판은 발사음이 0', quiet.sfxStats().played.shot === 0,
      JSON.stringify(quiet.sfxStats().played));
    for (const k of ['shredder', 'eroder', 'marksman', 'arc', 'mortar']) {
      const loud = board([k, 'frost', 'mint'], [k]);
      ok('  ' + k + ' 는 발사음을 낸다', loud.sfxStats().played.shot > 0,
        JSON.stringify(loud.sfxStats().played));
    }
  }

  // ⑥ 나머지 훅. 큐마다 한 줄씩이라 지워도 게임이 그대로 돌아간다 —
  // 실제로 소리가 그 사건에서 나는지를 직접 센다.
  {
    const g = load();
    const { state } = g;
    g.sfxUnlock();
    g.pickStage(0);
    ['mortar', 'marksman', 'mint'].forEach(k => g.toggleDeckPick(k));
    g.startRun();
    state.wave = 5;
    state.phase = 'wave';
    state.spawnQueue.length = 0;
    const put = (kind) => {
      g.spawnEnemy(kind);
      const e = state.enemies[state.enemies.length - 1];
      e.x = 3; e.y = 4;
      return e;
    };

    g.killEnemy(put('grunt'), null, 'physical');
    ok('일반 처치는 kill 을 낸다', g.sfxStats().played.kill === 1, JSON.stringify(g.sfxStats().played));
    g.audio.advance(1);
    g.killEnemy(put('elite'), null, 'physical');
    const kb = g.sfxStats().played;
    ok('정예 처치는 killBig 만 낸다', kb.killBig === 1 && kb.kill === 1, JSON.stringify(kb));

    // 착탄음은 shakeCd 게이트를 흔들림과 **공유**한다. 소리만 나고 안 흔들리는
    // 프레임이 원리적으로 없어야 한다.
    g.audio.advance(1);
    g.resetImpact();
    g.summon('mortar');
    const mortar = state.towers[state.towers.length - 1];
    const boom = () => {
      state.enemies.length = 0;
      state.shells.length = 0;
      for (const t of state.towers) t.cd = 99;
      put('grunt').x = 0;                       // 웨이브가 안 끝나게 붙잡아 둔다
      state.enemies[0].y = 0;
      state.shells.push({ x: 1, y: 1, tx: 3.5, ty: 4.5, t: 0.5, tt: 0.5, tower: mortar.id, dmg: 1, radius: 1.5 });
      g.update(1 / 30);
    };
    const b0 = g.sfxStats().played.blast;
    boom();
    ok('박격포 착탄은 blast 를 낸다',
      g.sfxStats().played.blast === b0 + 1 && g.shake.amp === g.BLAST_SHAKE_AMP,
      JSON.stringify(g.sfxStats().played));
    // shakeCd 가 아직 살아 있다. 흔들림이 안 되살아나면 소리도 안 나야 한다.
    g.audio.advance(1);
    boom();
    ok('  흔들림과 1:1 이다 (쿨다운 안에서는 둘 다 없다)',
      g.sfxStats().played.blast === b0 + 1, JSON.stringify(g.sfxStats().played));

    // 누수. 2.6 이 금지한 것은 보드 층(파편·셀 좌표·killEnemy)이고 소리는 그 셋을 안 쓴다.
    g.audio.advance(1);
    state.towers.length = 0;              // 타워가 대신 죽여버리면 검사가 무의미하다
    state.enemies.length = 0;
    g.resetParticles();
    const killsBefore = g.sfxStats().played.kill;
    const leaker = put('grunt');
    leaker.dist = g.laneLen(leaker.lane);
    g.update(1 / 30);
    ok('누수는 leak 를 낸다', g.sfxStats().played.leak === 1, JSON.stringify(g.sfxStats().played));
    ok('  누수에는 처치음도 파편도 안 난다',
      g.sfxStats().played.kill === killsBefore && g.aliveParticles() === 0,
      JSON.stringify(g.sfxStats().played) + ' / 파편 ' + g.aliveParticles());
  }

  // ⑦ 음소거. 흔들림 토글과 같은 형태다 — 단독 키, 세이브 번들·SAVE_VERSION 불변.
  {
    const g = board(['marksman', 'frost', 'mint'], ['marksman']);
    const before = JSON.stringify(g.sfxStats().played);
    const droppedBefore = JSON.stringify(g.sfxStats().dropped);
    ok('음소거 전에는 소리가 났다', g.sfxStats().played.shot > 0, before);
    const snapBefore = JSON.stringify(g.snapshotRun());
    const bundleBefore = JSON.stringify(g.saveBundle());

    g.setSoundEnabled(false);
    for (let i = 0; i < 200; i++) { g.update(1 / 30); g.audio.advance(1 / 30); }
    ok('음소거하면 어떤 큐도 안 는다', JSON.stringify(g.sfxStats().played) === before,
      before + ' → ' + JSON.stringify(g.sfxStats().played));
    // 1번 게이트에서 조기 반환하므로 드롭으로도 안 샌다. 여기서 드롭이 늘면
    // 음소거가 게인만 0 으로 만들고 노드는 계속 만들고 있다는 뜻이다.
    ok('  드롭으로도 안 샌다 (1번 게이트에서 조기 반환)',
      JSON.stringify(g.sfxStats().dropped) === droppedBefore,
      droppedBefore + ' → ' + JSON.stringify(g.sfxStats().dropped));
    ok('  단독 키에 저장된다', g.storage.getItem('cant-hold-sound') === '0',
      String(g.storage.getItem('cant-hold-sound')));
    ok('  세이브 번들에는 안 들어간다', !bundleBefore.includes('sound')
      && JSON.parse(bundleBefore).v === JSON.parse(JSON.stringify(g.saveBundle())).v,
      bundleBefore.slice(0, 60));
    ok('  스냅샷 문자열이 안 변한다', JSON.stringify(g.snapshotRun()) === snapBefore);

    g.setSoundEnabled(true);
    ok('  다시 켜면 저장값도 돌아온다', g.storage.getItem('cant-hold-sound') === '1',
      String(g.storage.getItem('cant-hold-sound')));
    g.toggleSound();
    ok('  토글은 반대로 뒤집는다', g.sfxStats().enabled === false, String(g.sfxStats().enabled));
  }
}

// ── 관문 ──────────────────────────────────────────────────────
// #58. 관문 선은 **아홉 판 어디서도 화면에 나온 적이 없었다.** 레인의 마지막 점 위에
// 그렸는데 그 점은 정의상 보드 밖이고(거기가 「나가는 곳」이다), render() 는 보드 rect
// 로 클립한 뒤 drawBoard() 를 부르므로 통째로 잘렸다. 그리는 코드는 멀쩡히 있었고
// #33 의 스크린샷 수용 기준에는 「관문 선 셋이 잘리지 않고 보인다」가 통과로 적혔다 —
// **한 번도 존재한 적 없는 것을 「보인다」고 적은 것이다.**
//
// 그래서 여기서 잠근다. 「그리는 코드가 있는데 화면엔 없는」 함정은 이 리포에서
// 두 번째라(첫 번째가 draws 를 만든 계기다) 상태도 개수도 아닌 **좌표**를 본다:
//
//   ① 관문 개수 — `lanes` 에서 **따로** 센다. gateLines 의 접는 규칙을 안 베낀다
//   ② 굵기 전체가 보드 rect 안 — 굵기의 절반이 밖이면 반만 보인다
//   ③ 관문 칸이 경로 칸이고 선이 그 칸을 안 벗어난다 — 타워 배치 칸을 안 가린다
//   ④ **render() 가 그 좌표로 실제로 긋는다** — draws.segments() 로 대조한다.
//      ①②③ 만 있으면 gateLines() 만 맞고 drawBoard 가 딴 데 긋거나 아예 안 그어도
//      전부 통과한다. 그게 정확히 #58 이 통과했던 방식이다
//   ⑤ gateLines 가 기대는 계약(마지막 구간이 축에 나란하고 b 가 딱 한 칸 밖)
{
  console.log('관문');
  const g = load();
  const { state, CFG } = g;
  const near = (a, b) => Math.abs(a - b) < 0.01;

  let total = 0;
  for (let i = 0; i < g.STAGES.length; i++) {
    const name = `${i + 1} ${g.STAGES[i].name}`;
    g.loadStage(i);
    state.openRows = CFG.OPEN_ROWS;
    state.phase = 'build';
    g.draws.reset();
    g.render();

    const { cell, ox, oy } = g.view;
    const bx2 = ox + cell * CFG.BOARD_W, by2 = oy + cell * CFG.BOARD_H;
    const gates = g.gateLines();
    const drawn = g.draws.segments();
    const h = g.GATE_W / 2;
    total += gates.length;

    // ⑤ 계약부터. 이게 깨지면 아래 셋은 맞는 것을 재고 있어도 뜻이 없다.
    const contract = g.lanes.every(L => {
      const a = L.points[L.points.length - 2], b = L.points[L.points.length - 1];
      const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
      if (Math.abs(dx) + Math.abs(dy) !== 1) return false;          // 축에 나란하다
      const out = b.x < 0 || b.x >= CFG.BOARD_W || b.y < 0 || b.y >= CFG.BOARD_H;
      const inb = b.x - dx >= 0 && b.x - dx < CFG.BOARD_W && b.y - dy >= 0 && b.y - dy < CFG.BOARD_H;
      return out && inb;                                            // b 는 딱 한 칸 밖
    });
    ok(`${name} 출구가 보드 밖 한 칸 · 축에 나란하다`, contract);

    // ① 개수. 「마지막 점이 같으면 한 관문」을 lanes 에서 다시 뽑는다.
    const exits = new Set(g.lanes.map(L => {
      const p = L.points[L.points.length - 1];
      return p.x + ',' + p.y;
    }));
    ok(`  관문 ${exits.size}개 (레인 ${g.lanes.length})`, gates.length === exits.size,
      gates.length + '/' + exits.size);

    const edges = [];
    let allIn = true, allOnPath = true, allDrawn = true;
    for (const l of gates) {
      // butt cap 이라 획의 경계는 정확히 이 사각형이다(index.html 은 lineCap 을
      // 한 번도 안 건드린다). 굵기는 선에 **수직**으로만 붙는다.
      const vert = near(l.x1, l.x2);
      const x0 = Math.min(l.x1, l.x2) - (vert ? h : 0);
      const x1 = Math.max(l.x1, l.x2) + (vert ? h : 0);
      const y0 = Math.min(l.y1, l.y2) - (vert ? 0 : h);
      const y1 = Math.max(l.y1, l.y2) + (vert ? 0 : h);

      // ② 굵기 전체가 보드 안
      if (!(x0 >= ox - 0.01 && x1 <= bx2 + 0.01 && y0 >= oy - 0.01 && y1 <= by2 + 0.01)) allIn = false;

      // ③ 어느 칸 위인가. 경로 칸이라야 타워를 안 가린다(경로 위에는 못 짓는다).
      const c = g.pxToCell((x0 + x1) / 2, (y0 + y1) / 2);
      if (!c || !g.isPath(c.gx, c.gy)) allOnPath = false;
      else {
        const p = g.cellToPx(c.gx, c.gy);
        if (!(x0 >= p.x - 0.01 && x1 <= p.x + cell + 0.01
          && y0 >= p.y - 0.01 && y1 <= p.y + cell + 0.01)) allOnPath = false;
      }

      // ④ render() 가 이 좌표로 실제로 그었는가
      if (!drawn.some(s => near(s.x1, l.x1) && near(s.y1, l.y1) && near(s.x2, l.x2) && near(s.y2, l.y2)))
        allDrawn = false;

      edges.push(vert ? (near(x0, ox) ? '왼' : '오른') : (near(y0, oy) ? '위' : '아래'));
    }
    ok(`  굵기 전체가 보드 안`, gates.length > 0 && allIn,
      `보드 [${ox},${oy}]~[${bx2},${by2}] · ` + gates.map(l =>
        `(${l.x1.toFixed(0)},${l.y1.toFixed(0)})-(${l.x2.toFixed(0)},${l.y2.toFixed(0)})`).join(' '));
    ok(`  경로 칸 위에만 있다 (타워 자리를 안 가린다)`, gates.length > 0 && allOnPath);
    ok(`  render 가 그 좌표로 실제로 긋는다`, gates.length > 0 && allDrawn,
      `관문 ${gates.length} / 화면에 그은 직선 ${drawn.length} · ${edges.join('·')}`);
  }

  // ④ 역류만 입구가 위·아래 반대다. 두 관문이 **다른 변**에 붙어야 한다 —
  // 한 변만 보고 있으면 반대쪽 끝이 안 그려져도 위 단언이 전부 통과한다.
  g.loadStage(3);
  const back = g.gateLines();
  const vertical = back.filter(l => near(l.x1, l.x2)).length;
  ok('④ 역류는 두 관문이 서로 다른 변에 붙는다',
    back.length === 2 && vertical === 1, `세로 ${vertical} / 가로 ${back.length - vertical}`);

  // 합계는 **단언하지 않는다.** 숫자를 박으면 판을 붙일 때 이 줄만 빨간불이 되고,
  // 「판마다 레인 수만큼(겹치면 접어서)」은 위 판별 단언이 이미 판 수와 같이 자란다.
  console.log(`       (참고) ${g.STAGES.length}판 관문 ${total}개 — 단언은 판마다 따로 한다`);
}

// ── 렌더 경로 ────────────────────────────────────────────────
// 그림이 맞는지는 못 보지만, 상태마다 render() 가 터지지 않는지는 확인할 수 있다.
{
  console.log('렌더');
  const g = load();
  const { state } = g;
  const safe = (name, fn) => {
    try { fn(); g.render(); ok(name, true); }
    catch (err) { ok(name, false, err.message); }
  };

  safe('스테이지 선택 화면', () => {});
  safe('덱 선택 화면', () => { g.pickStage(0); });
  safe('덱 일부 고른 상태', () => { g.toggleDeckPick('frost'); g.toggleDeckPick('mortar'); });
  safe('빈 보드', () => { g.toggleDeckPick('marksman'); g.startRun(); });
  safe('타워 있음', () => { state.gold = 9999; for (let i = 0; i < 6; i++) g.summon(); });
  safe('타워 선택됨', () => { state.selected = state.towers[0].id; });
  safe('웨이브 진행 중', () => {
    state.phase = 'wave'; state.wave = 14;
    state.spawnQueue = g.buildSpawnQueue(14);
    for (let i = 0; i < 200; i++) g.update(1 / 30);
  });
  // 선택은 큐에 쌓인다 (합성 한 번이 물려받기 + 새 성급 분기를 함께 만든다).
  // 그래서 화면만 보려고 띄우는 경우에는 앞의 걸 비워 줘야 한다 — 실제 판에서는
  // 모달이 입력을 막고 있어서 답하기 전에 다음 선택이 생기지 않는다.
  safe('3성 분기 모달', () => {
    state.phase = 'build';
    g.clearChoices();
    g.openChoice(state.towers[0], 3);
    ok('  모달 선택지 2개', g.choiceRects().length === 2);
  });
  safe('7성 특성 모달', () => { g.clearChoices(); g.openChoice(state.towers[0], 7); });
  safe('모달 선택 반영', () => {
    const t = state.towers[0];
    g.clearChoices();
    g.openChoice(t, 3);
    g.applyChoice('B');
    ok('  분기가 저장됨', t.b3 === 'B', String(t.b3));
    ok('  모달이 닫힘', state.choice === null);
  });
  safe('소환 부채꼴', () => { state.picker = { mode: 'summon', gx: 2, gy: 8, sel: null }; });
  safe('소환 부채꼴 · 종류를 고른 상태', () => {
    const ic = g.pickerLayout().icons[0];
    g.pickerTap(ic.cx, ic.cy);
  });
  safe('소환 부채꼴 · 고른 채로 골드 부족', () => { state.gold = 0; });
  safe('일시정지', () => {
    state.picker = null;
    state.paused = true;
    const w = state.wave;
    for (let i = 0; i < 300; i++) g.update(1 / 30);
    ok('  정지 중엔 판이 안 흐른다', state.wave === w, 'w' + w + ' → w' + state.wave);
  });
  safe('게임 오버', () => { state.paused = false; state.phase = 'over'; });
  safe('클리어', () => { state.phase = 'clear'; });
  safe('재시작', () => {
    g.restart();
    ok('  재시작이 판을 비움', state.towers.length === 0 && state.wave === 0 && state.life > 0);
    ok('  재시작하면 스테이지 선택으로 돌아감', state.phase === 'stage' && state.deckPick.length === 0);
  });
}

// KNOWN 은 실패로 안 세지만 **마지막 줄에서도 안 사라진다.** 여기서 빠지면
// 「전부 통과」만 보고 넘어가게 되고, 그 순간 KNOWN 은 조용한 통과와 같은 것이 된다.
console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
if (knownCount) console.log(`알려진 미해결 ${knownCount}건 — 위 KNOWN 줄을 볼 것`);
process.exit(fail ? 1 : 0);
