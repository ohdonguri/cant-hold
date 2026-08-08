// 회귀 테스트. 렌더는 검증하지 않고 규칙과 밸런스만 본다.
const { load, greedy } = require('./sim.js');

let fail = 0;
function ok(name, cond, detail) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '   ' + detail : ''));
  if (!cond) fail++;
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

  // 웨이브 중에는 합칠 수 없다. 결과 타워가 자리를 옮기면
  // 오라 범위와 마력로 조준선이 한복판에서 흔들린다.
  state.towers.length = 0;
  state.choice = null;
  const w1 = put('marksman', 1, 2, 4), w2 = put('marksman', 1, 3, 4);
  state.phase = 'wave';
  ok('웨이브 중엔 합성 불가', !g.canMerge(w1, w2) && g.mergeTowers(w1, w2) === null);
  ok('타워가 그대로 남는다', state.towers.length === 2, String(state.towers.length));
  state.phase = 'build';
  ok('준비 단계로 오면 다시 된다', g.canMerge(w1, w2));

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

  state.phase = 'wave';
  ok('웨이브 중엔 안내 안 뜬다', g.mergeablePair() === null);
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
  ok('카드가 스테이지 수만큼', g.stageCardRects().length === g.STAGES.length);

  g.pickStage(1);
  ok('잠긴 스테이지는 못 고름', state.phase === 'stage', state.phase);

  g.pickStage(0);
  ok('열린 스테이지는 골라진다', state.phase === 'deck');
  ok('맵이 실려 있다', g.lanes.length >= 1 && g.pathCells.size > 0,
    '레인 ' + g.lanes.length + ', 경로칸 ' + g.pathCells.size);

  // 스테이지마다 맵과 규칙이 실제로 다른지
  const seen = new Set();
  for (let i = 0; i < g.STAGES.length; i++) {
    g.loadStage(i);
    seen.add([...g.pathCells].sort().join('|') + '#' + g.lanes.length);
  }
  ok('스테이지마다 맵이 다르다', seen.size === g.STAGES.length, seen.size + '/' + g.STAGES.length);

  // 후반 스테이지는 레인이 여러 개
  g.loadStage(g.STAGES.length - 1);
  ok('마지막 스테이지는 다중 레인', g.lanes.length > 1, String(g.lanes.length));
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

// ── 빈 칸 소환 (2단계) ────────────────────────────────────────
{
  console.log('빈 칸 소환');
  const g = load();
  const { state } = g;
  g.pickStage(0);
  ['shredder', 'marksman', 'arc'].forEach(k => g.toggleDeckPick(k));
  g.startRun();
  state.gold = 500;

  // 빈 칸을 골라 피커를 연다
  const occ = g.occupancy();
  let spot = null;
  for (let y = g.firstOpenRow(); y < g.CFG.BOARD_H && !spot; y++)
    for (let x = 0; x < g.CFG.BOARD_W && !spot; x++)
      if (g.canPlace(x, y, 1, occ)) spot = { gx: x, gy: y };

  state.picker = { ...spot, kind: null };
  ok('1단계엔 배치 버튼이 없다', g.pickerLayout().actions.length === 0);
  ok('카드가 덱 수만큼', g.pickerRects().length === g.CFG.DECK_SIZE);

  // 카드 하나를 고른다
  const card = g.pickerRects()[0];
  const hit = g.pickerHit(card.x + 5, card.y + 5);
  ok('카드가 눌린다', hit && hit.k === card.k, hit ? String(hit.k) : 'null');
  state.picker.kind = card.k;
  ok('2단계엔 배치/취소가 뜬다', g.pickerLayout().actions.length === 2);
  ok('고르기만 해선 안 지어진다', state.towers.length === 0, String(state.towers.length));

  // 취소
  const cancel = g.pickerLayout().actions.find(a => a.act === 'cancel');
  ok('취소 버튼이 잡힌다', g.pickerHit(cancel.x + 5, cancel.y + 5).act === 'cancel');

  // 배치
  const place = g.pickerLayout().actions.find(a => a.act === 'place');
  ok('배치 버튼이 잡힌다', g.pickerHit(place.x + 5, place.y + 5).act === 'place');
  const before = state.gold;
  g.summon(state.picker.kind, spot.gx, spot.gy);
  ok('배치하면 그 칸에 생긴다',
    state.towers.length === 1 && state.towers[0].gx === spot.gx && state.towers[0].gy === spot.gy,
    state.towers.length ? state.towers[0].gx + ',' + state.towers[0].gy : 'none');
  ok('골드가 나간다', state.gold < before, before + ' -> ' + state.gold);
}

// ── 밸런스 ────────────────────────────────────────────────────
// 스테이지는 깨야 다음이 열리므로 "그리디가 절대 못 깬다"가 목표가 아니다.
// 1스테이지는 대충 해도 깨지고, 뒤로 갈수록 안 깨져야 한다.
{
  console.log('밸런스 (스테이지 곡선, 각 8회)');
  const DECK = ['shredder', 'arc', 'mint'];
  const rows = [];
  const n = 8;
  for (let st = 0; st < load().STAGES.length; st++) {
    const w = [];
    let clears = 0, five = 0;
    for (let i = 0; i < n; i++) {
      const g = load();
      const r = greedy(g, { stage: st, deck: DECK });
      if (r.result === 'clear') clears++;
      if (r.maxStar >= 5) five++;
      w.push(r.result === 'clear' ? g.CFG.WAVE_MAX : r.wave);
    }
    w.sort((a, b) => a - b);
    rows.push({ st, clears, med: w[n >> 1], w, five });
  }

  for (const r of rows) console.log('    S' + (r.st + 1) + '  클리어 ' + r.clears + '/' + n + '  중앙 w' + r.med);

  ok('1스테이지는 대충 해도 깨진다', rows[0].clears >= 4, rows[0].clears + '/' + n);
  ok('마지막 스테이지는 안 깨진다', rows[rows.length - 1].clears <= 1, rows[rows.length - 1].clears + '/' + n);
  ok('뒤 스테이지가 더 어렵다', rows[0].clears > rows[rows.length - 1].clears);
  ok('어느 스테이지도 초반 전멸은 없다', rows.every(r => r.w[0] >= Math.min(10, r.med)),
    rows.map(r => 'S' + (r.st + 1) + ':' + r.w[0]).join(' '));
  ok('5성 도달률 90% 이상', rows.every(r => r.five / n >= 0.9),
    rows.map(r => r.five + '/' + n).join(' '));
  ok('HP/데미지에 NaN 없음', rows.every(r => r.w.every(v => Number.isFinite(v))));
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
  ok('최고 기록은 칸마다 큰 쪽', merged.best.join(',') === '20,25,0,0', merged.best.join(','));
  ok('이어할 판은 더 나아간 쪽', merged.run.stage === 1, 'stage ' + merged.run.stage);
}

// ── 타워 대등성 ───────────────────────────────────────────────
// 한 타워가 정답이거나 함정이면 덱과 합성 선택이 의미를 잃는다.
// 전체 측정은 npm run parity, 여기서는 가벼운 한 분기만 본다.
{
  console.log('타워 대등성 (3종 덱, 분기 A/A1)');
  const { measure, K, NAME } = require('./parity.js');
  // measure() 는 전역 Math.random 을 쓴다. 그대로 두면 35개 덱 × 7시행이 매번 다른
  // 판을 굴려 폭이 2.9~6.1 로 흔들렸다 — 임계 6 을 6~7% 확률로 넘어 무고한 PR 이
  // 반려됐고, 더 나쁘게는 진짜 회귀가 「아 그 불안정한 거」로 넘어갔다. 시행을 늘려도
  // 안 줄어든다(같은 시드 7/12/20 시행 = 4.95/3.99/4.67). 노이즈가 아니라 시드가
  // 판을 가르는 것이므로 답은 시드 고정이다.
  //
  // 12345 는 seedcheck·verify-build·shot·아래 「파편 예산」과 같은 값이다. 이 시드의
  // 여유는 4.95 대 6 으로 1.05 뿐인데, 좁다고 시드를 바꾸지 마라. 15개 시드 중앙값이
  // 4.37 이라 12345 는 특이값이 아니고, 여유가 큰 시드(99991=3.28, 123=2.85)를 골라
  // 앉히는 건 그만큼 감도를 버리는 것이다.
  //
  // **이 단언이 깨지면 그건 불안정이 아니다.** 같은 코드면 매번 같은 값이 나오므로,
  // 값이 움직였다면 타워 기여도가 실제로 벌어진 것이다. 임계 6·3.5 나 시드를 손대서
  // 통과시키지 말고 `npm run parity` 로 네 분기 전체를 다시 재라. 대신 시드를 박은
  // 대가로 여기는 시드 공간을 훑지 않으니, 다른 시드에서만 벌어지는 불균형은 parity 가 맡는다.
  const orig = Math.random;
  let s = 12345 >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  let contrib, spread;
  try {
    ({ contrib, spread } = measure('A', 'A1', 7));
  } finally {
    Math.random = orig;                           // 안 되돌리면 뒤의 모든 블록이 조용히 바뀐다
  }
  ok('기여도 폭 6 미만', spread < 6,
    spread.toFixed(2) + '  ' + K.map(k => NAME[k] + (contrib[k] >= 0 ? '+' : '') + contrib[k].toFixed(1)).join(' '));
  const outlier = K.filter(k => Math.abs(contrib[k]) > 3.5).map(k => NAME[k]);
  ok('혼자 튀는 타워 없음', outlier.length === 0, outlier.join(',') || '없음');
}

// ── 스프라이트 ────────────────────────────────────────────────
// 이미지 파일 없이 문자열 도트를 캔버스에 굽는다.
{
  console.log('스프라이트');
  const g = load();
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
  safe('소환 피커 1단계', () => { state.picker = { gx: 2, gy: 8, kind: null }; });
  safe('소환 피커 2단계', () => { state.picker.kind = state.deck[0]; });
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

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
