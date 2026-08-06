// 경로 후보 비교. index.html 의 PATH 를 바꾸기 전에 여기서 먼저 재 본다.
//
// 보는 것 네 가지:
//   길이      교전 시간. 짧으면 타워가 쏠 틈이 없다.
//   배치 칸   경로가 먹고 남은 칸.
//   2x2 자리  5성을 놓을 수 있는 곳. 여기가 0 이면 게임이 성립하지 않는다.
//   커버 편차 칸마다 사거리 안에 들어오는 경로 칸 수의 편차.
//             0 에 가까우면 어디에 놓든 똑같다는 뜻이라 배치가 결정이 아니게 된다.
const W = 7, H = 10, OPEN = 6, RANGE = 2.2;

function cells(path) {
  const set = new Set();
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
  return set;
}

function length(path) {
  let n = 0;
  for (let i = 0; i < path.length - 1; i++)
    n += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  return n;
}

function evaluate(path) {
  const P = cells(path);
  const isPath = (x, y) => P.has(x + ',' + y);
  const inBoard = [...P].filter(k => {
    const [x, y] = k.split(',').map(Number);
    return x >= 0 && x < W && y >= 0 && y < H;
  });

  const free = (y0) => {
    const out = [];
    for (let y = y0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (!isPath(x, y)) out.push([x, y]);
    return out;
  };
  const big = (y0) => {
    let n = 0;
    for (let y = y0; y < H - 1; y++)
      for (let x = 0; x < W - 1; x++)
        if (!isPath(x, y) && !isPath(x + 1, y) && !isPath(x, y + 1) && !isPath(x + 1, y + 1)) n++;
    return n;
  };

  const cov = free(0).map(([x, y]) =>
    inBoard.filter(k => {
      const [px, py] = k.split(',').map(Number);
      return Math.hypot(px - x, py - y) <= RANGE;
    }).length);
  const mean = cov.reduce((a, b) => a + b, 0) / cov.length;
  const sd = Math.sqrt(cov.reduce((s, v) => s + (v - mean) ** 2, 0) / cov.length);
  const sorted = cov.slice().sort((a, b) => a - b);

  return {
    path: inBoard.length,
    len: Math.round(length(path)),
    free6: free(H - OPEN).length,
    freeAll: free(0).length,
    big6: big(H - OPEN),
    bigAll: big(0),
    covMed: sorted[sorted.length >> 1],
    covMin: sorted[0],
    covMax: sorted[sorted.length - 1],
    covSd: sd,
  };
}

const P = (x, y) => ({ x, y });

const CANDIDATES = {
  '현재 (3행 통로)': [
    P(-1, 0), P(6, 0), P(6, 3), P(0, 3), P(0, 6), P(6, 6), P(6, 9), P(0, 9), P(0, 10),
  ],
  '촘촘한 통로 (2행)': [
    P(-1, 0), P(6, 0), P(6, 2), P(0, 2), P(0, 4), P(6, 4), P(6, 6), P(0, 6), P(0, 8), P(6, 8), P(6, 10),
  ],
  '나선': [
    P(-1, 0), P(6, 0), P(6, 9), P(0, 9), P(0, 2), P(4, 2), P(4, 7), P(2, 7), P(2, 4), P(2, 3),
  ],
  '대각 지그재그': [
    P(-1, 0), P(3, 0), P(6, 3), P(3, 6), P(6, 9), P(3, 9), P(0, 6), P(3, 3), P(0, 0), P(0, -1),
  ],
  '엇갈린 U': [
    P(-1, 1), P(5, 1), P(5, 4), P(1, 4), P(1, 7), P(6, 7), P(6, 9), P(0, 9), P(0, 10),
  ],
  '중앙 코어': [
    P(3, -1), P(3, 2), P(6, 2), P(6, 5), P(1, 5), P(1, 8), P(5, 8), P(5, 6), P(3, 6), P(3, 5),
  ],
  '비대칭 (위 성김 / 아래 촘촘)': [
    P(-1, 0), P(6, 0), P(6, 3), P(0, 3), P(0, 6), P(5, 6), P(5, 8), P(2, 8), P(2, 9), P(6, 9), P(6, 10),
  ],
  '이중 병목': [
    P(-1, 0), P(6, 0), P(6, 3), P(1, 3), P(1, 1), P(3, 1), P(3, 6), P(6, 6), P(6, 9), P(0, 9), P(0, 10),
  ],
  '갈고리': [
    P(-1, 1), P(6, 1), P(6, 4), P(2, 4), P(2, 2), P(4, 2), P(4, 7), P(0, 7), P(0, 9), P(6, 9), P(6, 10),
  ],
  '대각 + 주머니': [
    P(-1, 0), P(4, 0), P(6, 2), P(6, 4), P(2, 4), P(0, 6), P(0, 7), P(4, 7), P(6, 9), P(0, 9), P(0, 10),
  ],
};

const rows = Object.entries(CANDIDATES).map(([name, p]) => ({ name, ...evaluate(p) }));

console.log(
  '후보'.padEnd(20),
  '경로', '길이',
  ' 배치(시작/전체)', '2x2(시작/전체)', ' 커버 중앙/최소~최대', '편차');
for (const r of rows) {
  console.log(
    r.name.padEnd(18),
    String(r.path).padStart(4),
    String(r.len).padStart(4),
    (r.free6 + '/' + r.freeAll).padStart(12),
    (r.big6 + '/' + r.bigAll).padStart(12),
    (r.covMed + '  ' + r.covMin + '~' + r.covMax).padStart(16),
    r.covSd.toFixed(2).padStart(7),
  );
}

console.log('\n판정 기준: 2x2(시작) 8 이상, 배치(시작) 20 이상, 길이 30 이상, 편차 1.5 이상');
for (const r of rows) {
  const bad = [];
  if (r.big6 < 8) bad.push('2x2 부족');
  if (r.free6 < 20) bad.push('배치 칸 부족');
  if (r.len < 30) bad.push('경로 짧음');
  if (r.covSd < 1.5) bad.push('배치가 무의미');
  console.log(' ', r.name.padEnd(18), bad.length ? '✗ ' + bad.join(', ') : '○ 쓸 만함');
}
