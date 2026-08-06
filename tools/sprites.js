// 32x32 도트 생성기. index.html 의 SPR 테이블을 만든다.
//
//   node tools/sprites.js        미리보기 + 검증
//   node tools/sprites.js emit   SPR 테이블 출력 (index.html 에 붙여넣는다)
//
// 32칸짜리 문자열 480줄을 손으로 찍으면 폭 오류가 계속 난다. 그래서 도형으로
// 그리고 마지막에 외곽선을 자동으로 입혀 문자열을 뽑는다. 스프라이트를 고칠 때는
// SHAPES 의 도형만 만지면 되고, 폭은 생성기가 보장한다.
const N = 32;

function grid() { return Array.from({ length: N }, () => Array(N).fill('.')); }
const put = (g, x, y, v) => {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = v;
};

const rect = (g, x, y, w, h, v) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, v);
};
const disc = (g, cx, cy, r, v) => {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(g, x, y, v);
};
const ring = (g, cx, cy, r, t, v) => {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (d2 <= r * r && d2 >= (r - t) ** 2) put(g, x, y, v);
    }
};
const line = (g, x1, y1, x2, y2, t, v) => {
  const steps = Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2) + 1;
  for (let i = 0; i <= steps; i++) {
    const x = x1 + (x2 - x1) * i / steps, y = y1 + (y2 - y1) * i / steps;
    disc(g, x + 0.5, y + 0.5, t / 2, v);
  }
};
// 볼록다각형
const poly = (g, pts, v) => {
  const ys = pts.map(p => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y))
        xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) put(g, x, y, v);
  }
};

// 채워진 칸 중 투명과 맞닿은 곳을 외곽선으로 바꾼다
function outline(g) {
  const src = g.map(r => r.slice());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (src[y][x] === '.') continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx < 0 || nx >= N || ny < 0 || ny >= N || src[ny][nx] === '.';
      });
    if (edge) g[y][x] = '0';
  }
  return g;
}

const SHAPES = {
  // ── 타워 ──
  shredder: g => {                       // 톱니 왕관 성탑
    rect(g, 8, 22, 16, 6, 2); rect(g, 8, 22, 16, 2, 3); rect(g, 8, 26, 16, 2, 1);
    rect(g, 10, 10, 12, 12, 2); rect(g, 10, 10, 12, 2, 3); rect(g, 12, 14, 8, 6, 1);
    rect(g, 13, 15, 6, 4, 4);
    for (let i = 0; i < 4; i++) { rect(g, 9 + i * 4, 5, 3, 5, 2); rect(g, 9 + i * 4, 5, 3, 2, 3); }
    rect(g, 8, 9, 16, 2, 3);
  },
  eroder: g => {                         // 렌즈 오브
    disc(g, 16, 16, 11, 2); ring(g, 16, 16, 11, 3, 3);
    disc(g, 16, 16, 6, 1); disc(g, 16, 16, 3.2, 4);
    rect(g, 13, 27, 6, 3, 1);
  },
  frost: g => {                          // 얼음 결정
    line(g, 16, 2, 16, 30, 4, 2); line(g, 4, 16, 28, 16, 4, 2);
    line(g, 8, 8, 24, 24, 3, 2); line(g, 24, 8, 8, 24, 3, 2);
    line(g, 16, 4, 16, 28, 2, 3); line(g, 6, 16, 26, 16, 2, 3);
    disc(g, 16, 16, 3.5, 4);
    [[16, 5], [16, 27], [5, 16], [27, 16]].forEach(([x, y]) => disc(g, x, y, 2, 3));
  },
  mortar: g => {                         // 받침 + 사선 포신
    line(g, 8, 24, 26, 6, 7, 2); line(g, 8, 24, 26, 6, 3, 3);
    disc(g, 26, 6, 4, 3); disc(g, 26, 6, 2, 1);
    rect(g, 3, 22, 14, 7, 2); rect(g, 3, 22, 14, 2, 3); rect(g, 3, 27, 14, 2, 1);
  },
  marksman: g => {                       // 수평 총열 + 삼각대
    rect(g, 6, 8, 24, 5, 2); rect(g, 6, 8, 24, 2, 3); rect(g, 26, 9, 4, 3, 4);
    disc(g, 9, 11, 5, 2); ring(g, 9, 11, 5, 2, 3);
    line(g, 9, 14, 3, 28, 3, 1); line(g, 9, 14, 15, 28, 3, 1); line(g, 9, 14, 9, 28, 3, 2);
  },
  arc: g => {                            // 테슬라 코일
    rect(g, 10, 26, 12, 4, 1); rect(g, 7, 29, 18, 2, 1);
    rect(g, 12, 11, 8, 16, 2); rect(g, 12, 11, 3, 16, 3);
    rect(g, 10, 14, 12, 2, 3); rect(g, 10, 18, 12, 2, 3); rect(g, 10, 22, 12, 2, 3);
    disc(g, 16, 7, 5, 3); disc(g, 16, 7, 2.8, 4);
    line(g, 16, 1, 16, 4, 2, 4);
  },
  mint: g => {                           // 동전 세 닢
    [[16, 25, 9], [16, 18, 9], [16, 11, 9]].forEach(([cx, cy, r]) => {
      disc(g, cx, cy, r, 2); ring(g, cx, cy, r, 2, 3); rect(g, cx - 4, cy - 1, 8, 2, 4);
    });
  },

  // ── 적 ──
  grunt: g => {                          // 둥근 헬멧 + 바이저
    disc(g, 16, 16, 12, 2); ring(g, 16, 16, 12, 3, 3);
    rect(g, 6, 14, 20, 5, 1); rect(g, 8, 15, 16, 3, 4);
  },
  armored: g => {                        // 각진 방패
    poly(g, [[3, 3], [29, 3], [29, 16], [16, 29], [3, 16]], 2);
    poly(g, [[3, 3], [29, 3], [29, 7], [3, 7]], 3);
    rect(g, 7, 12, 18, 4, 1); rect(g, 9, 13, 14, 2, 4);
  },
  warded: g => {                         // 마름모 룬
    poly(g, [[16, 1], [31, 16], [16, 31], [1, 16]], 2);
    poly(g, [[16, 5], [27, 16], [16, 27], [5, 16]], 3);
    poly(g, [[16, 9], [23, 16], [16, 23], [9, 16]], 1);
    disc(g, 16, 16, 3, 4);
  },
  swift: g => {                          // 화살촉 + 잔상
    poly(g, [[30, 16], [14, 4], [14, 28]], 2);
    poly(g, [[26, 16], [16, 9], [16, 23]], 3);
    rect(g, 8, 10, 3, 12, 2); rect(g, 3, 12, 3, 8, 1);
  },
  regen: g => {                          // 십자 + 맥동
    rect(g, 12, 3, 8, 26, 2); rect(g, 3, 12, 26, 8, 2);
    rect(g, 13, 4, 6, 24, 3); rect(g, 4, 13, 24, 6, 3);
    disc(g, 16, 16, 5, 1); disc(g, 16, 16, 2.5, 4);
  },
  immune: g => {                         // 이중 링 + 코어
    ring(g, 16, 16, 15, 3, 3); ring(g, 16, 16, 10, 3, 2);
    disc(g, 16, 16, 5, 1); disc(g, 16, 16, 2.5, 4);
  },
  swarm: g => {                          // 작은 개체 넷
    [[9, 9], [23, 9], [9, 23], [23, 23]].forEach(([cx, cy]) => {
      disc(g, cx, cy, 5, 2); ring(g, cx, cy, 5, 2, 3); disc(g, cx, cy, 1.5, 1);
    });
  },
  elite: g => {                          // 큰 육각 + 코어
    poly(g, [[16, 1], [29, 9], [29, 23], [16, 31], [3, 23], [3, 9]], 2);
    poly(g, [[16, 4], [26, 10], [26, 22], [16, 28], [6, 22], [6, 10]], 3);
    poly(g, [[16, 8], [23, 12], [23, 20], [16, 24], [9, 20], [9, 12]], 1);
    disc(g, 16, 16, 4, 4);
  },
};

const SPR = {};
for (const [k, fn] of Object.entries(SHAPES)) {
  const g = grid();
  fn(g);
  outline(g);
  SPR[k] = g.map(r => r.join(''));
}

// 검증
const bad = [];
for (const [k, rows] of Object.entries(SPR)) {
  if (rows.length !== N) bad.push(k + ' 행 ' + rows.length);
  rows.forEach((r, i) => { if (r.length !== N) bad.push(k + '[' + i + '] ' + r.length); });
  if (rows.every(r => !/[01234]/.test(r))) bad.push(k + ' 비어 있음');
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }

if (require.main === module) {
  if (process.argv[2] === 'emit') {
    const label = {
      shredder: '톱니 왕관 성탑', eroder: '렌즈 오브', frost: '얼음 결정', mortar: '받침 + 사선 포신',
      marksman: '수평 총열 + 삼각대', arc: '코일 + 아크', mint: '동전 세 닢',
      grunt: '둥근 헬멧', armored: '각진 방패', warded: '마름모 룬', swift: '화살촉 + 잔상',
      regen: '십자', immune: '이중 링', swarm: '작은 개체 넷', elite: '큰 육각 + 코어',
    };
    let out = 'const SPR = {\n  // ── 타워 ──\n';
    Object.keys(SPR).forEach(k => {
      if (k === 'grunt') out += '\n  // ── 적 ──\n';
      out += '  ' + k + ': [   // ' + label[k] + '\n';
      out += SPR[k].map(r => "    '" + r + "',").join('\n') + '\n  ],\n';
    });
    out += '};';
    process.stdout.write(out);
  } else {
    console.log('32x32 생성 및 검증 통과,', Object.keys(SPR).length + '개');
    // 터미널 미리보기
    for (const k of Object.keys(SPR)) {
      console.log('\n── ' + k + ' ──');
      console.log(SPR[k].map(r => r.replace(/\./g, ' ').replace(/[01]/g, '#').replace(/[234]/g, '@')).join('\n'));
    }
  }
}
module.exports = SPR;
