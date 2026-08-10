// 시드 고정 밸런스 회귀.
//
//   node tools/seedcheck.js
//
// tools/test.js 는 전역 Math.random 을 그대로 두므로 실행할 때마다 결과가 다르다.
// 그래서 "밸런스를 한 줄도 안 고쳤는데 시뮬 결과가 바뀌었다"를 잡아내는 수단이
// 이 파일뿐이다. 연출·이펙트처럼 게임 규칙과 무관한 작업일수록 여기가 유일한 감시다.
// 별도 명령이면 아무도 안 돌리므로 `npm test` 가 test.js 다음에 이걸 이어서 돌린다.
//
// 결과 문자열만 보는 게 아니라 Math.random 호출 횟수까지 센다. 난수를 한 번 더
// 뽑으면 그 뒤의 모든 판정이 한 칸씩 밀린다 — 관측소 치명(25%), 조폐소 약탈(25%),
// 소환 자리, 덱·특성 롤이 전부 같은 스트림을 쓰기 때문이다. 이건 결과가 우연히
// 같아도 잠재적 회귀라서, 횟수가 어긋나면 실패로 본다.
//
// 연출 코드가 난수를 써야 하면 전역 Math.random 말고 연출 전용 시드를 따로 둘 것.
const { load, greedy } = require('./sim.js');

// verify-build.mjs 와 같은 LCG. 두 하네스가 같은 시드를 쓰면 스크린샷과
// 이 표가 같은 판을 가리킨다.
const SEED = 12345;

function seedRandom() {
  const orig = Math.random;
  let s = SEED >>> 0;
  let n = 0;
  Math.random = () => { n++; s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  return { calls: () => n, restore: () => { Math.random = orig; } };
}

// 기대값은 base 커밋에서 실측한 것이다. 밸런스를 의도적으로 바꿨다면
// 이 표를 같이 고쳐야 하고, 안 바꿨는데 어긋나면 그게 회귀다.
//
// [2026-08 관측소 표적 유지] 0번 케이스의 life 를 3 → 14 로 새로 떴다.
// 관측소 발사부가 매 발 HP 최고를 다시 고르던 것을 "직전 표적이 사거리 안에 살아
// 있으면 유지"로 바꿨다(index.html fireTower). 표적이 갈리는 시점이 달라지면 그
// 뒤의 처치 순서가 통째로 밀리므로 결과가 바뀌는 게 정상이다 — **의도한 밸런스
// 변경의 결과이지 회귀가 아니다.** 통과시키려고 맞춘 숫자와 구분되는 근거는 셋이다.
//   ① 난수 호출 횟수 102 가 그대로다. 관측소는 A 계열에서 난수를 안 뽑으므로
//      스트림이 밀렸다면 그건 이 변경이 아니라 다른 것이다
//   ② 바뀐 방향이 예측과 같다. 관측소가 든 덱이라 딜이 올라 관문이 덜 샜다(life↑).
//      1·3번 케이스는 문자열까지 그대로다 — 1번은 덱에 관측소가 없고, 3번은
//      관측소가 7성까지 못 가서 표적 선택이 결과를 못 바꾼다
//   ③ 연속타격 실측이 평균 1.31 → 2.29(최대 5), 5연타 도달 4.6% → 20.5% 로 움직였고
//      그게 tools/test.js 「관측소 표적 유지」에 단언으로 박혀 있다
//
// [2026-08 파쇄자 물리 취약] 같은 티켓의 두 번째 변경(`CFG.SHRED_VULN`)까지 반영해
// 세 케이스를 **다시 떴고, 세 줄 다 위 값 그대로였다.** 0번 케이스는 덱에 파쇄자가
// 있는데도 안 움직였는데, 그리디가 이 판을 20웨이브 클리어로 끝내서 요약 여섯 칸
// (result/wave/life/towers/maxStar/gold)이 전부 상한에 걸려 있기 때문이다 — 딜이
// 올라도 더 올라갈 칸이 없다. 기여도(parity)는 파쇄 −4.32 → −0.12 로 움직였으므로
// **"안 바뀌었으니 안 걸린 것"이 아니라 "이 세 케이스가 그 차이를 못 보는 것"이다.**
// 파쇄자 쪽 회귀를 잡는 것은 tools/test.js 「파쇄자 물리 취약」과 「기여도 폭」이다.
const CASES = [
  {
    name: '0 / 파쇄·관측·조폐',
    opts: { stage: 0, deck: ['shredder', 'marksman', 'mint'] },
    expect: '{"result":"clear","wave":20,"life":14,"towers":["marksman7","shredder1","shredder2","shredder6"],"maxStar":7,"gold":575}',
    rand: 102,
  },
  {
    name: '1 / 서리·박격·마력',
    opts: { stage: 1, deck: ['frost', 'mortar', 'arc'] },
    expect: '{"result":"over","wave":24,"life":0,"towers":["frost2","frost4","frost7","mortar7"],"maxStar":7,"gold":14}',
    rand: 144,
  },
  {
    name: '3 / 침식·마력·관측 (B,B1)',
    opts: { stage: 3, deck: ['eroder', 'arc', 'marksman'], branch3: 'B', branch5: 'B1' },
    expect: '{"result":"over","wave":24,"life":0,"towers":["arc7","eroder2","eroder4","eroder7"],"maxStar":7,"gold":14}',
    rand: 144,
  },
];

let fail = 0;
for (const c of CASES) {
  const rng = seedRandom();
  let got, calls;
  try {
    got = JSON.stringify(greedy(load(), c.opts));
    calls = rng.calls();
  } finally {
    rng.restore();
  }

  const sameResult = got === c.expect;
  const sameCalls = calls === c.rand;
  if (!sameResult || !sameCalls) fail++;

  console.log((sameResult && sameCalls ? '  PASS ' : '  FAIL ') + c.name +
    '   rand ' + calls + (sameCalls ? '' : ' (기대 ' + c.rand + ')'));
  if (!sameResult) {
    console.log('    기대 ' + c.expect);
    console.log('    실제 ' + got);
  }
}

console.log(fail ? `\n시드 회귀 실패 ${fail}건` : '\n시드 회귀 전부 통과');
process.exit(fail ? 1 : 0);
