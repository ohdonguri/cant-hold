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

  // 경로 칸에는 못 짓는다
  state.openRows = g.CFG.BOARD_H;
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
  e4.slowNext = 0.95;   // 오라 여러 개가 겹친 상황
  e4.slowAmt = Math.min(g.CFG.SLOW_CAP, e4.slowNext);
  ok('슬로우 상한 60%', Math.abs(e4.slowAmt - g.CFG.SLOW_CAP) < 1e-9, e4.slowAmt.toFixed(2));
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

  // 조폐소는 5성이어도 1칸
  state.towers.length = 0;
  state.choice = null;
  const e = put('mint', 4, 1, 7), f = put('mint', 4, 2, 7);
  const mint5 = g.mergeTowers(e, f);
  ok('조폐소 5성은 1칸 유지', mint5 && g.towerFootprint(mint5) === 1);
}

// ── 마력로 조준 ───────────────────────────────────────────────
// 마력로는 사거리 원이 아니라 고정된 직선으로 쏜다. 원 안에 있다고 쏘면
// 선에서 벗어난 적 때문에 허공에 계속 발사한다.
{
  console.log('마력로 조준');
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
  t.star = 4;              // 5성이면 2x2 라 중심이 바뀐다. 조준각은 배치 시점 기준이다.
  const size = g.towerFootprint(t);
  const c = { x: t.gx + size / 2, y: t.gy + size / 2 };
  const r = g.towerRange(t);

  // 적을 한자리에 붙잡아 두고 누적 피해를 잰다.
  // 프레임마다 HP 를 되돌리므로 합산해야 한다 — 마지막 프레임만 보면
  // 쿨다운 때문에 0 이 나온다.
  const run = (place) => {
    state.enemies.length = 0;
    state.beams.length = 0;
    g.spawnEnemy('grunt');
    const e = state.enemies[0];
    e.maxHp = 1e9;
    place(e);
    const x0 = e.x, y0 = e.y;
    let dealt = 0, shots = 0;
    for (let i = 0; i < 300; i++) {
      e.hp = 1e9; e.x = x0; e.y = y0;
      const before = state.beams.length;
      g.update(1 / 30);
      dealt += 1e9 - e.hp;
      if (state.beams.length > before) shots++;
    }
    return { shots, dealt };
  };

  // 직선 위
  const on = run(e => {
    e.x = c.x + Math.cos(t.angle) * (r * 0.5) - 0.5;
    e.y = c.y + Math.sin(t.angle) * (r * 0.5) - 0.5;
  });
  ok('직선 위 적은 맞는다', on.dealt > 0, Math.round(on.dealt) + ' 딜');

  // 사거리 안이지만 직선에서 벗어남
  const off = run(e => {
    const perp = t.angle + Math.PI / 2;
    e.x = c.x + Math.cos(perp) * 2 - 0.5;
    e.y = c.y + Math.sin(perp) * 2 - 0.5;
  });
  ok('선 밖 적에겐 안 쏜다', off.shots === 0 && off.dealt === 0, off.shots + '발 / ' + Math.round(off.dealt) + ' 딜');

  // 사거리 밖
  const far = run(e => {
    e.x = c.x + Math.cos(t.angle) * (r + 3) - 0.5;
    e.y = c.y + Math.sin(t.angle) * (r + 3) - 0.5;
  });
  ok('사거리 밖은 안 맞는다', far.dealt === 0, Math.round(far.dealt) + ' 딜');

  // 조준각은 경로를 향해야 한다
  const dx = Math.cos(t.angle), dy = Math.sin(t.angle);
  let onPath = 0;
  for (let d = 0.25; d <= r; d += 0.25)
    if (g.isPath(Math.floor(c.x + dx * d), Math.floor(c.y + dy * d))) onPath++;
  ok('조준선이 경로를 지난다', onPath > 0, onPath + '개 지점');
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
