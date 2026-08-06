// 밸런스 상수 역산. 그리디 플레이어가 몇 웨이브에서 죽는지로 난이도를 잰다.
// 목표: 그리디(대충 하는 플레이)가 18~24 웨이브에서 죽을 것.
// 그보다 일찍 죽으면 잘해도 못 깨고, 늦게 죽으면 생각할 필요가 없는 게임이다.
const { load, greedy } = require('./sim.js');

const TRIALS = Number(process.env.TRIALS || 5);

const GRID = {
  DMG_SCALE:   [8, 14, 22, 32],
  STAR_RATIO:  [2.6, 3.0],
  GOLD_BASE:   [22, 40],
  GOLD_GROWTH: [1.11, 1.16],
};

function median(a) { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

function run(overrides) {
  const waves = [], stars = [];
  for (let i = 0; i < TRIALS; i++) {
    const g = load(overrides);
    const r = greedy(g);
    waves.push(r.result === 'clear' ? 99 : r.wave);
    stars.push(r.maxStar);
  }
  return { wave: median(waves), star: median(stars), waves };
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

  console.log('\n── 목표(18~24) 구간에 든 조합 ──');
  const hit = rows.filter(r => r.wave >= 18 && r.wave <= 24);
  if (!hit.length) console.log('없음. 그리드 범위를 넓혀야 한다.');
  for (const r of hit) console.log(' ', keys.map(k => k + '=' + r[k]).join(' '), '→ w' + r.wave);
}

if (process.argv[2] === 'one') {
  const g = load();
  console.log(JSON.stringify(greedy(g), null, 1));
} else {
  grid();
}
