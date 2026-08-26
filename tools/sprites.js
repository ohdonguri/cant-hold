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
  shredder: g => {                       // 원형 톱날 + 분쇄 기어
    rect(g, 5, 19, 22, 10, 2); rect(g, 5, 19, 22, 3, 3); rect(g, 7, 27, 18, 3, 1);
    rect(g, 7, 16, 18, 6, 2);
    ring(g, 16, 11, 10, 3, 3); disc(g, 16, 11, 6.5, 1);
    ring(g, 16, 11, 6.5, 2, 4); disc(g, 16, 11, 2.5, 3);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      line(g, 16 + Math.cos(a) * 3, 11 + Math.sin(a) * 3,
        16 + Math.cos(a) * 8, 11 + Math.sin(a) * 8, 2.2, i % 2 ? 3 : 4);
    }
    disc(g, 10, 22, 3, 1); disc(g, 22, 22, 3, 1);
    ring(g, 10, 22, 3, 1.5, 3); ring(g, 22, 22, 3, 1.5, 3);
  },
  eroder: g => {                         // 부식액 조 + 증기 배출구
    rect(g, 6, 23, 20, 7, 1); rect(g, 8, 20, 16, 6, 2); rect(g, 8, 20, 16, 2, 3);
    disc(g, 16, 13, 9.5, 2); ring(g, 16, 13, 9.5, 2.5, 3);
    disc(g, 16, 13, 5.5, 1); disc(g, 16, 13, 3, 4);
    rect(g, 7, 5, 4, 8, 2); rect(g, 21, 5, 4, 8, 2);
    disc(g, 9, 4, 2.5, 3); disc(g, 23, 4, 2.5, 3);
    line(g, 9, 2, 7, 0, 2, 4); line(g, 23, 2, 25, 0, 2, 4);
  },
  frost: g => {                          // 냉각탑 + 육각 서리 결정
    rect(g, 6, 21, 20, 9, 1); rect(g, 8, 18, 16, 7, 2); rect(g, 8, 18, 16, 2, 3);
    line(g, 16, 2, 16, 19, 4, 2); line(g, 8, 11, 24, 11, 4, 2);
    line(g, 10, 5, 22, 17, 3, 2); line(g, 22, 5, 10, 17, 3, 2);
    line(g, 16, 3, 16, 18, 2, 4); line(g, 9, 11, 23, 11, 2, 3);
    disc(g, 16, 11, 3.5, 4);
    [[9, 24], [16, 25], [23, 24]].forEach(([x, y]) => disc(g, x, y, 2.2, 3));
  },
  mortar: g => {                         // 넓은 포구 + 회전 포좌
    disc(g, 14, 23, 10, 2); ring(g, 14, 23, 10, 3, 3);
    rect(g, 4, 23, 20, 7, 1); rect(g, 6, 21, 16, 5, 2);
    line(g, 10, 21, 22, 7, 8, 2); line(g, 10, 21, 22, 7, 3, 3);
    disc(g, 23, 6, 5, 3); disc(g, 23, 6, 3.2, 1);
  },
  marksman: g => {                       // 긴 조준경 + 회전 삼각대
    poly(g, [[5, 24], [11, 19], [21, 19], [27, 24], [24, 30], [8, 30]], 1);
    disc(g, 16, 18, 6, 2); ring(g, 16, 18, 6, 2, 3);
    rect(g, 3, 10, 25, 5, 2); rect(g, 3, 10, 25, 2, 3); rect(g, 2, 11, 5, 3, 1);
    disc(g, 18, 8, 5, 2); ring(g, 18, 8, 5, 2, 3); disc(g, 18, 8, 2.4, 4);
    line(g, 16, 21, 9, 29, 3, 1); line(g, 16, 21, 23, 29, 3, 1);
  },
  arc: g => {                            // 쌍기둥 + 직선 관통 아크
    rect(g, 4, 25, 24, 6, 1); rect(g, 6, 22, 20, 6, 2); rect(g, 6, 22, 20, 2, 3);
    for (const x of [6, 21]) {
      rect(g, x, 7, 5, 17, 2); rect(g, x, 7, 2, 17, 3);
      rect(g, x - 1, 11, 7, 2, 4); rect(g, x - 1, 16, 7, 2, 3);
      disc(g, x + 2.5, 6, 3.5, 3); disc(g, x + 2.5, 6, 1.8, 4);
    }
    line(g, 10, 5, 14, 2, 2, 4); line(g, 14, 2, 18, 6, 2, 4); line(g, 18, 6, 22, 3, 2, 4);
    rect(g, 14, 20, 4, 9, 3); rect(g, 15, 20, 2, 9, 4);
  },
  mint: g => {                           // 동전 프레스 + 저장고
    rect(g, 5, 4, 22, 6, 2); rect(g, 5, 4, 22, 2, 3);
    rect(g, 6, 8, 5, 15, 2); rect(g, 21, 8, 5, 15, 2);
    rect(g, 7, 8, 3, 15, 3); rect(g, 22, 8, 3, 15, 3);
    rect(g, 12, 8, 8, 5, 2); rect(g, 14, 12, 4, 7, 3);
    disc(g, 16, 20, 7, 2); ring(g, 16, 20, 7, 2, 3); rect(g, 12, 19, 8, 3, 4);
    rect(g, 10, 23, 12, 7, 1);
    for (let y = 24; y <= 28; y += 2) { rect(g, 12, y, 8, 2, 2); rect(g, 13, y, 6, 1, 4); }
  },

  // ── 적 ──
  grunt: g => {                          // 둥근 헬멧 보병
    disc(g, 16, 11, 8, 2); ring(g, 16, 11, 8, 2, 3);
    rect(g, 9, 10, 14, 5, 1); rect(g, 11, 11, 10, 3, 4);
    rect(g, 8, 16, 16, 10, 2); rect(g, 8, 16, 16, 2, 3);
    disc(g, 6, 19, 4, 2); disc(g, 26, 19, 4, 2);
    rect(g, 8, 25, 6, 5, 1); rect(g, 18, 25, 6, 5, 1);
    rect(g, 7, 28, 7, 2, 3); rect(g, 18, 28, 7, 2, 3);
  },
  armored: g => {                        // 중장갑 전면 방패
    disc(g, 16, 9, 8, 2); ring(g, 16, 9, 8, 2, 3);
    disc(g, 6, 13, 5, 2); disc(g, 26, 13, 5, 2);
    poly(g, [[4, 12], [28, 12], [26, 25], [16, 28], [6, 25]], 2);
    poly(g, [[6, 14], [26, 14], [24, 23], [16, 25], [8, 23]], 3);
    rect(g, 9, 9, 14, 4, 1); rect(g, 11, 10, 10, 2, 4);
    rect(g, 5, 26, 8, 4, 1); rect(g, 19, 26, 8, 4, 1);
    rect(g, 5, 28, 8, 2, 3); rect(g, 19, 28, 8, 2, 3);
  },
  warded: g => {                         // 마름모 결계 + 룬 파편
    disc(g, 16, 16, 10, 1);
    poly(g, [[16, 3], [29, 16], [16, 29], [3, 16]], 2);
    poly(g, [[16, 7], [25, 16], [16, 25], [7, 16]], 3);
    poly(g, [[16, 10], [22, 16], [16, 22], [10, 16]], 1); disc(g, 16, 16, 3, 4);
    poly(g, [[2, 12], [5, 16], [2, 20], [0, 16]], 3);
    poly(g, [[30, 12], [32, 16], [30, 20], [27, 16]], 3);
  },
  swift: g => {                          // 화살촉 질주 유닛
    poly(g, [[28, 16], [12, 5], [15, 13], [5, 16], [15, 19], [12, 27]], 2);
    poly(g, [[25, 16], [14, 9], [17, 15], [9, 16], [17, 17], [14, 23]], 3);
    disc(g, 20, 16, 3, 1); disc(g, 21, 15, 1.5, 4);
    line(g, 12, 9, 9, 4, 2, 3); line(g, 12, 23, 9, 28, 2, 3);
  },
  regen: g => {                          // 자가수복 골렘 + 심장 코어
    disc(g, 16, 8, 6, 2); ring(g, 16, 8, 6, 2, 3);
    disc(g, 7, 15, 6, 2); disc(g, 25, 15, 6, 2);
    rect(g, 7, 12, 18, 14, 2); rect(g, 9, 12, 14, 3, 3);
    disc(g, 16, 18, 6, 1); disc(g, 16, 18, 3.5, 4);
    rect(g, 14, 14, 4, 8, 3); rect(g, 12, 16, 8, 4, 3); disc(g, 16, 18, 2, 4);
    rect(g, 7, 25, 7, 5, 1); rect(g, 18, 25, 7, 5, 1);
    rect(g, 6, 28, 8, 2, 3); rect(g, 18, 28, 8, 2, 3);
  },
  immune: g => {                         // 밀폐된 이중 보호 링
    ring(g, 16, 15, 14, 3, 2); ring(g, 16, 15, 10, 3, 3);
    disc(g, 16, 15, 6, 1); disc(g, 16, 15, 3, 4);
    rect(g, 9, 25, 14, 5, 1); rect(g, 11, 24, 10, 4, 2);
    disc(g, 4, 15, 2, 4); disc(g, 28, 15, 2, 4);
  },
  swarm: g => {                          // 소형 드론 넷
    [[9, 9], [23, 9], [9, 23], [23, 23]].forEach(([cx, cy]) => {
      disc(g, cx, cy, 4.5, 2); ring(g, cx, cy, 4.5, 1.5, 3); disc(g, cx, cy, 1.7, 4);
      line(g, cx - 2, cy - 3, cx - 4, cy - 6, 1.5, 3);
      line(g, cx + 2, cy - 3, cx + 4, cy - 6, 1.5, 3);
    });
  },
  elite: g => {                          // 대형 붉은 전투 골렘
    poly(g, [[16, 1], [21, 5], [27, 6], [29, 15], [25, 25], [7, 25], [3, 15], [5, 6], [11, 5]], 2);
    line(g, 11, 5, 8, 1, 3, 3); line(g, 21, 5, 24, 1, 3, 3);
    disc(g, 5, 16, 6, 2); disc(g, 27, 16, 6, 2);
    poly(g, [[16, 7], [24, 12], [23, 22], [16, 26], [9, 22], [8, 12]], 3);
    disc(g, 16, 17, 6, 1); disc(g, 16, 17, 3.5, 4);
    rect(g, 5, 24, 9, 6, 1); rect(g, 18, 24, 9, 6, 1);
    rect(g, 4, 28, 10, 2, 3); rect(g, 18, 28, 10, 2, 3);
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
      shredder: '원형 톱날 + 분쇄 기어', eroder: '부식액 조 + 증기 배출구',
      frost: '냉각탑 + 육각 서리 결정', mortar: '넓은 포구 + 회전 포좌',
      marksman: '긴 조준경 + 회전 삼각대', arc: '쌍기둥 + 직선 관통 아크',
      mint: '동전 프레스 + 저장고', grunt: '둥근 헬멧 보병',
      armored: '중장갑 전면 방패', warded: '마름모 결계 + 룬 파편',
      swift: '화살촉 질주 유닛', regen: '자가수복 골렘 + 심장 코어',
      immune: '밀폐된 이중 보호 링', swarm: '소형 드론 넷', elite: '대형 붉은 전투 골렘',
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
