// ../index.html 에서 토스판 index.html 을 만든다.
//
// 예전에 형제 리포(fruit-smash)는 토스판이 웹판을 복사해 손으로 고친 별개 파일이었다.
// 그래서 웹판만 고쳐 나가는 동안 토스판이 8월 5일자에 멈췄고, 뒤늦게 보니 등급분류번호
// 표시도 없고 내려놓은 완벽한 타격이 거기서는 살아 있었다. **게임을 두 벌 두면 반드시
// 갈린다.** 여기도 같은 규칙을 쓴다 — 게임은 `../index.html` 한 벌뿐이고, 이 스크립트가
// 그걸 그대로 가져와 **토스에 없는 것만** 걷어낸다.
//
//   1. 계정 절(구글 로그인 + Firestore)  →  스텁으로 갈아 끼운다
//   2. manifest 링크                      →  미니앱에는 홈 화면 추가가 없다
//   3. favicon · apple-touch-icon 링크    →  토스는 콘솔에 올린 아이콘을 쓴다.
//                                            게다가 toss/ 옆에 icons/ 가 없어서
//                                            vite 가 참조를 못 풀고 빌드가 죽는다
//   4. 토스 런타임(./toss.js) 삽입        →  광고·화면 적응. 게임 코드는 안 건드린다
//
// **서비스워커는 애초에 없다.** cant-hold 는 등록 코드가 한 줄도 없어서 걷어낼 것이
// 없다 — 아래 남으면 안 되는 목록이 그 사실을 계속 확인한다.
//
// 걷어내는 대신 **이름은 남긴다.** `cloud` · `cloudSave` · `cloudToggle` 은 게임의
// persist()·그리기·탭 판정이 부르고 있어서, 지우면 그 자리에서 널이 된다. fruit-smash
// 가 로그인 버튼 마크업을 안 지우고 런타임에 감추는 것과 같은 이유다. 여기서는 캔버스
// 한 장뿐이라 감출 마크업이 없고, 대신 스텁의 `CLOUD_UI = false` 하나가 그 일을 한다.
//
// 표식을 못 찾으면 **조용히 넘어가지 않고 멈춘다.** 웹판 구조가 바뀐 것이고, 그대로
// 두면 구글 로그인 코드가 토스 번들에 섞여 들어간다.
//
//   node sync.mjs            생성
//   node sync.mjs --check    지금 파일이 최신인지만 확인 (안 고침)

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'index.html');
const OUT = join(here, 'index.html');
const SPRITES_SRC = join(here, '..', 'assets', 'sprites');
const SPRITES_OUT = join(here, 'public', 'assets', 'sprites');

function filesUnder(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = prefix ? join(prefix, entry.name) : entry.name;
    return entry.isDirectory() ? filesUnder(join(dir, entry.name), rel) : [rel];
  }).sort();
}

function spriteDrift() {
  const srcFiles = filesUnder(SPRITES_SRC);
  const outFiles = filesUnder(SPRITES_OUT);
  if (srcFiles.join('\n') !== outFiles.join('\n')) return true;
  return srcFiles.some(rel =>
    !readFileSync(join(SPRITES_SRC, rel)).equals(readFileSync(join(SPRITES_OUT, rel))));
}

let s = readFileSync(SRC, 'utf8');

// 표식 하나를 찾는다. 못 찾거나 여러 번 나오면 멈춘다 — 여러 번 나오면 어느 쪽을
// 자를지가 실행마다 달라지는 것이 아니라 **처음 것만 잘려** 나머지가 조용히 남는다.
function findOnce(needle, label) {
  const at = s.indexOf(needle);
  if (at < 0) throw new Error(`${label} 표식을 못 찾았다: ${needle}`);
  if (s.indexOf(needle, at + 1) >= 0) throw new Error(`${label} 표식이 여러 번 나온다: ${needle}`);
  return at;
}

// ── 1) 계정 절을 스텁으로 갈아 끼운다 ────────────────────────
// 웹판의 계정 코드는 인라인 스크립트 **안의 한 절**이라 <script> 경계로는 못 자른다
// (그렇게 자르면 게임이 통째로 날아간다). 절의 머리 배너와 다음 절의 머리 배너를
// 표식으로 잡아 그 사이를 들어낸다.
const ACCOUNT_HEAD = '// 계정 (선택)';
const ACCOUNT_END = '// ── 스테이지 선택 ─';

const headAt = findOnce(ACCOUNT_HEAD, '계정 절 머리');
// 배너 줄(`// ══…`)까지 거슬러 올라간다. 주석 한 덩어리를 통째로 가져가야 한다.
const bannerAt = s.lastIndexOf('\n// ═', headAt);
if (bannerAt < 0) throw new Error('계정 절의 배너 시작을 못 찾았다');
const endAt = findOnce(ACCOUNT_END, '스테이지 선택 절 머리');
if (endAt < bannerAt) throw new Error('계정 절이 스테이지 선택 절보다 뒤에 있다 — 표식이 어긋났다');

const STUB = `
// ═════════════════════════════════════════════════════════════
// 계정 — 토스판에는 없다  (toss/sync.mjs 가 웹판의 「계정 (선택)」 절을 이걸로 갈았다)
//
// 미니앱은 구글 로그인을 못 쓴다. 토스 웹뷰 안에서 팝업이 안 열리고, 애초에 토스는
// 익명 키로 사람을 가리므로 request.auth 가 없다. 그래서 Firebase SDK 를 아예 안
// 싣는다 — 안 싣는 것이지 꺼 두는 것이 아니다. 심사에 나가는 번들에 구글 로그인
// 코드가 섞여 들어가면 안 된다.
//
// **이름은 웹판과 똑같이 남긴다.** persist() 가 cloudSave 를, 스테이지 화면의
// 그리기·탭 판정이 cloud·cloudLoading·cloudToggle 을 부른다. 지우면 그 자리에서
// 널이 된다. CLOUD_UI 만 false 라서 로그인 줄이 아예 안 그려지고 안 눌린다.
//
// 세이브는 localStorage 그대로다(toss/toss.js 머리 주석에 근거).
// ═════════════════════════════════════════════════════════════
const CLOUD_UI = false;
const cloud = { ready: false, user: null, busy: false, msg: '', ok: null };
const cloudLoading = null;
function cloudPreload() {}
function cloudSave() {}
function cloudToggle() {}

`;
s = s.slice(0, bannerAt + 1) + STUB.slice(1) + s.slice(endAt);

// ── 2) manifest 링크 ─────────────────────────────────────────
const MANIFEST = '<link rel="manifest" href="./manifest.webmanifest">\n';
if (!s.includes(MANIFEST)) throw new Error('manifest 링크를 못 찾았다');
s = s.replace(MANIFEST, '');

// ── 3) 홈 화면 아이콘 링크 ───────────────────────────────────
// vite 가 <link href="./icons/…"> 를 자산으로 풀려고 하는데 toss/ 옆에는 icons/ 가
// 없다. 남겨 두면 빌드가 "Failed to resolve" 로 죽는다.
for (const rel of ['icon', 'apple-touch-icon']) {
  const re = new RegExp(`<link rel="${rel}"[^>]*>\\n`);
  if (!re.test(s)) throw new Error(`${rel} 링크를 못 찾았다`);
  s = s.replace(re, '');
}

// ── 4) 토스 런타임 ───────────────────────────────────────────
// **게임 스크립트 뒤에 붙인다.** type="module" 이라 어차피 defer 로 게임보다 늦게
// 돌지만, 파일 순서까지 뒤로 두어야 「첫 <script> 는 게임」이라는 규칙이 안 흔들린다.
const GAME_END = '</script>\n<!-- ══';
findOnce(GAME_END, '게임 스크립트의 끝(EASTBIRD 인트로 블록 바로 앞)');
s = s.replace(GAME_END,
  '</script>\n'
  + '<!-- 토스 런타임. 광고와 화면 적응만 한다 — 게임 코드는 한 줄도 안 건드린다.\n'
  + '     vite 가 npm 의존성을 번들에 묶으려면 별도 파일이어야 해서 인라인이 아니다. -->\n'
  + '<script type="module" src="./toss.js"></script>\n'
  + '<!-- ══');

// ── 남으면 안 되는 것들 ──────────────────────────────────────
// 하나라도 걸리면 위 잘라내기가 어긋난 것이다.
for (const [needle, why] of [
  ['firebasejs', '구글 인증·Firestore SDK'],
  ['gstatic.com', '구글 CDN'],
  ['FIREBASE_CONFIG', 'Firebase 설정'],
  ['signInWithPopup', '구글 로그인'],
  ['games/canthold/saves', 'Firestore 세이브 경로'],
  ['serviceWorker', '서비스워커'],
  ['manifest.webmanifest', 'manifest'],
  ['apple-touch-icon', '홈 화면 아이콘 링크'],
]) {
  if (s.includes(needle)) throw new Error(`토스판에 ${why} 가 남았다 (${needle})`);
}

// 반대쪽도 본다. 잘라내기가 너무 많이 먹으면 게임이 통째로 사라지는데, 위 목록만으로는
// 그게 전부 통과로 보인다.
for (const [needle, why] of [
  ['requestAnimationFrame(frame)', '게임 루프'],
  ['이번 웨이브는 못 막습니다', '제목'],
  ['cant-hold-progress', '세이브 키'],
  ['const CLOUD_UI = false', '계정 스텁'],
  ['./toss.js', '토스 런타임'],
  ['ebIntro', 'EASTBIRD 인트로'],
]) {
  if (!s.includes(needle)) throw new Error(`토스판에서 ${why} 가 사라졌다 (${needle})`);
}

// 스텁이 다시 선언하는 이름이 웹판 쪽 쓰임과 어긋나면 토스판이 부팅에서
// ReferenceError 로 죽는다. 그런데 위 「있어야 한다」 목록만으로는 **스텁 자기 자신이
// 그 이름을 갖고 있으니 통과**다. 그래서 쓰임의 **개수**를 본다 — 스텁 밖에서
// 최소 셋(STAGE_TAIL_H · 로그인 줄 그리기 · stageTap)이 CLOUD_UI 를 봐야 한다.
// (지금은 6 이다: 스텁의 선언 1 + 스텁 주석 1 + 바깥 4.)
const uses = s.split('CLOUD_UI').length - 1;
if (uses < 5) throw new Error(
  `CLOUD_UI 쓰임이 ${uses} 개뿐이다 — 웹판에서 이 이름이 바뀌었거나 로그인 줄의 가림이 풀렸다`);

if (process.argv.includes('--check')) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (cur !== s) {
    console.error('toss/index.html 이 웹판과 어긋나 있다. `node toss/sync.mjs` 로 다시 만들 것.');
    process.exit(1);
  }
  if (spriteDrift()) {
    console.error('toss/public 스프라이트가 웹판과 어긋나 있다. `node toss/sync.mjs` 로 다시 만들 것.');
    process.exit(1);
  }
  console.log('toss/index.html 최신');
} else {
  writeFileSync(OUT, s);
  rmSync(SPRITES_OUT, { recursive: true, force: true });
  mkdirSync(dirname(SPRITES_OUT), { recursive: true });
  cpSync(SPRITES_SRC, SPRITES_OUT, {
    recursive: true,
    filter: src => !src.slice(src.lastIndexOf('/') + 1).startsWith('.'),
  });
  // **바이트로 잰다.** `s.length` 는 UTF-16 글자 수라 한글이 1 로 세어져서, 같은
  // 자를 두 쪽에 대면 실제로는 5KB 만 줄었는데 100KB 가 줄어든 것처럼 보인다.
  const kb = (n) => (n / 1024).toFixed(0);
  console.log(`  토스판 index.html 생성  ${kb(Buffer.byteLength(s))}KB`
    + `  (웹판 ${kb(readFileSync(SRC).length)}KB 에서)`);
}
