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
// 백분위 = 고른 칸보다 점수가 **낮은** 후보의 비율. 0.5 근처면 균등 난수라는 뜻이다.
// k-표본 최고의 기대 백분위는 순서통계량이라 `k/(k+1)` 로 해석적으로 정해진다
// (k=1 → 0.50, 2 → 0.67, 3 → 0.75, 4 → 0.80). 그래서 이 표는 「높을수록 좋다」가
// 아니라 **「실측이 k/(k+1) 과 맞는가」**로 읽는다. 점수 정의는 `tools/sim.js` 의
// `spotScore` 를 그대로 쓴다 — 여기서 다시 구현하면 자가 둘이 되고, 재는 쪽과
// 놓는 쪽이 갈리면 이 지표는 아무것도 안 잠근다.
//
// **`npm test` 의 게이트도 이 파일의 `probe`/`meanPct` 를 부른다.** 백분위 계산을
// 두 벌 두었더니 이미 경계에서 갈려 있었다 — 이쪽은 후보가 1칸인 강제 선택을
// 백분위 0(최악)으로 세고 게이트는 건너뛰었다. 실측으로 소환 9882회 중 38회(0.4%)라
// 차이가 ~0.003 이었지만, **찍는 수와 잠그는 수가 같은 정의가 아니면** 위 문단이
// 커버에 대해 적어 둔 말이 백분위 자에도 그대로 걸린다. 규칙은 하나로 통일했다:
// **강제 선택(후보 1칸)은 정책에 대한 정보가 0 이므로 제외한다.**
//
// 종류별 줄을 따로 찍는 것은 **조폐소 때문**이다. 조폐소는 공격을 안 하는데 커버로
// 자리를 고르면 통로 옆 좋은 칸을 먹는다(사람은 안 그런다). 이 티켓은 종류 구분
// 없이 한 규칙으로 갔으므로, 다음 사람이 그 대가를 눈으로 볼 수 있어야 한다.
//
// **#48 부터 자가 종류마다 다르다.** 박격포는 폭발이 덮는 경로, 마력로는 빔이 꿰는
// 경로로 고른다(`tools/sim.js` §종류별 자리 점수). 그래서 백분위도 **그 종류가
// 실제로 쓴 자로** 잰다 — 전부 커버로 재면 박격포·마력로가 「자기 자를 잘 썼는데
// 남의 자로는 못 썼다」로 찍혀서, 위 `k/(k+1)` 대조가 그 둘에 대해 성립하지 않는다.
// 순서통계량이라는 성질은 **점수 함수가 무엇이든** 그대로다.
const { load, greedy, spotScore, spotRuler, summonSpots, SUMMON_SAMPLES } = require('./sim.js');

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

  const picks = [];
  const orig = g.summon;
  g.summon = function (kind, atX, atY) {
    const spots = summonSpots(g);               // 놓기 직전의 후보 칸 전부
    const before = g.state.towers.length;
    const r = orig.call(g, kind, atX, atY);
    // 후보가 1칸이면 **정책이 고른 게 아니라 강제된 것**이라 백분위에 정보가 0 이다.
    // 세면 늘 0(최악)으로 들어가 지표를 아래로 끌어당긴다. 게이트와 같은 규칙이다.
    if (g.state.towers.length > before && spots.length > 1) {
      const t = g.state.towers[g.state.towers.length - 1];
      // **놓은 타워의 종류로 자를 고른다.** `kind` 인자가 아니라 `t.kind` 를 쓰는
      // 것은 게임이 실제로 무엇을 세웠는지가 정본이기 때문이다.
      const score = spotScore(g, t.kind);
      const scores = spots.map(([x, y]) => score(x, y)).sort((a, b) => a - b);
      const mine = score(t.gx, t.gy);
      const below = scores.filter(v => v < mine).length;
      const tied = scores.filter(v => v === mine).length - 1;   // 나를 뺀 동률
      const n1 = spots.length - 1;
      picks.push({
        kind: t.kind, ruler: spotRuler(t.kind),
        mine, best: scores[scores.length - 1], med: scores[scores.length >> 1],
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
// **판마다 하나씩이고 판 수보다 짧을 수 있다.** 여섯 번째 판이 붙으면 그 줄은
// 기준선 없이 `—` 로 찍힌다 — 없는 값을 지어내느니 비워 두는 게 맞다.
const BASELINE = [0.513, 0.498, 0.482, 0.478, 0.510];

// 한 판의 평균 백분위. **게이트(`tools/test.js`)와 이 표가 같이 부르는 함수다.**
function meanPct(picks) {
  if (!picks.length) return null;
  return picks.reduce((s, p) => s + p.pct, 0) / picks.length;
}

function report(ks) {
  const { STAGES } = load();
  for (const k of ks) {
    console.log(`\n── k = ${k}  (기대 백분위 ${(k / (k + 1)).toFixed(2)}) · 시드 ${SEED} · ${TRIALS}시행 ──`);
    // 커버 세 칸은 **커버 자를 쓰는 종류만** 센다. 박격포(폭발)·마력로(관통)는 단위가
    // 달라 같이 평균 내면 수가 통째로 뜻을 잃는다 — 백분위는 단위가 없어서 안 그렇다.
    console.log('스테이지'.padEnd(10), '소환수', '고른커버', '최고커버', '중앙커버', '백분위', 'k=1', '  strict', '  종류별 백분위');
    // 판 목록을 하드코딩하지 않는다. 박아 두면 판이 늘었을 때 **조용히 안 잰다.**
    for (let st = 0; st < STAGES.length; st++) {
      const picks = seeded(() => {
        const out = [];
        for (let i = 0; i < TRIALS; i++) out.push(...probe(st, k));
        return out;
      });
      if (!picks.length) { console.log(`스테이지${st + 1} 소환 없음`); continue; }
      const avg = (rows, f) => (rows.length ? rows.reduce((s, p) => s + f(p), 0) / rows.length : NaN);
      const covPicks = picks.filter(p => p.ruler === '커버');
      const byKind = [...new Set(picks.map(p => p.kind))].sort()
        .map(kd => kd + ' ' + avg(picks.filter(p => p.kind === kd), p => p.pct).toFixed(2))
        .join(' · ');
      console.log(
        `스테이지${st + 1}`.padEnd(10),
        String(Math.round(picks.length / TRIALS)).padStart(6),
        avg(covPicks, p => p.mine).toFixed(2).padStart(8),
        avg(covPicks, p => p.best).toFixed(2).padStart(8),
        avg(covPicks, p => p.med).toFixed(2).padStart(8),
        meanPct(picks).toFixed(3).padStart(7),
        (BASELINE[st] === undefined ? '—' : BASELINE[st].toFixed(3)).padStart(5),
        avg(picks, p => p.strict).toFixed(3).padStart(8),
        '  ' + byKind);
    }
  }
}

if (require.main === module) {
  // k 는 정수 1 이상만 받는다. `greedy` 가 어차피 던지지만, 여기서 걸러야
  // 「k=0 행」 같은 거짓 헤더가 안 찍힌다.
  const ks = process.argv.slice(2).map(Number);
  const bad = ks.filter(n => !Number.isInteger(n) || n < 1);
  if (bad.length) {
    console.error('k 는 1 이상의 정수라야 한다: ' + bad.join(', '));
    process.exit(1);
  }
  report(ks.length ? ks : [SUMMON_SAMPLES]);
  console.log('\n기준선은 #35 착수 시점(균등 난수)의 실측이다. 백분위 0.5 근처면 균등 난수라는 뜻이고,');
  console.log('k-표본 최고라면 k/(k+1) 근처여야 한다 — 그보다 훨씬 높으면 자리를 너무 잘 고르는 것이다.');
}

// `tools/test.js` 의 배치 백분위 게이트가 이 둘을 부른다. 계측과 게이트가 같은 자를
// 쓰게 하는 것이 목적이라 **여기 규칙을 고치면 게이트도 같이 움직여야 정상**이다.
module.exports = { probe, meanPct };
