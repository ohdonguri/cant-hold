// 경로 후보 비교. index.html 의 STAGES 를 바꾸기 전에 여기서 먼저 재 본다.
//
// 보는 것:
//   길이      교전 시간. 짧으면 타워가 쏠 틈이 없다. 레인이 여럿이면 평균.
//   배치 칸   경로가 먹고 남은 칸. 개방 행 기준(시작) / 전체.
//   2x2 자리  5성을 놓을 수 있는 곳. 여기가 0 이면 게임이 성립하지 않는다.
//   커버 편차 칸마다 사거리 안에 들어오는 경로 칸 수의 편차.
//             0 에 가까우면 어디에 놓든 똑같다는 뜻이라 배치가 결정이 아니게 된다.
//
// 보드 크기는 후보마다 따로 준다. 7x10 이 아닌 맵을 재려고 열어 둔 것이고,
// 이 파일이 W/H 를 상수로 박아 두는 동안은 큰 맵 후보를 아예 못 쟀다.
//
// 실행: node tools/paths.js          큰 맵 후보 + 실제 스테이지 기준선
//       node tools/paths.js --all    7x10 초기 탐색 후보까지 전부

const RANGE = 2.2;   // 타워 사거리 중앙값. KINDS 의 range 2.0~4.5 중 오라군 기준

function cells(lanes) {
  const set = new Set();
  for (const path of lanes) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
      let x = a.x, y = a.y;
      set.add(x + ',' + y);
      let guard = 0;
      while ((x !== b.x || y !== b.y) && guard++ < 999) {
        x += dx; y += dy;
        set.add(x + ',' + y);
      }
    }
  }
  return set;
}

function laneLen(path) {
  let n = 0;
  for (let i = 0; i < path.length - 1; i++)
    n += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  return n;
}

function evaluate(cand) {
  const { w, h, open, lanes } = cand;
  const P = cells(lanes);
  const isPath = (x, y) => P.has(x + ',' + y);
  const inBoard = [...P].filter(k => {
    const [x, y] = k.split(',').map(Number);
    return x >= 0 && x < w && y >= 0 && y < h;
  });

  const free = (y0) => {
    const out = [];
    for (let y = y0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (!isPath(x, y)) out.push([x, y]);
    return out;
  };
  const big = (y0) => {
    let n = 0;
    for (let y = y0; y < h - 1; y++)
      for (let x = 0; x < w - 1; x++)
        if (!isPath(x, y) && !isPath(x + 1, y) && !isPath(x, y + 1) && !isPath(x + 1, y + 1)) n++;
    return n;
  };

  // 커버 편차를 두 번 잰다. 판이 시작할 때 놓을 수 있는 칸은 개방 행뿐이라
  // 「첫 배치가 결정인가」는 개방 행으로 재야 하고, 행이 다 열린 뒤의 판 모양은
  // 전체 행으로 재야 한다. DESIGN §스테이지 표의 값은 개방 행 기준이다.
  const spread = (spots) => {
    const cov = spots.map(([x, y]) =>
      inBoard.filter(k => {
        const [px, py] = k.split(',').map(Number);
        return Math.hypot(px - x, py - y) <= RANGE;
      }).length);
    const mean = cov.reduce((a, b) => a + b, 0) / cov.length;
    const sd = Math.sqrt(cov.reduce((s, v) => s + (v - mean) ** 2, 0) / cov.length);
    const sorted = cov.slice().sort((a, b) => a - b);
    return { sd, med: sorted[sorted.length >> 1], min: sorted[0], max: sorted[sorted.length - 1] };
  };
  const covOpen = spread(free(h - open));
  const covAll = spread(free(0));

  const lens = lanes.map(laneLen);
  return {
    w, h, open,
    lanes: lanes.length,
    path: inBoard.length,
    len: Math.round(lens.reduce((a, b) => a + b, 0) / lens.length),
    free6: free(h - open).length,
    freeAll: free(0).length,
    big6: big(h - open),
    bigAll: big(0),
    covMed: covOpen.med,
    covMin: covOpen.min,
    covMax: covOpen.max,
    sdOpen: covOpen.sd,
    sdAll: covAll.sd,
  };
}

const P = (x, y) => ({ x, y });

// 뱀 모양 경로를 보드 크기에서 만들어 낸다. 통로 간격은 3행 — DESIGN §스테이지가
// "간격 2행이면 남는 띠가 1행뿐이라 5성(2x2)을 아예 못 놓는다"고 재 둔 값이다.
// 큰 맵을 손으로 그리면 크기마다 편향이 섞여서 크기 효과만 따로 못 본다.
function serpentine(w, h, gap = 3) {
  const pts = [P(-1, 0)];
  let right = true;
  for (let y = 0; y < h; y += gap) {
    pts.push(P(right ? w - 1 : 0, y));
    const ny = y + gap;
    if (ny < h) pts.push(P(right ? w - 1 : 0, ny));
    else pts.push(P(right ? w - 1 : 0, h));   // 마지막은 보드 밖으로 뺀다
    right = !right;
  }
  return pts;
}

// 뱀 모양을 두 갈래로 쪼갠다. 중앙에서 갈라져 양옆을 돌고 아래에서 합류한다.
// 갈래길·역류가 그렇듯 레인이 갈리면 타워 실효 화력이 반토막 나므로,
// 큰 맵에서 덱을 늘릴 때 이 형태가 견디는지가 관건이다.
function forked(w, h) {
  const mid = Math.floor(w / 2);
  const q = Math.max(2, Math.floor(h / 4));
  return [
    [P(-1, 0), P(mid, 0), P(mid, q), P(0, q), P(0, h - q - 1), P(mid, h - q - 1), P(mid, h - 1), P(w - 1, h - 1), P(w - 1, h)],
    [P(-1, 0), P(mid, 0), P(mid, q), P(w - 1, q), P(w - 1, h - q - 1), P(mid, h - q - 1), P(mid, h - 1), P(w - 1, h - 1), P(w - 1, h)],
  ];
}

// ── 실제 스테이지. index.html 의 STAGES 에서 그대로 옮겼다. 기준선이다. ──
// 큰 맵 숫자는 이 네 줄과 견줘야 뜻이 생긴다.
const STAGES = [
  { name: '① 외곽 도로', w: 7, h: 10, open: 6, lanes: [
    [P(-1, 0), P(6, 0), P(6, 3), P(0, 3), P(0, 6), P(6, 6), P(6, 9), P(0, 9), P(0, 10)]] },
  { name: '② 이중 병목', w: 7, h: 10, open: 6, lanes: [
    [P(-1, 0), P(6, 0), P(6, 3), P(1, 3), P(1, 1), P(3, 1), P(3, 6), P(6, 6), P(6, 9), P(0, 9), P(0, 10)]] },
  { name: '③ 갈래길', w: 7, h: 10, open: 6, lanes: [
    [P(-1, 0), P(3, 0), P(3, 3), P(0, 3), P(0, 7), P(3, 7), P(3, 9), P(6, 9), P(6, 10)],
    [P(-1, 0), P(3, 0), P(3, 3), P(6, 3), P(6, 7), P(3, 7), P(3, 9), P(6, 9), P(6, 10)]] },
  { name: '④ 역류', w: 7, h: 10, open: 8, lanes: [
    [P(-1, 0), P(6, 0), P(6, 3), P(1, 3), P(1, 1), P(3, 1), P(3, 6), P(6, 6), P(6, 9), P(0, 9), P(0, 10)],
    [P(0, 10), P(0, 9), P(6, 9), P(6, 6), P(3, 6), P(3, 1), P(1, 1), P(1, 3), P(6, 3), P(6, 0), P(-1, 0)]] },
];

// ── 큰 맵 후보. 개방 행은 현행 비율(6/10)을 따라 round(h*0.6) 으로 둔다. ──
const OPEN_RATIO = 0.6;
const openRows = (h) => Math.round(h * OPEN_RATIO);

const BIG = [];
for (const [w, h] of [[7, 10], [8, 12], [9, 12], [9, 14], [10, 14], [11, 16], [12, 16]]) {
  BIG.push({ name: `뱀 ${w}x${h}`, w, h, open: openRows(h), lanes: [serpentine(w, h)] });
  BIG.push({ name: `갈래 ${w}x${h}`, w, h, open: openRows(h), lanes: forked(w, h) });
}

// ── 7x10 초기 탐색 후보. 스테이지 1·2 를 정할 때 쓴 것이라 결론이 이미 났다. ──
// --all 로만 찍는다. 지우지 않는 이유는 "나선은 안 된다" 같은 반례가 여기 있어서다.
const LEGACY = [
  { name: '촘촘한 통로 (2행)', w: 7, h: 10, open: 6, lanes: [[
    P(-1, 0), P(6, 0), P(6, 2), P(0, 2), P(0, 4), P(6, 4), P(6, 6), P(0, 6), P(0, 8), P(6, 8), P(6, 10)]] },
  { name: '나선', w: 7, h: 10, open: 6, lanes: [[
    P(-1, 0), P(6, 0), P(6, 9), P(0, 9), P(0, 2), P(4, 2), P(4, 7), P(2, 7), P(2, 4), P(2, 3)]] },
  { name: '대각 지그재그', w: 7, h: 10, open: 6, lanes: [[
    P(-1, 0), P(3, 0), P(6, 3), P(3, 6), P(6, 9), P(3, 9), P(0, 6), P(3, 3), P(0, 0), P(0, -1)]] },
  { name: '엇갈린 U', w: 7, h: 10, open: 6, lanes: [[
    P(-1, 1), P(5, 1), P(5, 4), P(1, 4), P(1, 7), P(6, 7), P(6, 9), P(0, 9), P(0, 10)]] },
  { name: '중앙 코어', w: 7, h: 10, open: 6, lanes: [[
    P(3, -1), P(3, 2), P(6, 2), P(6, 5), P(1, 5), P(1, 8), P(5, 8), P(5, 6), P(3, 6), P(3, 5)]] },
  { name: '비대칭 (위 성김/아래 촘촘)', w: 7, h: 10, open: 6, lanes: [[
    P(-1, 0), P(6, 0), P(6, 3), P(0, 3), P(0, 6), P(5, 6), P(5, 8), P(2, 8), P(2, 9), P(6, 9), P(6, 10)]] },
  { name: '갈고리', w: 7, h: 10, open: 6, lanes: [[
    P(-1, 1), P(6, 1), P(6, 4), P(2, 4), P(2, 2), P(4, 2), P(4, 7), P(0, 7), P(0, 9), P(6, 9), P(6, 10)]] },
  { name: '대각 + 주머니', w: 7, h: 10, open: 6, lanes: [[
    P(-1, 0), P(4, 0), P(6, 2), P(6, 4), P(2, 4), P(0, 6), P(0, 7), P(4, 7), P(6, 9), P(0, 9), P(0, 10)]] },
];

function table(title, cands) {
  console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(0, 60 - title.length)));
  console.log(
    '후보'.padEnd(22),
    '보드'.padStart(6), '레인', '경로', '길이',
    '배치(시작/전체)'.padStart(14), '2x2(시작/전체)'.padStart(13),
    '커버 중앙/최소~최대'.padStart(16), '편차(시작/전체)');
  const rows = cands.map(c => ({ name: c.name, ...evaluate(c) }));
  for (const r of rows) {
    console.log(
      r.name.padEnd(22),
      `${r.w}x${r.h}`.padStart(6),
      String(r.lanes).padStart(4),
      String(r.path).padStart(4),
      String(r.len).padStart(4),
      (r.free6 + '/' + r.freeAll).padStart(14),
      (r.big6 + '/' + r.bigAll).padStart(13),
      (r.covMed + '  ' + r.covMin + '~' + r.covMax).padStart(16),
      (r.sdOpen.toFixed(2) + '/' + r.sdAll.toFixed(2)).padStart(14),
    );
  }
  return rows;
}

// 판정. 하한 넷은 7x10 에서 뽑은 값이고 큰 맵에서도 하한이라 그대로 쓴다 —
// 넘치는 쪽(배치 칸이 40, 60 으로 가는 것)은 여기서 못 잡는다. 그건 골드가
// 정하는 문제라 시뮬(tools/tune.js)이 봐야 한다.
function verdict(rows) {
  console.log('\n판정 기준: 2x2(시작) 8 이상, 배치(시작) 20 이상, 길이 30 이상, 편차 1.5 이상');
  for (const r of rows) {
    const bad = [];
    if (r.big6 < 8) bad.push('2x2 부족');
    if (r.free6 < 20) bad.push('배치 칸 부족');
    if (r.len < 30) bad.push('경로 짧음');
    if (r.sdOpen < 1.5) bad.push('배치가 무의미');
    console.log(' ', r.name.padEnd(22), bad.length ? '✗ ' + bad.join(', ') : '○ 쓸 만함');
  }
  // 길이 하한 30 은 1레인에서 뽑은 값이다. 다레인은 레인당 길이가 짧아도
  // 적이 나뉘어 실효 화력이 반토막 나므로 같은 잣대가 아니다 — 실제로 ③ 갈래길이
  // 23 으로 이 기준에 걸린다(출시된 판이다). 다레인 후보의 '경로 짧음'은 참고만 할 것.
  console.log('  * 길이 30 은 1레인 기준. 다레인은 ③ 갈래길(23)도 걸리므로 이 줄만으로 버리지 말 것');
}

const all = process.argv.includes('--all');

const stageRows = table('실제 스테이지 (기준선)', STAGES);
const bigRows = table('큰 맵 후보 — 뱀(1레인) / 갈래(2레인)', BIG);
if (all) verdict(table('7x10 초기 탐색 (결론 남음)', LEGACY));

verdict([...stageRows, ...bigRows]);

// 배치 칸이 늘어난 배수. 덱을 늘리려면 소환 횟수가 늘어야 하고(CFG.DECK_SIZE 주석:
// 84소환/7종 = 종당 12개 < 5성에 필요한 16개), 그 상한 하나가 보드 넓이다.
console.log('\n── 현행 대비 배치 칸 (덱 크기를 늘릴 여지) ' + '─'.repeat(20));
const base = stageRows[1].free6;   // ② 이중 병목. 편차 1.87 로 현행 기준 맵
console.log(`기준 ② 이중 병목 배치(시작) ${base}칸`);
for (const r of bigRows)
  console.log(' ', r.name.padEnd(14), `${r.free6}칸`.padStart(6), `x${(r.free6 / base).toFixed(2)}`.padStart(7));
