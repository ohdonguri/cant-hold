// 스테이지별 hpMult 역산. 스테이지는 깨야 다음이 열리므로
// "그리디가 못 깬다"가 아니라 "그리디가 가끔 깬다"가 목표다.
//
// **목표 수치는 여기 없다.** 정본은 DESIGN §난이도의 눈금 + `tools/curve.js`
// (`npm run curve`)다. 오래 이 자리에 판별 목표 줄이 박혀 있었는데, ⑤ 분수령이
// 붙기 전에 쓴 것이라 판 하나가 통째로 빠진 채였고 아무도 안 보고 있었다. 도구마다
// 눈금을 하나씩 적어 두면 그렇게 조용히 갈라진다(#37). 이 도구가 하는 일은 값을
// 정하는 게 아니라 **어느 배율이 지표를 움직이는지 훑는 것**이다.
const { load, greedy } = require('./sim.js');
const DECK = ['shredder', 'arc', 'mint'];
const stage = Number(process.argv[2] || 0);
const trials = Number(process.env.TRIALS || 10);

// **어느 판인지 · 총웨이브가 몇인지를 행마다 박는다.** 이게 없으면 `중앙 w25` 가
// 25/30(진도 0.83)인지 25/25(클리어)인지 못 읽는다 — 총웨이브가 판마다 20 · 25 · 30
// 이라서다. 판을 안 적어 난 사고가 #28 이고, 이 도구는 `process.argv[2]` 로 판이
// 바뀌는데도 출력에 그 번호가 없었다. 표본·덱 태그도 같이 박아 한 줄만 복사해 가도
// 출처가 따라가게 한다(`tools/curve.js` 와 같은 관례다).
const base = load();
const name = base.STAGES[stage].name;
const waveMax = base.STAGES[stage].waves;
const TAG = `${DECK.join('+')} · ${trials}시행 · 무시드`;
console.log(`S${stage + 1} ${name} · 총 ${waveMax}웨이브 · ${TAG}`);
console.log('(hpMult 를 훑는다. 목표 수치는 여기 없다 — DESIGN §난이도의 눈금 + npm run curve)');

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
  // 진도 p 는 `curve`·`tune`·`test` 와 같은 정의다(클리어를 총웨이브로 세고 평균).
  const p = w.reduce((a, b) => a + b, 0) / trials / waveMax;
  console.log(`  S${stage + 1}(${waveMax}웨이브)`, 'HPx' + String(mult).padEnd(5),
    '클리어', String(clears) + '/' + trials,
    '중앙 w' + String(w[trials >> 1]).padStart(3),
    '범위', (w[0] + '~' + w[trials - 1]).padStart(7),
    '진도 p', p.toFixed(2),
    '  ' + TAG);
}
