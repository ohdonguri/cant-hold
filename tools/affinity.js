// 판이 어느 타워를 좋아하는가 — 「덱에 그 타워가 들어 있으면 얼마나 더 나아가는가」.
//
//   npm run affinity            35덱 x 8회 · 여섯 판 전부
//   TRIALS=12 npm run affinity  시행수를 올린다(태그에 실제 시행수가 찍힌다)
//
//   affinity(판, 타워) = mean(진도 p | 그 타워를 든 15덱) − mean(진도 p | 안 든 20덱)
//
// **이 자는 난이도를 재지 않는다 — 난이도 안에서의 「쏠림」을 잰다.** `npm run curve` 가
// 판이 얼마나 어려운지를 재는 눈금이라면, 여기는 같은 난이도 안에서 **어느 타워가 그
// 판에서 값을 하는가**를 잰다. 두 자는 같은 `p` 를 쓰지만 읽는 축이 다르다.
//
// 덱 크기가 3 이라 7종 중 3종을 고르는 조합은 35 개이고, 한 종류를 든 덱은 C(6,2)=15 ·
// 안 든 덱은 C(6,3)=20 이다. 그래서 두 무리의 크기가 15 대 20 으로 고정이고, 어느
// 종류를 봐도 같은 분할이라 열끼리 나란히 읽어도 된다.
//
// ── 제약 판은 덱 수가 다르다 (#50) ──────────────────────────
// **판이 덱을 제한하면(`allowKinds`) 이 도구가 35덱을 돌면 안 된다.** 못 고르는 덱을
// 재는 것이라 그 표는 게임에 없는 판을 잰 값이다. 허용 목록에서 조합을 다시 만들면
// 4종 중 3종 = **C(4,3) = 4덱**이고, 분할은 든 덱 C(3,2)=3 · 안 든 덱 C(3,3)=1 이 된다.
//
// **분할이 3 대 1 이라 열끼리의 비교는 여전히 되지만 표본이 얇다.** 「안 든 덱」이
// 하나뿐이라 그 한 덱이 통째로 기준선이다 — 공격 타워 열에서는 그 한 덱이 정확히
// 「오라 3종(공격 타워 없음)」이고, 그래서 이 판에서 그 열이 크게 양수인 것은
// **정의상 그렇다.** 이 표로 「이 판이 이 타워를 좋아한다」를 새로 알아내는 게 아니라
// **강제가 실제로 걸려 있는지**를 보는 것이다(직접 증거는 `npm test` 의 강제 게이트).
//
// 허용 목록을 여기 베끼지 않는다. `tools/sim.js` 가 내보내는 `allowedKinds` 로 살아
// 있는 판 정의에서 그대로 읽는다 — 베끼면 `index.html` 을 고쳤을 때 이 도구만 옛
// 목록을 재며 통과한다.
//
// ── 포화된 판은 아무것도 안 잰다 ──────────────────────────────
// **0 을 「선호 없음」으로 읽으면 안 된다.** ① 외곽 도로는 35덱이 전부 클리어해서
// `p` 가 35덱 모두 정확히 1.00 이고, 그래서 어느 열을 봐도 차이가 정확히 0 이다 —
// 「이 판은 타워를 안 가린다」가 아니라 **「이 자로는 아무것도 안 재고 있다」**다.
// 이 리포는 포화된 지표를 눈금으로 삼아 이미 여러 번 데었다(`tools/curve.js` 머리의
// `parity.js` · ⑤ hpMult 스윕). 그래서 행마다 「포화」/「무신호」를 박는다:
//
//   포화    클리어율이 높아 `p` 가 1.00 상한에 눌린 판. `curve.js` 와 같은 경계(0.95)
//   무신호  클리어는 안 나는데 덱끼리 `p` 가 거의 안 갈리는 판. 신호폭이 노이즈 수준
//
// 판정은 눈금이 아니라 **읽지 말라는 표시**라서 경계가 거칠어도 된다(`curve.js` 와
// 같은 규칙). 신호폭 열(최고덱 p − 최저덱 p)을 같이 찍으므로, 표시를 안 믿겠으면
// 그 수를 직접 보면 된다.
//
// ── 왜 행 끝에 태그가 붙는가 ────────────────────────────────
// `tools/curve.js` 머리와 같은 이유다. **절대 숫자는 전부 그리디 능력 세대에 묶여
// 있다** — 그리디가 자리를 고르는 규칙을 바꾸면 이 표가 통째로 움직인다(이 도구를
// 만든 이유가 정확히 그 이동을 재기 위해서다). 시행수·시드·`SUMMON_SAMPLES` 를
// 행마다 박아 두면 한 줄만 복사해 가도 출처가 같이 따라간다.
const { load, greedy, SUMMON_SAMPLES } = require('./sim.js');

const SEED = 12345;
const TRIALS = Number(process.env.TRIALS || 8);

// 포화 판정. `tools/curve.js` 의 `CLEAR_HI` 와 같은 경계다 — 같은 `p` 를 보는 자라
// 경계가 갈리면 한쪽 표에서만 「읽지 마라」가 붙는다.
const CLEAR_HI = 0.95;
// 신호폭 하한. 35덱의 최고−최저가 이보다 좁으면 열의 차이가 덱 간 흔들림에 묻힌다.
// 덱마다 시드를 재박아 짝지은 비교라 노이즈가 작은데도 이 폭이 안 나오면 볼 것이 없다.
const SPREAD_LO = 0.05;

// `tools/curve.js` · `tools/tune.js` 의 `run()` 과 **같은 관례로 덱마다 다시 박는다**
// (스윕 전체에 한 번이 아니다). 덱마다 같은 난수열을 주어야 덱끼리 같은 판으로 겨루고
// (짝지은 비교), 덱을 하나 빼도 나머지가 안 흔들린다. 이 도구는 15덱 무리와 20덱 무리의
// **평균 차이**를 보므로 짝짓기가 특히 중요하다 — 안 짝지으면 차이가 통째로 노이즈다.
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

// 한글은 한 자가 두 칸이라 padStart 로는 열이 안 맞는다. 표가 안 맞으면 눈으로
// 열끼리 비교할 수 없고, 이 도구는 열끼리 비교하려고 만든 것이다.
const vw = s => [...s].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2000 ? 2 : 1), 0);
const padS = (s, n) => ' '.repeat(Math.max(0, n - vw(s))) + s;
const padE = (s, n) => s + ' '.repeat(Math.max(0, n - vw(s)));

const g0 = load();
const KINDS = g0.KIND_KEYS.slice();
const TAG = `x${TRIALS} · seed${SEED}(덱마다 재박음) · SUMMON_SAMPLES=${SUMMON_SAMPLES}`;

// 진도 p 의 정의는 `tools/curve.js` 의 `measure()` 와 같다 — **클리어는 센티넬 99 가
// 아니라 총웨이브로 센다.** 99 로 세면 앞판의 p 가 4.9 로 튀어 「진도」가 뜻을 잃는다.
// (`curve.js` 를 불러 쓰지 못하는 것은 그 파일이 require 만으로 210판을 돌리는
// 최상위 스크립트이기 때문이다. 정의가 두 벌인 자리라 DESIGN §난이도의 눈금과
// 같이 봐야 한다.)
function measure(st, waveMax, DECKS) {
  const rows = [];
  let clearRuns = 0, runs = 0;
  for (const deck of DECKS) {
    // 클리어 여부를 진도와 **따로** 들고 나온다. 클리어를 총웨이브로 접은 뒤에
    // 「총웨이브면 클리어」로 되세면 마지막 웨이브에서 죽은 판까지 클리어로 세어져
    // 포화 표시가 실제보다 먼저 켜진다.
    const w = seeded(() => {
      const out = [];
      for (let i = 0; i < TRIALS; i++) {
        const g = load({});
        const r = greedy(g, { stage: st, deck });
        out.push({ clear: r.result === 'clear', wave: Math.min(r.wave, waveMax) });
      }
      return out;
    });
    clearRuns += w.filter(v => v.clear).length;
    runs += w.length;
    const sum = w.reduce((a, v) => a + (v.clear ? waveMax : v.wave), 0);
    rows.push({ deck, p: sum / w.length / waveMax });
  }
  const ps = rows.map(d => d.p).sort((a, b) => a - b);
  return { rows, clearRate: clearRuns / runs, spread: ps[ps.length - 1] - ps[0] };
}

const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

const { STAGES } = g0;
const out = [];
for (let st = 0; st < STAGES.length; st++) {
  const g = load({});
  g.loadStage(st);
  // 판마다 다시 만든다. 제약 판은 4덱, 나머지는 35덱이다.
  const decks = combos(g.allowedKinds(st), 3);
  const m = measure(st, g.CFG.WAVE_MAX, decks);
  // **못 고르는 종류는 빈칸이다.** 0 으로 찍으면 「선호 없음」과 구분이 안 되고,
  // 그건 이 파일 머리가 포화 판에서 이미 금지한 읽기다.
  const aff = KINDS.map(k => {
    const wi = m.rows.filter(d => d.deck.includes(k)).map(d => d.p);
    const wo = m.rows.filter(d => !d.deck.includes(k)).map(d => d.p);
    if (!wi.length || !wo.length) return null;
    return avg(wi) - avg(wo);
  });
  out.push({ st, aff, clearRate: m.clearRate, spread: m.spread, decks: decks.length });
}

console.log('── 판이 어느 타워를 좋아하는가 ──');
console.log('affinity = mean(진도 p | 그 타워를 든 덱) − mean(p | 안 든 덱). 양수면 그 판이 그 타워를 좋아한다.');
console.log('분할은 덱 수에 딸린다 — 35덱 판은 15 대 20, 제약 판(4덱)은 3 대 1 이다.');
console.log('`포화`/`무신호` 가 붙은 행은 아무것도 안 재고 있다 — 0 을 「선호 없음」으로 읽지 마라.');
console.log('* 는 공격 타워(KINDS[k].group === "attack"). 자리 선택이 성능인 것은 이쪽이다.');
console.log('`─` 는 그 판이 그 종류를 아예 안 받는다는 뜻이다(allowKinds). 0 과 다르다.');
console.log('');
console.log(padE('판', 14), padS('덱', 4), padS('클리어', 8), padS('신호폭', 8), padS('', 6),
  KINDS.map(k => padS((g0.KINDS[k].group === 'attack' ? '*' : '') + g0.KINDS[k].name, 8)).join(' '));
for (const r of out) {
  const mark = r.clearRate >= CLEAR_HI ? '포화' : r.spread < SPREAD_LO ? '무신호' : '';
  console.log(
    padE(`${r.st + 1} ${STAGES[r.st].name}`, 14),
    padS(String(r.decks), 4),
    padS((100 * r.clearRate).toFixed(1) + '%', 8),
    padS(r.spread.toFixed(3), 8),
    padS(mark, 6),
    r.aff.map(v => padS(v === null ? '─' : (v >= 0 ? '+' : '') + v.toFixed(3), 8)).join(' '));
}
console.log('');
console.log(TAG);
