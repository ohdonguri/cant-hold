// 그리디가 고른 자리는 「놓을 수 있었던 자리들」 중 어디쯤인가.
//
//   node tools/place.js              출시 노브(sim.js SUMMON_SAMPLES)로 다섯 판
//   node tools/place.js 1 2 3 4      k 를 훑어 비교한다
//
// **이 지표가 없으면 배치 규칙은 다음 티켓에서 조용히 죽는다.** #31 의 「지은 종류
// 평균 2.00 → 3.00」과 같은 자리다 — 난이도(사망 웨이브)는 배치 말고도 열 가지가
// 움직이므로, 「그리디가 자리를 보고 놓는가」는 난이도와 **독립인 자**로 따로 재야
// 한다. `npm test` 의 「배치 백분위」 게이트가 이 값을 상·하한으로 잠근다.
//
// 백분위 = 고른 칸보다 커버가 **낮은** 후보의 비율. 0.5 근처면 균등 난수라는 뜻이다.
// k-표본 최고의 기대 백분위는 순서통계량이라 `k/(k+1)` 로 해석적으로 정해진다
// (k=1 → 0.50, 2 → 0.67, 3 → 0.75, 4 → 0.80). 그래서 이 표는 「높을수록 좋다」가
// 아니라 **「실측이 k/(k+1) 과 맞는가」**로 읽는다. 커버 정의(사거리 안 경로 칸 수)와
// 사거리는 `tools/sim.js` 의 `coverTable` 을 그대로 쓴다 — 여기서 다시 구현하면
// 자가 둘이 되고, 재는 쪽과 놓는 쪽이 갈리면 이 지표는 아무것도 안 잠근다.
//
// 종류별 줄을 따로 찍는 것은 **조폐소 때문**이다. 조폐소는 공격을 안 하는데 커버로
// 자리를 고르면 통로 옆 좋은 칸을 먹는다(사람은 안 그런다). 이 티켓은 종류 구분
// 없이 한 규칙으로 갔으므로, 다음 사람이 그 대가를 눈으로 볼 수 있어야 한다.
const { load, greedy, coverTable, summonSpots, SUMMON_SAMPLES } = require('./sim.js');

const SEED = 12345;
const TRIALS = 6;

function seeded(fn) {
  const orig = Math.random;
  let s = SEED >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  try { return fn(); } finally { Math.random = orig; }
}

// 한 판을 돌리되 소환마다 「고른 자리의 커버」와 「고를 수 있었던 자리들의 커버
// 분포」를 같이 기록한다. `summon` 을 감싸서 **관찰만** 한다 — 자리를 고르는 것은
// 여전히 sim.js 이고, 여기서 고르면 재는 대상이 이 파일이 된다.
function probe(stage, samples) {
  const g = load({});
  g.loadStage(stage);
  const cover = coverTable(g);

  const picks = [];
  const orig = g.summon;
  g.summon = function (kind, atX, atY) {
    const spots = summonSpots(g);               // 놓기 직전의 후보 칸 전부
    const before = g.state.towers.length;
    const r = orig.call(g, kind, atX, atY);
    if (g.state.towers.length > before && spots.length) {
      const t = g.state.towers[g.state.towers.length - 1];
      const covs = spots.map(([x, y]) => cover(x, y)).sort((a, b) => a - b);
      const mine = cover(t.gx, t.gy);
      const below = covs.filter(v => v < mine).length;
      const tied = covs.filter(v => v === mine).length - 1;   // 나를 뺀 동률
      const n1 = Math.max(1, spots.length - 1);
      picks.push({
        kind: t.kind,
        mine, best: covs[covs.length - 1], med: covs[covs.length >> 1],
        // **동률을 반씩 센다(midrank).** 「나보다 낮은 것의 비율」만 세면 동률이
        // 많은 판에서 백분위가 통째로 눌린다 — 균등 난수인데도 0.5 가 안 나온다.
        // ① 외곽 도로가 정확히 그 판이고(커버 편차 0.82 — DESIGN §스테이지가
        // 「어디에 놓아도 비슷」이라고 적어 둔 의도된 성질이다), 균등 난수 실측이
        // 0.30 까지 눌린다. 그 자로는 「k/(k+1) 과 맞는가」를 판정할 수 없다.
        //
        // midrank 는 동률 쌍에 0.5 씩 주므로 **분포 모양과 무관하게 균등 난수가
        // 정확히 0.5** 다(어느 두 후보든 한쪽이 1·다른 쪽이 0, 동률이면 둘 다 0.5).
        // 게이트가 보는 것은 이쪽이다. `strict` 는 PM 기준선과 잇대어 보려고 남긴다.
        pct: (below + tied / 2) / n1,
        strict: below / n1,
        n: spots.length,
      });
    }
    return r;
  };

  greedy(g, { stage, samples });
  return picks;
}

// 기준선 = **이 파일로 다시 뜬 k=1 실측**(시드 12345 · 6시행 · midrank).
// k=1 은 「아무 데나」와 비트 단위로 같으므로 이 줄이 곧 #35 이전의 동작이다.
//
// PM 이 착수 때 준 0.352 / 0.449 / 0.450 / 0.440 / 0.459 는 여기 안 쓴다. 그 표는
// 계측 스크립트가 경로 칸을 **Set 이 아니라 배열**에 모아 겹치는 구간을 여러 번
// 센 값이라(④ 역류는 두 레인이 서로의 역순이라 2.57배로 부풀었다) `tools/paths.js`
// 의 `spread()` 와 다른 자다. 동률 처리도 달랐다(위 `pct` 주석). 두 자를 섞어
// 비교하면 개선폭을 잘못 읽는다.
const BASELINE = [0.513, 0.498, 0.482, 0.478, 0.510];

const KS = process.argv.slice(2).map(Number).filter(n => n > 0);
const RUNS = KS.length ? KS : [SUMMON_SAMPLES];

for (const k of RUNS) {
  console.log(`\n── k = ${k}  (기대 백분위 ${(k / (k + 1)).toFixed(2)}) · 시드 ${SEED} · ${TRIALS}시행 ──`);
  console.log('스테이지'.padEnd(10), '소환수', '고른커버', '최고커버', '중앙커버', '백분위', 'k=1', '  strict', '  종류별 백분위');
  for (const st of [0, 1, 2, 3, 4]) {
    const picks = seeded(() => {
      const out = [];
      for (let i = 0; i < TRIALS; i++) out.push(...probe(st, k));
      return out;
    });
    if (!picks.length) { console.log(`스테이지${st + 1} 소환 없음`); continue; }
    const avg = (rows, f) => rows.reduce((s, p) => s + f(p), 0) / rows.length;
    const byKind = [...new Set(picks.map(p => p.kind))].sort()
      .map(kd => kd + ' ' + avg(picks.filter(p => p.kind === kd), p => p.pct).toFixed(2))
      .join(' · ');
    console.log(
      `스테이지${st + 1}`.padEnd(10),
      String(Math.round(picks.length / TRIALS)).padStart(6),
      avg(picks, p => p.mine).toFixed(2).padStart(8),
      avg(picks, p => p.best).toFixed(2).padStart(8),
      avg(picks, p => p.med).toFixed(2).padStart(8),
      avg(picks, p => p.pct).toFixed(3).padStart(7),
      BASELINE[st].toFixed(3).padStart(5),
      avg(picks, p => p.strict).toFixed(3).padStart(8),
      '  ' + byKind);
  }
}

console.log('\n기준선은 #35 착수 시점(균등 난수)의 실측이다. 백분위 0.5 근처면 균등 난수라는 뜻이고,');
console.log('k-표본 최고라면 k/(k+1) 근처여야 한다 — 그보다 훨씬 높으면 자리를 너무 잘 고르는 것이다.');
