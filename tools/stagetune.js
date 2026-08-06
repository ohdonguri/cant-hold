// 스테이지별 hpMult 역산. 스테이지는 깨야 다음이 열리므로
// "그리디가 못 깬다"가 아니라 "그리디가 가끔 깬다"가 목표다.
// 목표: S1 8/12, S2 3/12, S3 2/12, S4 0~1/12
const { load, greedy } = require('./sim.js');
const DECK = ['shredder', 'arc', 'mint'];
const stage = Number(process.argv[2] || 0);
const trials = Number(process.env.TRIALS || 10);

for (const mult of (process.argv[3] || '1.0,1.3,1.6,1.9').split(',').map(Number)) {
  const w = [];
  let clears = 0;
  for (let i = 0; i < trials; i++) {
    const g = load();
    g.STAGES[stage].hpMult = mult;
    const r = greedy(g, { stage, deck: DECK });
    if (r.result === 'clear') clears++;
    w.push(r.result === 'clear' ? g.CFG.WAVE_MAX : r.wave);
  }
  w.sort((a, b) => a - b);
  console.log('  HPx' + String(mult).padEnd(5), '클리어', String(clears) + '/' + trials,
    '중앙 w' + String(w[trials >> 1]).padStart(3), '범위', w[0] + '~' + w[trials - 1]);
}
