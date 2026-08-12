// 타워 7종이 서로 대등한지 잰다.
// 지표: "그 타워가 든 덱들의 평균 사망 웨이브 - 안 든 덱들의 평균".
// 0 에 가까울수록 대등하고, 값이 크면 그 타워가 정답/함정이라는 뜻이다.
//
// 덱 3종으로 재는 이유는 감도다. 5종이면 어느 덱이든 절반 이상이 겹쳐서
// 타워별 차이가 노이즈에 묻힌다.
const { load, greedy } = require('./sim.js');

const K = ['shredder', 'eroder', 'frost', 'mortar', 'marksman', 'arc', 'mint'];
const NAME = { shredder: '파쇄', eroder: '침식', frost: '서리', mortar: '박격', marksman: '관측', arc: '마력', mint: '조폐' };
const BRANCHES = [['A', 'A1'], ['A', 'A2'], ['B', 'B1'], ['B', 'B2']];

function combos(a, k) {
  if (k === 0) return [[]];
  if (a.length < k) return [];
  const [h, ...r] = a;
  return combos(r, k - 1).map(c => [h, ...c]).concat(combos(r, k));
}

// clears/runs 와 덱 평균 목록을 같이 돌려준다. 폭이 작다는 것이 「대등하다」는
// 뜻이 되려면 **측정이 상한에 안 눌려 있어야** 하는데, contrib/spread 만으로는
// 「전부 30 이라 차가 0」과 「진짜로 대등해서 0」이 구분이 안 되기 때문이다.
// 재는 값은 한 줄도 안 바뀐다 — 이미 있던 수를 밖에 내놓기만 한다.
function measure(branch3, branch5, trials) {
  const decks = combos(K, 3);
  let clears = 0, runs = 0;
  const rows = decks.map(deck => {
    const w = [];
    for (let i = 0; i < trials; i++) {
      const g = load({ DECK_SIZE: 3 });
      g.state.deck = deck.slice();
      const r = greedy(g, { branch3, branch5 });
      runs++;
      if (r.result === 'clear') clears++;
      w.push(r.result === 'clear' ? 30 : r.wave);
    }
    return { deck, mean: w.reduce((a, b) => a + b, 0) / w.length };
  });

  const contrib = {};
  for (const k of K) {
    const inn = rows.filter(r => r.deck.includes(k));
    const out = rows.filter(r => !r.deck.includes(k));
    contrib[k] = inn.reduce((s, r) => s + r.mean, 0) / inn.length
               - out.reduce((s, r) => s + r.mean, 0) / out.length;
  }
  const vals = Object.values(contrib);
  const means = rows.map(r => r.mean);
  return {
    contrib,
    spread: Math.max(...vals) - Math.min(...vals),
    // 상한 눌림 신호. span 이 0 이면 35덱이 한 값에 몰린 것이고,
    // clears === runs 면 모든 판이 클리어라 사망 웨이브가 아무 정보도 안 담는다.
    span: Math.max(...means) - Math.min(...means),
    clears,
    runs,
  };
}

module.exports = { measure, K, NAME, BRANCHES };

if (require.main === module) {
  const trials = Number(process.env.TRIALS || 6);
  let worst = 0;
  for (const [b3, b5] of BRANCHES) {
    const { contrib, spread } = measure(b3, b5, trials);
    worst = Math.max(worst, spread);
    console.log(
      ' 분기 ' + b3 + '/' + b5,
      '폭', spread.toFixed(2), ' ',
      K.map(k => NAME[k] + ' ' + (contrib[k] >= 0 ? '+' : '') + contrib[k].toFixed(2)).join(' '),
    );
  }
  console.log('\n최악 분기의 기여도 폭:', worst.toFixed(2), worst < 6 ? '(대등)' : '(불균형 — 손봐야 함)');
}
