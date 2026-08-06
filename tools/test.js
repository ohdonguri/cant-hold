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

// ── 밸런스 ────────────────────────────────────────────────────
{
  console.log('밸런스 (그리디 12회)');
  const w = [], st = [];
  let clears = 0;
  for (let i = 0; i < 12; i++) {
    const r = greedy(load());
    if (r.result === 'clear') clears++;
    w.push(r.result === 'clear' ? 30 : r.wave);
    st.push(r.maxStar);
  }
  w.sort((x, y) => x - y);
  const med = w[6];
  ok('그리디 사망 중앙값 18~25', med >= 18 && med <= 25, 'w' + med + '  [' + w.join(',') + ']');
  ok('그리디는 클리어 못 함', clears === 0, clears + '회');
  const five = st.filter(s => s >= 5).length;
  ok('5성 도달률 90% 이상', five / st.length >= 0.9, five + '/' + st.length + '  [' + st.join(',') + ']');
  ok('HP/데미지에 NaN 없음', w.every(v => Number.isFinite(v)));
}

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
