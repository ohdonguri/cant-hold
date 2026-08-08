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
const CASES = [
  {
    name: '0 / 파쇄·관측·조폐',
    opts: { stage: 0, deck: ['shredder', 'marksman', 'mint'] },
    expect: '{"result":"clear","wave":20,"life":3,"towers":["marksman7","shredder1","shredder2","shredder6"],"maxStar":7,"gold":575}',
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
