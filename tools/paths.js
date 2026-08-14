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

  // 레인을 **전부** 사거리 안에 넣는 배치 칸이 몇 곳인가. 편차는 「좋은 자리가
  // 갈리는가」를 재는 자라, 레인이 여럿일 때 **한 자리가 갈래를 다 덮어 버리는가**를
  // 못 잰다 — ⑤ 분수령은 개방 행 48칸 중 18칸(37.5%)이 두 레인을 다 덮어서, 레인이
  // 갈렸는데도 「어디를 막을까」가 1레인 판과 비슷해진다. 이 값이 0 에 가까우면
  // 갈래마다 따로 답해야 한다는 뜻이고, **레인을 늘린 판이 실제로 규칙을 바꿨는지를
  // 재는 유일한 기계 지표**다. 1레인 판에서는 정의상 배치 칸 전부라 볼 것이 없다.
  //
  // **개방 행은 `free(h - open)` 이다 — `y >= open` 이 아니다.** 9x14 · open 8 에서
  // 전자는 행 6~13(8줄) 이고 후자는 행 8~13(6줄) 이라, 잘못 걸면 분자와 분모가 같이
  // 작아져서 **비율까지 그럴듯하게 틀린다.** #42 기획 실측이 정확히 그렇게 나서
  // 3레인 후보를 「0/34」로 적었는데 실제로는 1/43 이었다(빠진 행 6 에 그 칸이 있다).
  const laneSets = lanes.map(path => [...cells([path])].filter(k => {
    const [x, y] = k.split(',').map(Number);
    return x >= 0 && x < w && y >= 0 && y < h;
  }).map(k => k.split(',').map(Number)));
  const coversAll = (spots) => spots.filter(([x, y]) =>
    laneSets.every(pts => pts.some(([px, py]) => Math.hypot(px - x, py - y) <= RANGE))).length;

  const lens = lanes.map(laneLen);
  return {
    w, h, open,
    lanes: lanes.length,
    path: inBoard.length,
    len: Math.round(lens.reduce((a, b) => a + b, 0) / lens.length),
    lens: lens.map(v => Math.round(v)),
    free6: free(h - open).length,
    freeAll: free(0).length,
    big6: big(h - open),
    bigAll: big(0),
    covMed: covOpen.med,
    covMin: covOpen.min,
    covMax: covOpen.max,
    sdOpen: covOpen.sd,
    sdAll: covAll.sd,
    allOpen: coversAll(free(h - open)),
    allAll: coversAll(free(0)),
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
  // 아래 「갈래 9x14」와 같은 줄이 나와야 한다. 좌표가 forked(9,14) 생성값 그대로라서
  // 그렇다 — 어긋나면 index.html 과 이 파일 중 한쪽만 고쳤다는 뜻이다.
  { name: '⑤ 분수령', w: 9, h: 14, open: 8, lanes: [
    [P(-1, 0), P(4, 0), P(4, 3), P(0, 3), P(0, 10), P(4, 10), P(4, 13), P(8, 13), P(8, 14)],
    [P(-1, 0), P(4, 0), P(4, 3), P(8, 3), P(8, 10), P(4, 10), P(4, 13), P(8, 13), P(8, 14)]] },
  // **아래 「갈래 10x14」를 그대로 쓰지 않았다.** 그 생성 후보는 ⑤ 를 크기만 바꿔
  // 찍는 것이라(「갈래 9x14」줄이 ⑤ 와 한 자리도 안 다른 것이 그 증거다) 그대로
  // 가져오면 ⑤ 의 복사판이 된다. 이 판은 **입구를 둘로 갈라** 공유 머리 구간을
  // 없앤 것이고, 그 차이가 「전레인동시」에 그대로 뜬다(⑤ 37.5% → 24.5%).
  { name: '⑥ 합수', w: 10, h: 14, open: 8, lanes: [
    [P(-1, 0), P(5, 0), P(5, 3), P(0, 3), P(0, 11), P(4, 11), P(4, 13), P(9, 13), P(9, 14)],
    [P(10, 1), P(3, 1), P(3, 3), P(9, 3), P(9, 11), P(4, 11), P(4, 13), P(9, 13), P(9, 14)]] },
];

// ── 큰 맵 후보. 개방 행은 현행 비율(6/10)을 따라 round(h*0.6) 으로 둔다. ──
const OPEN_RATIO = 0.6;
const openRows = (h) => Math.round(h * OPEN_RATIO);

const BIG = [];
for (const [w, h] of [[7, 10], [8, 12], [9, 12], [9, 14], [10, 14], [11, 16], [12, 16]]) {
  BIG.push({ name: `뱀 ${w}x${h}`, w, h, open: openRows(h), lanes: [serpentine(w, h)] });
  BIG.push({ name: `갈래 ${w}x${h}`, w, h, open: openRows(h), lanes: forked(w, h) });
}

// ── ⑥ 합수를 고르며 기각한 10x14 2레인 후보들. LEGACY 와 같은 이유로 남긴다.
// **여기서 배운 것 하나가 이 파일에 없던 자다: 「전레인동시」에는 바닥이 있다.**
// 이 표를 위에서 아래로 읽으면 그 값이 내려갈수록 그리디의 조기 전멸률(무시드 200판 ·
// 밸런스 덱 · hpMult 0.8 · w<10 비율)이 폭발한다. `npm test` 의 「어느 스테이지도
// 초반 전멸은 없다」가 정확히 그걸 본다.
//
//   후보              전레인동시   조기전멸
//   R1a 엇갈려나감       45.7%      3.0%
//   ⑥ 합수 (채택)       24.5%      2.5%   ← 합수 지점이 두 갈래를 같이 덮는다
//   갈래10x14(생성)      32.7%      8.0%
//   LB+RC 자기목         29.5%     21.0%
//   S2 늦은합수          20.0%     29.5%
//   R2 두 가장자리        8.8%     45.5%
//   R5 합류끊기          12.1%     74.0%
//
// **비율만으로는 안 갈린다 — 채택안이 24.5% 로 2.5% 인 것이 그 증거다.** 무엇이
// 두 갈래를 같이 덮느냐가 중요하다. 합수 지점처럼 **경로가 실제로 겹치는 곳**이
// 그 역할을 하면 낮은 비율에서도 초반 화력이 모이고, 좌/우로 갈라 놓기만 하면
// 비율이 같아도 무너진다. 「합류를 끊는다」로 만든 후보(R5)가 74% 로 최악이다.
const REJECTED_2LANE = [
  // 좌/우로 완전히 갈랐다. 전레인동시가 8.8% 로 떨어지고 조기 전멸 45.5%.
  { name: 'R2 두 가장자리(기각)', w: 10, h: 14, open: 8, lanes: [
    [P(-1, 0), P(6, 0), P(6, 3), P(0, 3), P(0, 11), P(4, 11), P(4, 14)],
    [P(10, 1), P(3, 1), P(3, 5), P(9, 5), P(9, 12), P(6, 12), P(6, 14)]] },
  // 각 레인이 자기 반쪽 안에서 스스로 목을 만든다(② 식). 편차 1.80 으로 좋지만
  // 두 갈래를 같이 덮는 자리가 합수처럼 뭉치지 않아 조기 전멸 21%.
  { name: 'LB+RC 자기목(기각)', w: 10, h: 14, open: 8, lanes: [
    [P(-1, 0), P(8, 0), P(8, 2), P(1, 2), P(1, 6), P(4, 6), P(4, 9), P(1, 9), P(1, 11), P(3, 11), P(3, 14)],
    [P(10, 1), P(5, 1), P(5, 4), P(9, 4), P(9, 7), P(5, 7), P(5, 10), P(9, 10), P(9, 13), P(5, 13), P(5, 14)]] },
  // 합류를 아예 끊었다. 전레인동시 12.1% · 조기 전멸 74% 로 셋 중 최악이다.
  { name: 'R5 합류끊기(기각)', w: 10, h: 14, open: 8, lanes: [
    [P(-1, 0), P(5, 0), P(5, 3), P(0, 3), P(0, 10), P(3, 10), P(3, 14)],
    [P(10, 1), P(6, 1), P(6, 4), P(9, 4), P(9, 11), P(6, 11), P(6, 14)]] },
];

// ── 3레인 후보 중 떨어진 둘. LEGACY 와 같은 이유로 남긴다 — 「왜 F 인가」의 반례다.
// 3레인 자체가 기각됐다(#44) — 이 판정 표가 두 후보 다 `✗ 경로 짧음` 으로 찍고
// 있었는데 그걸 안 읽고 3레인을 본편으로 올리려 했다. 아래 두 줄이 그 기록이다.
const TRI = [
  // A 는 편차가 셋 중 가장 크지만(1.78) **전제가 깨진다** — 개방 행에서 한 자리가
  // 세 레인을 다 덮는 칸이 있고, 출구 셋도 두 대로 덮인다. 「어디를 막을까」가
  // 2레인 판과 같아지므로 편차를 산 대가가 헛돈다. 편차는 게이트가 아니다.
  { name: 'A 삼거리(기각)', w: 9, h: 14, open: 8, lanes: [
    [P(-1, 1), P(2, 1), P(2, 6), P(0, 6), P(0, 11), P(3, 11), P(3, 14)],
    [P(4, -1), P(4, 4), P(6, 4), P(6, 9), P(4, 9), P(4, 12), P(5, 12), P(5, 14)],
    [P(9, 2), P(6, 2), P(6, 6), P(8, 6), P(8, 11), P(7, 11), P(7, 14)]] },
  // G 는 출구를 세 변에 흩어 놓았는데 **3번 레인이 나머지의 절반**이다. 속도가 같은
  // 적이 2배 빨리 도착하므로 「어디를 막을까」가 「짧은 레인부터」로 고정된다.
  { name: 'G 세 변(기각)', w: 9, h: 14, open: 8, lanes: [
    [P(-1, 1), P(2, 1), P(2, 8), P(0, 8), P(0, 14)],
    [P(4, -1), P(4, 5), P(7, 5), P(7, 11), P(4, 11), P(4, 14)],
    [P(9, 2), P(6, 2), P(6, 7), P(9, 7)]] },
];

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
    '커버 중앙/최소~최대'.padStart(16), '편차(시작/전체)',
    '전레인동시(시작/전체)');
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
      // 분모를 같이 찍는다. 「1곳」과 「18곳」은 배치 칸 수가 다르면 못 견준다 —
      // 읽을 값은 비율이고(⑤ 18/48 = 37.5% 대 C2 1/43 = 2.3%), 1레인 판은 정의상
      // 전부라 `-` 로 비운다.
      (r.lanes > 1
        ? `${r.allOpen}/${r.free6}  ${r.allAll}/${r.freeAll}`
        : '-').padStart(18),
      // 레인이 여럿이면 길이를 레인별로도 찍는다. 평균만 보면 한 레인이 나머지의
      // 절반이어도 안 보이는데, 그런 판은 「짧은 레인부터 막는다」가 늘 정답이라
      // 배치 결정이 사라진다(후보 G 세 변이 18/21/11 로 그렇게 떨어졌다).
      r.lanes > 1 ? '  레인 ' + r.lens.join('/') : '',
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

// ── 실행부 ────────────────────────────────────────────────────
// `require.main === module` 로 감싼 것은 **`RANGE` 를 밖으로 내주기 위해서**다.
// `tools/sim.js` 의 커버 계산이 같은 사거리를 써야 하는데, 이 파일이 최상위에서
// 바로 실행되면 `require` 할 때마다 표가 통째로 찍힌다. 상수를 양쪽에 하나씩 두면
// **`RANGE` 만 고쳤을 때 아무것도 안 깨지고**, 그 순간 DESIGN §스테이지의 커버 편차
// 표와 시뮬이 서로 다른 것을 재기 시작한다 — 조용히 갈리는 자리라 자를 하나로 묶었다.
if (require.main === module) {
  const all = process.argv.includes('--all');

  const stageRows = table('실제 스테이지 (기준선)', STAGES);
  const bigRows = table('큰 맵 후보 — 뱀(1레인) / 갈래(2레인)', BIG);
  const rejRows = table('⑥ 을 고르며 기각한 10x14 2레인 후보', REJECTED_2LANE);
  const triRows = table('3레인 후보 (3레인 자체가 기각됐다)', TRI);
  if (all) verdict(table('7x10 초기 탐색 (결론 남음)', LEGACY));

  verdict([...stageRows, ...bigRows, ...rejRows, ...triRows]);

  // 배치 칸이 늘어난 배수. 덱을 늘리려면 소환 횟수가 늘어야 하고(CFG.DECK_SIZE 주석:
  // 84소환/7종 = 종당 12개 < 5성에 필요한 16개), 그 상한 하나가 보드 넓이다.
  console.log('\n── 현행 대비 배치 칸 (덱 크기를 늘릴 여지) ' + '─'.repeat(20));
  const base = stageRows[1].free6;   // ② 이중 병목. 편차 1.87 로 현행 기준 맵
  console.log(`기준 ② 이중 병목 배치(시작) ${base}칸`);
  for (const r of bigRows)
    console.log(' ', r.name.padEnd(14), `${r.free6}칸`.padStart(6), `x${(r.free6 / base).toFixed(2)}`.padStart(7));
}

// `RANGE` 는 커버의 정의 그 자체다. `cells` 는 경로 칸 걷기 — 게임은 자기 것
// (`index.html laneCells`)을 쓰고 이 파일은 후보 맵을 재느라 STAGES 밖의 좌표도
// 걸어야 해서 따로 있다. 둘이 같은 규칙인지는 `tools/test.js` 가 단언한다.
module.exports = { RANGE, cells, evaluate, STAGES };
