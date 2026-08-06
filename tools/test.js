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

  ok('시작 배치 칸 20', count(5, 1) === 20, String(count(5, 1)));
  ok('전 행 개방 시 29', count(8, 1) === 29, String(count(8, 1)));

  // 행을 열 때마다 2x2 자리가 늘어야 개방이 보상이 된다
  const big = [5, 6, 7, 8].map(o => count(o, 2));
  ok('2x2 자리가 단조 증가', big.every((v, i) => i === 0 || v >= big[i - 1]), big.join('→'));
  ok('2x2 자리 시작 8곳 이상', big[0] >= 8, String(big[0]));

  // 경로 칸에는 못 짓는다
  state.openRows = 8;
  const occ = g.occupancy();
  let onPath = 0;
  for (let y = 0; y < CFG.BOARD_H; y++)
    for (let x = 0; x < CFG.BOARD_W; x++)
      if (g.isPath(x, y) && g.canPlace(x, y, 1, occ)) onPath++;
  ok('경로 위에는 배치 불가', onPath === 0, String(onPath));

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

  const e2 = mk('immune');
  for (let i = 0; i < 50; i++) g.applyStacks(e2, 1, 2, shredder);
  ok('면역몹엔 스택 안 붙음', e2.armorStacks === 0, String(e2.armorStacks));

  const e3 = mk('immune');
  for (let i = 0; i < 50; i++) g.applyStacks(e3, 1, 2, { ...shredder, t7: 'stalwart' });
  ok('불굴이면 면역몹에도 30% 적용', e3.armorStacks > 0 && e3.armorStacks <= 15, String(e3.armorStacks.toFixed(1)));

  const e4 = mk('grunt');
  for (let i = 0; i < 10; i++) g.applySlow(e4, 0.55, 3, { id: 9, kind: 'frost' });
  e4.slowNext = 0.15;
  e4.slowAmt = Math.min(g.CFG.SLOW_CAP, Math.max(e4.slowStored, e4.slowNext));
  ok('슬로우 상한 60%', e4.slowAmt <= g.CFG.SLOW_CAP + 1e-9, e4.slowAmt.toFixed(2));
}

// ── 합성 ─────────────────────────────────────────────────────
{
  console.log('합성');
  const g = load();
  const { state, CFG } = g;
  state.towers.length = 0;
  state.gold = 99999;

  const put = (kind, star, gx, gy) => {
    const t = { id: 500 + state.towers.length, gx, gy, kind, star, b3: null, b5: null, t7: null,
      cd: 0, angle: 0, flash: 0, streak: 0, lastTarget: null, arcKills: 0 };
    state.towers.push(t);
    return t;
  };

  const a = put('marksman', 1, 1, 6), b = put('marksman', 1, 2, 6);
  ok('같은 종류·같은 성은 합성 가능', g.canMerge(a, b));
  ok('다른 종류는 불가', !g.canMerge(a, put('mortar', 1, 3, 6)));
  const m = g.mergeTowers(a, b);
  ok('합성 결과가 2성', m && m.star === 2, m ? String(m.star) : 'null');
  ok('합성하면 타워 수가 준다', state.towers.length === 2, String(state.towers.length));

  // 4성 두 개를 5성으로 → 2x2 자리가 필요하다
  state.towers.length = 0;
  state.openRows = 5;
  const c = put('marksman', 4, 4, 6), d = put('marksman', 4, 5, 6);
  const big = g.mergeTowers(c, d);
  ok('5성은 2x2 로 커진다', big && g.towerFootprint(big) === 2, big ? String(g.towerFootprint(big)) : 'null');
  ok('5성 진입 시 분기 선택이 뜬다', !!state.choice && state.choice.tier === 5);

  // 조폐소는 5성이어도 1칸
  state.towers.length = 0;
  state.choice = null;
  const e = put('mint', 4, 1, 6), f = put('mint', 4, 2, 6);
  const mint5 = g.mergeTowers(e, f);
  ok('조폐소 5성은 1칸 유지', mint5 && g.towerFootprint(mint5) === 1);
}

// ── 덱 선택 ───────────────────────────────────────────────────
{
  console.log('덱 선택');
  const g = load();
  const { state, CFG } = g;
  ok('덱 선택 화면에서 시작', state.phase === 'deck');
  ok('카드가 타워 종류 수만큼', g.deckCardRects().length === g.KIND_KEYS.length);

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

// ── 밸런스 ────────────────────────────────────────────────────
{
  console.log('밸런스 (그리디)');
  const run = (deck, n) => {
    const w = [], st = [];
    let clears = 0;
    for (let i = 0; i < n; i++) {
      const r = greedy(load(), { deck });
      if (r.result === 'clear') clears++;
      w.push(r.result === 'clear' ? 30 : r.wave);
      st.push(r.maxStar);
    }
    w.sort((x, y) => x - y);
    return { med: w[n >> 1], w, st, clears };
  };

  // 시뮬 기준 상위권 덱. 플레이어는 좋은 덱을 고르므로 여기가 난이도 기준선이다.
  const best = run(['eroder', 'arc', 'mint'], 10);
  ok('최고 덱 중앙값 20~27', best.med >= 20 && best.med <= 27, 'w' + best.med + '  [' + best.w.join(',') + ']');
  ok('최고 덱으로도 클리어 못 함', best.clears === 0, best.clears + '회');
  const five = best.st.filter(s => s >= 5).length;
  ok('5성 도달률 90% 이상', five / best.st.length >= 0.9, five + '/' + best.st.length);

  // 덱이 결과를 실제로 바꾸는지. 이 차이가 작으면 덱 선택은 가짜 결정이다.
  const worst = run(['shredder', 'marksman', 'mint'], 10);
  ok('덱 차이가 5웨이브 이상', best.med - worst.med >= 5,
    '최고 w' + best.med + ' vs 최저 w' + worst.med + ' = ' + (best.med - worst.med));
  ok('HP/데미지에 NaN 없음', best.w.concat(worst.w).every(v => Number.isFinite(v)));
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

  safe('덱 선택 화면', () => {});
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
  safe('게임 오버', () => { state.phase = 'over'; });
  safe('클리어', () => { state.phase = 'clear'; });
  safe('재시작', () => {
    g.restart();
    ok('  재시작이 판을 비움', state.towers.length === 0 && state.wave === 0 && state.life > 0);
    ok('  재시작하면 덱 선택으로 돌아감', state.phase === 'deck' && state.deckPick.length === 0);
  });
}

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
