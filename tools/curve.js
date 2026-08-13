// 스테이지 난이도 곡선. **눈금의 정본이다** — 상수를 정할 때 보는 표는 여기서 뜬다.
//
//   npm run curve            35덱 x 6회 · 다섯 판 전부
//   TRIALS=12 npm run curve  시행수를 올린다(태그에 실제 시행수가 찍힌다)
//
// `npm test` 의 밸런스 블록(고정덱 1개 · 8회 · 무시드)은 **게이트용이지 눈금이 아니다.**
// 8표본은 「S2 를 매번 깨는가 자주 깨는가」를 못 가른다 — 실제로 그 8/8 을 35덱 표의
// 17/35 와 나란히 놓고 읽은 적이 있는데, 하나는 고정덱 판 단위이고 하나는 덱 단위라
// 애초에 같은 축이 아니었다. 상수를 정할 때는 여기(210판)를 쓴다.
//
// ── 왜 지표가 둘인가 ─────────────────────────────────────────
// **다섯 판을 한 자로 못 잰다.** 어느 지표도 다섯 판 전부에서 살아 있지 않다:
//   · 클리어판 비율 — S1·S2 에서 읽는다. S3~S5 는 0~3% 로 **바닥에 눌려** 못 읽는다.
//   · 진도 p = 평균웨이브 / 총웨이브 — S3~S5 에서 읽는다. S1·S2 는 클리어가 많아
//     **1.00 상한에 눌린다**(클리어를 총웨이브로 세므로 클리어판은 정확히 1.00 이다).
// 그래서 두 칸을 같이 찍고, 눌린 칸에는 `상한`/`바닥` 을 박아 **읽으면 안 되는 칸**임을
// 값 옆에 적는다. 이 리포는 포화된 지표를 눈금으로 삼아 이미 두 번 데었다 —
// `parity.js` 가 S1 에서 재서 기여도가 0 으로 수렴한 것(DESIGN §타워 대등성), 그리고
// ⑤ hpMult 를 1.0/0.8/0.7/0.6 으로 훑었는데 「클리어 0/8 · 중앙 w28~30」으로 전부
// 같아 못 갈린 것(index.html ⑤ 분수령 주석)이다. 둘 다 「차이가 없다」가 아니라
// **「그 자로는 아무것도 안 재고 있다」**였다.
//
// **p 에 클리어 센티넬 99 를 쓰지 않는다.** 99 로 세면 S1 의 p 가 4.9 로 튀어 「진도」가
// 뜻을 잃는다. 클리어는 그 판을 끝까지 간 것이므로 **총웨이브로 센다.** `전체평균` 열만
// 99 센티넬 그대로인데, 그건 DESIGN §밸런스 표와 대조하기 위한 호환 열이고
// **눈금으로 쓰지 않는다.**
//
// ── 왜 행마다 태그가 붙는가 ──────────────────────────────────
// **절대 숫자는 전부 그리디 능력 세대에 묶여 있다.** #31 이 셋째 종류를 짓게 하자 네 판이
// 통째로 쉬워졌고, #35 가 자리를 보고 놓게 하자 또 움직였다. 두 번 다 `index.html` 은
// 한 줄도 안 고쳤다 — 바뀐 것은 **재는 쪽**이다. 값만 옮겨 적으면 다음 사람이
// 「눈금이 틀렸다」와 「자가 바뀌었다」를 못 가른다. #28 은 **어느 판인지** 안 적어서
// 났고, #31·#35 뒤의 혼선은 **어느 그리디인지** 안 적어서 났다. 태그를 행 끝에 박는
// 것은 한 줄만 복사해 가도 출처가 같이 따라가게 하려는 것이다.
const { load, greedy, SUMMON_SAMPLES } = require('./sim.js');

const KINDS = ['shredder', 'eroder', 'frost', 'mortar', 'marksman', 'arc', 'mint'];
const SEED = 12345;
const TRIALS = Number(process.env.TRIALS || 6);

// DESIGN §밸런스 표가 쓰는 클리어 센티넬. **`전체평균` 열 전용이다.**
const CLEAR_SENTINEL = 99;

// 포화 판정. 눈금이 아니라 **읽지 말라는 표시**라서 경계가 거칠어도 된다.
//   클리어판 비율은 위아래 양쪽으로 눌린다(S1 99.5% · S5 0%).
//   p 는 클리어판이 정확히 1.00 을 찍으므로 클리어가 조금만 섞여도 위로 끌린다.
const CLEAR_HI = 0.95, CLEAR_LO = 0.05, P_SATURATED_AT = 0.10;

// greedy 는 rollDeck·소환·적 배치까지 전역 Math.random 을 쓴다. `tools/tune.js` 의
// `run()` 과 **같은 관례로 덱마다 다시 박는다**(스윕 전체에 한 번이 아니다). 덱마다
// 같은 난수열을 주어야 덱끼리 같은 판으로 겨루고(짝지은 비교), 덱을 하나 빼도 나머지
// 행이 안 흔들린다. 시딩 방식이 바뀌면 표가 통째로 달라지므로 태그에 같이 적는다.
function seeded(fn) {
  const orig = Math.random;
  let s = SEED >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  try { return fn(); } finally { Math.random = orig; }
}

function combos(a, k) {
  if (k === 0) return [[]];
  if (a.length < k) return [];
  const [h, ...r] = a;
  return combos(r, k - 1).map(c => [h, ...c]).concat(combos(r, k));
}

const DECKS = combos(KINDS, 3);
// **`starMax` 를 태그에 같이 박는다**(#39). 도전 판이 붙으면서 이 표에 **규칙이 다른
// 판**이 처음으로 섞였다 — 판 이름만 보고는 어느 규칙으로 잰 값인지 모른다. 위 「행마다
// 태그가 붙는가」와 같은 취지다: 한 줄만 복사해 가도 출처가 따라가야 한다.
const TAG = `${DECKS.length}덱x${TRIALS} · seed${SEED}(덱마다 재박음) · SUMMON_SAMPLES=${SUMMON_SAMPLES}`;
const rowTag = r => `${TAG} · starMax=${r.starMax}`;

// 한 판을 35덱 x TRIALS 회 돌린다. 반환값은 **두 자로 같이 잰 것**이다 —
// 센티넬 평균(호환)과 총웨이브로 자른 진도(눈금)를 한 번의 시행에서 뽑으므로
// 두 열이 서로 다른 표본을 보는 일이 없다.
function measure(st, waveMax, starMax, curve) {
  const means = [], prog = [];
  let clearDecks = 0, clearRuns = 0, runs = 0;
  for (const deck of DECKS) {
    const w = seeded(() => {
      const out = [];
      for (let i = 0; i < TRIALS; i++) {
        const g = load({});
        const r = greedy(g, { stage: st, deck });
        out.push(r.result === 'clear' ? CLEAR_SENTINEL : r.wave);
      }
      return out;
    });
    means.push(w.reduce((a, b) => a + b, 0) / w.length);
    // 클리어를 총웨이브로 자른다. 안 클리어한 판은 이미 총웨이브 이하라 그대로 남는다.
    prog.push(w.reduce((a, b) => a + Math.min(b, waveMax), 0) / w.length);
    if (w.some(v => v === CLEAR_SENTINEL)) clearDecks++;
    clearRuns += w.filter(v => v === CLEAR_SENTINEL).length;
    runs += w.length;
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sorted = means.slice().sort((a, b) => a - b);
  return {
    st, waveMax, starMax, curve, clearDecks, clearRuns, runs,
    clearRate: clearRuns / runs,
    p: avg(prog) / waveMax,
    mean: avg(means), best: sorted[sorted.length - 1], worst: sorted[0],
  };
}

// 판 목록을 하드코딩하지 않는다. 박아 두면 판이 늘었을 때 **조용히 안 잰다**(place.js 와 같은 규칙).
const { STAGES, isCurveStage } = load();
const rows = [];
for (let st = 0; st < STAGES.length; st++) {
  const g = load({});
  g.loadStage(st);
  // `starMax` 도 게임에서 그대로 읽는다. 여기 상수를 베끼면 판 정의를 고쳤을 때
  // 태그만 조용히 틀린다 — `waveMax` 를 게임에서 읽는 것과 같은 이유다.
  rows.push(measure(st, g.CFG.WAVE_MAX, g.CFG.STAR_MAX, isCurveStage(STAGES[st])));
}
// 계단 위의 판만 S 번호를 받는다. 도전 판을 S6 으로 찍으면 다음 사람이 이 표를
// 위에서 아래로 읽으며 「여섯 번째 계단」으로 오해한다.
let ci = 0;
for (const r of rows) r.label = r.curve ? 'S' + (r.st + 1) : 'C' + ++ci;

console.log('── 난이도 눈금 ──');
console.log('판 이름: ' + rows.map(r => `${r.label} ${STAGES[r.st].name}`).join(' · '));
console.log('`상한`/`바닥` 이 붙은 칸은 포화라 아무것도 안 재고 있다 — 눈금으로 쓰지 마라.');
console.log('클리어가 거의 다 나는 앞 판은 클리어판 비율로, 바닥에 눌린 뒤 판은 진도 p 로 읽는다.');
console.log('`전체평균`은 클리어를 99 로 세는 DESIGN 표 호환 열이고 **눈금이 아니다**');
console.log('(p 는 클리어를 총웨이브로 센다). 판마다 어느 칸을 읽는지는 DESIGN §난이도의 눈금.');
console.log('**C 행(도전 판)은 계단 밖이다 — `p` 로 줄 세우지 마라.** 그 판은 난이도 축이');
console.log('아니라 규칙 축으로 만든 판이라, 여기서는 `기록` 으로만 찍고 판정에 안 쓴다.');
console.log('');
console.log('판  총웨이브        클리어판       진도 p     전체평균(99·눈금아님)  표본·시딩');
for (const r of rows) {
  const clearMark = r.clearRate >= CLEAR_HI ? ' 상한' : r.clearRate <= CLEAR_LO ? ' 바닥' : '    ';
  // 도전 판의 `p` 는 **눈금이 아니라 기록**이다. 포화 표시(`상한`)와 같은 자리에
  // 찍는 이유도 같다 — 이 칸은 읽으면 안 된다는 표시가 값 옆에 붙어 있어야 한다.
  const pMark = !r.curve ? ' 기록' : r.clearRate >= P_SATURATED_AT ? ' 상한' : '    ';
  console.log(
    r.label.padEnd(4),
    String(r.waveMax).padStart(5),
    `${r.clearRuns}/${r.runs}`.padStart(10),
    (100 * r.clearRate).toFixed(1).padStart(6) + '%' + clearMark,
    r.p.toFixed(2).padStart(6) + pMark,
    r.mean.toFixed(1).padStart(12),
    '  ' + rowTag(r));
}

// ── 도전 판은 「같은 지형의 본편 판」과만 견준다 ─────────────────
// 계단에서의 위치가 아니라 **제약의 효과**를 보는 것이라, 지형이 같은 판과
// 나란히 놓아야 차이가 `starMax` 로 읽힌다. 같은 실행에서 잰 두 값이라
// 그리디 세대·시딩·표본이 자동으로 같다(그게 이 대조의 전제다).
for (const r of rows) {
  if (r.curve) continue;
  const base = rows.find(b => b.curve
    && JSON.stringify(STAGES[b.st].lanes) === JSON.stringify(STAGES[r.st].lanes));
  if (!base) { console.log(`\n${r.label}: 지형이 같은 본편 판이 없다 — 대조 생략`); continue; }
  console.log(`\n── ${r.label} 대 ${base.label} (지형 동일 · 규칙만 다르다) ──`);
  console.log(`클리어판  ${base.label} ${(100 * base.clearRate).toFixed(1)}% (starMax ${base.starMax})`
    + `  →  ${r.label} ${(100 * r.clearRate).toFixed(1)}% (starMax ${r.starMax})`);
  console.log('이 두 칸의 차이가 곧 제약의 효과다. **비율이 0 이나 1 에 붙으면 그 판은');
  console.log('제약을 얹어도 아무것도 안 읽히는 판이라는 뜻이다** — ② 를 복사한 이유가 그것이다.');
}

// DESIGN §밸런스 표를 이 도구로 다시 뜰 수 있어야 한다. 형식이 갈리면 문서를 손으로
// 옮겨 적게 되고, 그게 정본이 셋으로 갈라진 원인이다(#37). 이 블록은 그대로 붙여넣는 용도다.
console.log('\n── DESIGN §밸런스는 시뮬레이션으로 역산한다 붙여넣기용 (클리어 99) ──');
console.log('스테이지  총웨이브  전체평균  최고덱  최저덱  클리어덱  클리어판');
// **계단 위의 판만 붙여넣는다.** 저 표는 스테이지 계단의 표이고, 도전 판을 끼우면
// 문서에서 여섯 번째 계단으로 굳는다. 도전 판의 값은 위 대조 블록에 있다.
for (const r of rows.filter(x => x.curve)) {
  console.log(
    `   ${r.st + 1}`.padEnd(9),
    String(r.waveMax).padStart(5),
    r.mean.toFixed(1).padStart(9),
    r.best.toFixed(1).padStart(7),
    r.worst.toFixed(1).padStart(7),
    `${r.clearDecks}/${DECKS.length}`.padStart(8),
    `${r.clearRuns}/${r.runs}`.padStart(9));
}
console.log(TAG);
