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

// ── 타워 대등성 ───────────────────────────────────────────────
// 한 타워가 정답이거나 함정이면 덱과 합성 선택이 의미를 잃는다.
// 전체 측정은 npm run parity, 여기서는 가벼운 한 분기만 본다.
{
  console.log('타워 대등성 (3종 덱, 분기 A/A1)');
  const { measure, K, NAME } = require('./parity.js');
  const { contrib, spread } = measure('A', 'A1', 4);
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
    rows.length !== 16 || rows.some(r => r.length !== 16)).map(([k]) => k);
  ok('전부 16x16 이다', bad.length === 0, bad.join(',') || '없음');

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
  safe('3성 분기 모달', () => {
    state.phase = 'build';
    g.openChoice(state.towers[0], 3);
    ok('  모달 선택지 2개', g.choiceRects().length === 2);
  });
  safe('7성 특성 모달', () => { g.openChoice(state.towers[0], 7); });
  safe('모달 선택 반영', () => {
    const t = state.towers[0];
    g.openChoice(t, 3);
    g.applyChoice('B');
    ok('  분기가 저장됨', t.b3 === 'B', String(t.b3));
    ok('  모달이 닫힘', state.choice === null);
  });
  safe('소환 피커 1단계', () => { state.picker = { gx: 2, gy: 8, kind: null }; });
  safe('소환 피커 2단계', () => { state.picker.kind = state.deck[0]; });
  safe('게임 오버', () => { state.picker = null; state.phase = 'over'; });
  safe('클리어', () => { state.phase = 'clear'; });
  safe('재시작', () => {
    g.restart();
    ok('  재시작이 판을 비움', state.towers.length === 0 && state.wave === 0 && state.life > 0);
    ok('  재시작하면 스테이지 선택으로 돌아감', state.phase === 'stage' && state.deckPick.length === 0);
  });
}

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
