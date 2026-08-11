// 밸런스 상수 역산. 그리디 플레이어가 몇 웨이브에서 죽는지로 난이도를 잰다.
// 목표: 그리디(대충 하는 플레이)가 18~24 웨이브에서 죽을 것.
// 그보다 일찍 죽으면 잘해도 못 깨고, 늦게 죽으면 생각할 필요가 없는 게임이다.
const { load, greedy } = require('./sim.js');

const TRIALS = Number(process.env.TRIALS || 5);

const BAND = [18, 24];

// 그리드는 오래 [8, 14, 22, 32] 였다. 그동안 실배포 CFG.DMG_SCALE 은 6.5 로 내려가
// **그리드 최솟값보다 작아졌고**, GOLD_BASE 도 70 인데 그리드는 [22, 40] 이었다.
// 결과는 32행 전부 99(클리어) — 어느 행도 실제 게임이 아니어서 「목표 구간에 든
// 조합」이 실배포와 아무 상관 없는 값을 추천하고 있었다. 그리드가 재는 것은
// 실배포 주변이어야 의미가 있으므로 축마다 실배포값을 끼고 앞뒤로 벌린다.
//   DMG_SCALE   6.5  ← 4.5 / 6.5 / 9 / 13
//   STAR_RATIO  2.4  ← 2.4 / 2.7
//   GOLD_BASE   70   ← 55 / 70
//   GOLD_GROWTH 1.11 ← 1.11 / 1.16   (원래부터 실배포값을 끼고 있던 유일한 축)
// 행 수는 4×2×2×2 = 32 로 그대로 둔다. 축을 넓히면 조합이 곱으로 늘고, 어차피
// 클리어하는 행이 가장 오래 걸린다(99웨이브까지 굴린다).
const GRID = {
  DMG_SCALE:   [4.5, 6.5, 9, 13],
  STAR_RATIO:  [2.4, 2.7],
  GOLD_BASE:   [55, 70],
  GOLD_GROWTH: [1.11, 1.16],
};

function median(a) { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

// greedy 는 rollDeck·소환·적 배치까지 전역 Math.random 을 쓴다. 그대로 두면 같은
// 코드로 두 번 돌려도 「목표 구간에 든 조합」 목록이 달라졌다(실측: 없음 ↔ 3개).
// 그러면 이 도구의 출력은 근거로 쓸 수가 없다 — 밸런스를 정하는 회의에서 두 사람이
// 서로 다른 표를 들고 있게 된다. test.js 의 대등성 게이트가 같은 이유로 이미
// 시드를 밖에서 걸고 있으니(12345 · LCG) 같은 방식·같은 값을 쓴다.
//
// **run() 마다 다시 박는 것**이 핵심이다. 프로세스 시작에 한 번만 박으면 앞 행이
// 난수를 얼마나 먹었느냐에 뒤 행이 딸려서, 그리드에 행 하나를 더하면 그 아래
// 전부가 움직인다. 행마다 같은 난수열을 주면 조합끼리 같은 판으로 겨루게 되어
// (짝지은 비교) 조합 간 차이가 시드 운에 안 묻히고, 행을 더해도 남은 행이 안 흔들린다.
const SEED = 12345;
function seeded(fn) {
  const orig = Math.random;
  let s = SEED >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  try { return fn(); } finally { Math.random = orig; }
}

function run(overrides) {
  return seeded(() => {
    const waves = [], stars = [];
    for (let i = 0; i < TRIALS; i++) {
      const g = load(overrides);
      const r = greedy(g);
      waves.push(r.result === 'clear' ? 99 : r.wave);
      stars.push(r.maxStar);
    }
    return { wave: median(waves), star: median(stars), waves };
  });
}

function inBand(w) { return w >= BAND[0] && w <= BAND[1]; }

// 그리드가 아무리 촘촘해도 답해 주지 않는 질문이 하나 있다: **지금 배포된 판은
// 밴드 안인가.** 그래서 아무것도 덮어쓰지 않은 한 행을 맨 위에 따로 찍는다.
// 그리드 축에 실배포값을 끼워 넣는 것만으로는 부족하다 — 그건 32행 중 한 행이라
// 눈으로 찾아야 하고, 축을 하나라도 손대면 그 행이 조합에서 사라진다.
function baseline() {
  const r = run({});
  console.log('── 실배포 CFG (index.html 그대로, 아무것도 안 덮어씀) ──');
  console.log(
    '  사망웨이브(중앙값)', String(r.wave).padStart(3),
    '최고성급', r.star,
    '   ' + r.waves.join(','),
    '   ' + (inBand(r.wave) ? `목표 ${BAND[0]}~${BAND[1]} 안` : `목표 ${BAND[0]}~${BAND[1]} 밖 ← 손봐야 함`),
  );
  console.log();
  return r;
}

function grid() {
  const keys = Object.keys(GRID);
  const combos = keys.reduce((acc, k) =>
    acc.flatMap(o => GRID[k].map(v => ({ ...o, [k]: v }))), [{}]);

  const rows = [];
  for (const c of combos) {
    const r = run(c);
    rows.push({ ...c, ...r });
    console.log(
      keys.map(k => k + '=' + c[k]).join(' ').padEnd(62),
      '사망웨이브(중앙값)', String(r.wave).padStart(3),
      '최고성급', r.star,
      '   ' + r.waves.join(','),
    );
  }

  console.log(`\n── 목표(${BAND[0]}~${BAND[1]}) 구간에 든 조합 ──`);
  const hit = rows.filter(r => inBand(r.wave));
  if (!hit.length) console.log('없음. 그리드 범위를 넓혀야 한다.');
  for (const r of hit) console.log(' ', keys.map(k => k + '=' + r[k]).join(' '), '→ w' + r.wave);
}

if (process.argv[2] === 'one') {
  // 한 판만 볼 때도 시드를 박는다. 안 그러면 여기서 본 판을 다시 못 부른다.
  console.log(JSON.stringify(seeded(() => greedy(load())), null, 1));
} else {
  baseline();
  grid();
}
