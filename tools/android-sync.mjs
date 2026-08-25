// `npx cap sync android` 가 끝난 뒤, 안드로이드에 실린 index.html 에서
// **클라우드(구글 로그인) UI 를 끈다.**
//
//   node tools/android-sync.mjs              복사된 자산을 고친다
//   node tools/android-sync.mjs --apk <파일>  다 만든 APK 안을 열어 확인만 한다
//
// 그리고 **안드로이드 뒤로 가기 버튼**을 게임의 뒤로 가기에 잇는다.
//
// ── 왜 네이티브판은 로그인이 없나 (다시 조사하지 마라) ────────────────
// **유저가 내린 결정이다: 네이티브 첫 출시는 로컬 세이브만 간다.**
// Firebase 웹 SDK 의 `signInWithPopup` 은 안드로이드 웹뷰에서 팝업이 안 열려 막히는
// 것으로 알려져 있고, 뚫으려면 네이티브 인증 플러그인(형제 리포의
// `@capacitor-firebase/authentication`)을 붙여야 한다. 그러면 SHA-1/SHA-256 지문
// 등록과 플러그인 의존성이 따라온다 — **첫 출시에 과하다고 봤다.**
// 이 리포는 「의존성 하나(playwright)」로 굴러왔고 Capacitor 도 겨우 들인 것이다.
//
// 세이브는 localStorage 그대로다. 웹뷰에서 잘 돌지만 **앱 데이터 삭제로 날아간다** —
// 지금 웹판(로그인 안 한 사람)과 정확히 같은 조건이라 이번에 바꿀 것은 없다.
// 되살리려면 위 플러그인을 붙이고 이 파일을 지우면 된다.
//
// ── 왜 여기서 고치나 ────────────────────────────────────────────────
// 게임은 `../index.html` 한 벌뿐이고 웹·토스·네이티브 **셋이 그 파일을 공유한다.**
// 두 벌을 두면 반드시 갈린다(toss/sync.mjs 머리 주석). 그래서 토스판이 쓰는 것과
// 같은 구조를 쓴다 — 게임 코드에 「네이티브면」 분기를 심지 않고, 배포처가
// `CLOUD_UI` 한 값을 false 로 만든다. 그리기·탭 판정·꼬리 높이가 그 값만 본다.
//
// 다만 자르는 자리가 토스와 다르다. 토스는 **압축 전** 원본을 주석 배너로 갈라
// 계정 절을 통째로 들어내지만, 여기 `webDir` 은 `dist/games/canthold` —
// **build.mjs 가 주석을 걷어낸 뒤**라 그 배너가 없다. 그래서 코드 두 군데를
// 표식으로 잡는다. 못 찾으면 조용히 넘어가지 않고 멈춘다.
//
// **`dist/` 를 직접 고치지 않는 이유**도 같다. 그 폴더가 곧 웹 배포본이라,
// 거기서 끄면 웹판 로그인이 같이 죽는다. 고치는 것은 `cap copy` 가 안드로이드
// 프로젝트 안에 떠 놓은 **사본**이고, 그 사본은 Capacitor 의 .gitignore 가 막는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html');

// 이미 고친 파일인지 알아보는 표식. 이것만으로 두 번 돌려도 안전해진다.
const MARK = '/* 네이티브판: 클라우드 UI 없음 — tools/android-sync.mjs */';

// ── 안드로이드 뒤로 가기 (#89 · #74) ────────────────────────
// **웹판의 history 방식은 웹뷰에서 안 먹는다.** 확인했다 — 덱 화면에서 하드웨어
// 뒤로를 누르면 화면이 한 칸 되돌아가는 게 아니라 **앱이 통째로 닫힌다.**
// Capacitor 가 기기의 뒤로 버튼을 먼저 받아서, JS 리스너가 없으면 액티비티를
// 끝내 버리기 때문이다. `popstate` 는 아예 안 온다.
//
// 그래서 `@capacitor/app` 의 `backButton` 을 받아 **웹판과 같은 문**으로 들여보낸다.
// 판단은 여기서 안 한다 — `navBack()` 하나만 부른다. 뒤로가 무슨 뜻인지는 게임이
// 정하고(#74 · DESIGN §2.12 「셋이 각자 판단하면 같은 자리에서 셋이 다른 뜻이 된다」),
// 여기는 넷째 문일 뿐이다.
//
// 딱 한 가지만 여기서 안다: **목록에서는 앱을 닫는다.** 웹에서 그 자리의 뒤로가
// 「페이지를 나간다」인 것과 같은 뜻이고, 앱에는 나갈 페이지가 없으니 exitApp 이다.
// 목록인지는 `navState().pushed` 로 안다 — 「목록 0개 · 그 외 1개」가 #74 의 불변식
// 이라 이 한 값이 곧 「목록인가」다.
//
// 플러그인은 번들 없이 `window.Capacitor.Plugins` 에서 꺼낸다. 이 리포에는 번들러가
// 없고(토스판만 vite 를 쓴다), 네이티브 브리지는 어차피 전역에 붙는다.
const BACK_SCRIPT = `<script>
// 안드로이드 하드웨어 뒤로 → 게임의 뒤로. tools/android-sync.mjs 가 넣었다.
(() => {
  const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (!App) return;
  App.addListener('backButton', () => {
    if (window.navState && window.navState().pushed) window.navBack();
    else App.exitApp();
  });
})();
</` + `script>
`;

// 표식 하나를 찾는다. 못 찾거나 여러 번 나오면 멈춘다 — 여러 번 나오면 처음 것만
// 갈리고 나머지가 조용히 남는다(toss/sync.mjs 의 findOnce 와 같은 규칙이다).
function findOnce(s, needle, label) {
  const at = s.indexOf(needle);
  if (at < 0) throw new Error(`${label} 표식을 못 찾았다: ${needle}`);
  if (s.indexOf(needle, at + 1) >= 0) throw new Error(`${label} 표식이 여러 번 나온다: ${needle}`);
  return at;
}

// 압축본이 성립하는지 본다. 잘라내기가 너무 많이 먹으면 위 「남으면 안 되는 것」
// 검사만으로는 전부 통과로 보인다 — 게임이 통째로 사라져도 그렇다.
function assertSane(s, where) {
  for (const [needle, why] of [
    ['requestAnimationFrame(frame)', '게임 루프'],
    ['이번 웨이브는 못 막습니다', '제목'],
    ['cant-hold-progress', '세이브 키'],
    ['const CLOUD_UI = false;', '클라우드 UI 끄기'],
    [MARK, '네이티브 표식'],
    ['function navBack()', '게임의 뒤로 가기 문'],
    ['function navState()', '뒤로 가기 항목 게터'],
    ["addListener('backButton'", '안드로이드 뒤로 가기 잇기'],
  ]) if (!s.includes(needle)) throw new Error(`${where} 에서 ${why} 가 사라졌다 (${needle})`);

  if (s.includes('const CLOUD_UI = true')) throw new Error(`${where} 에 로그인 줄이 켜진 채로 남았다`);

  // 스텁이 이름만 갖고 있어도 위 검사는 통과한다. **쓰임의 개수**를 본다 —
  // 선언 1 + 바깥 셋(STAGE_TAIL_H · 로그인 줄 그리기 · stageTap)이 있어야 한다.
  const uses = s.split('CLOUD_UI').length - 1;
  if (uses < 4) throw new Error(
    `${where} 의 CLOUD_UI 쓰임이 ${uses} 개뿐이다 — 웹판에서 이 이름이 바뀌었거나 로그인 줄의 가림이 풀렸다`);
}

// ── APK 안을 확인한다 ────────────────────────────────────────
// **여기가 진짜 그물이다.** 위 고치기는 npm script 가 순서대로 부르지만, 누가
// `npx cap sync android` 만 손으로 돌리고 안드로이드 스튜디오에서 빌드하면 그 순서가
// 통째로 빠진다. 그때 나오는 APK 는 아무 에러 없이 로그인 줄을 달고 있다.
// 그래서 **다 만든 파일을 열어서** 본다.
const apkFlag = process.argv.indexOf('--apk');
if (apkFlag >= 0) {
  const apk = process.argv[apkFlag + 1];
  if (!apk || !existsSync(apk)) throw new Error(`APK 를 못 찾았다: ${apk}`);
  const inner = execFileSync('unzip', ['-p', apk, 'assets/public/index.html'],
    { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  assertSane(inner, apk);
  console.log(`  APK 확인  ${apk}  — 클라우드 UI 꺼짐 · 게임 온전함`);
} else {
  if (!existsSync(ASSET)) throw new Error(
    `${ASSET} 가 없다. \`npm run build && npx cap sync android\` 를 먼저 돌려라.`);
  let s = readFileSync(ASSET, 'utf8');

  if (s.includes(MARK)) {
    console.log('  안드로이드 자산: 이미 꺼져 있다 (cap copy 를 다시 돌리면 원래대로 온다)');
  } else {
    // 1) 로그인 줄을 끈다. 그리기·탭 판정·꼬리 높이가 이 한 값만 본다.
    const ON = 'const CLOUD_UI = true;';
    findOnce(s, ON, '클라우드 UI 스위치');
    s = s.replace(ON, `const CLOUD_UI = false; ${MARK}`);

    // 2) SDK 를 아예 안 받아온다. 줄을 껐어도 `cloudPreload()` 는 첫 터치와
    //    requestIdleCallback 에서 **무조건** 불려서, 그대로 두면 켤 때마다
    //    gstatic 에서 Firebase 를 내려받고 아무 데도 안 쓴다.
    //    이름은 남긴다 — 부르는 자리가 둘이라 지우면 그 자리에서 널이 된다.
    const PRELOAD = 'function cloudPreload() {\n'
      + 'if (fb || cloudLoading) return;\n'
      + 'cloudLoading = cloudInit().catch(() => { cloudLoading = null; });\n'
      + '}';
    findOnce(s, PRELOAD, 'cloudPreload 본문');
    s = s.replace(PRELOAD, 'function cloudPreload() {}');

    // 3) 하드웨어 뒤로 가기를 잇는다. **게임 스크립트 뒤에** 붙인다 — 앞에 두면
    //    navBack·navState 가 아직 없다. EASTBIRD 인트로 블록 바로 앞이고, 토스판이
    //    런타임을 끼우는 이음매와 같은 자리다.
    //
    //    다만 **표식이 토스와 다르다.** 토스는 압축 전 원본을 다루므로 인트로 앞의
    //    주석 배너(`<!-- ══`)를 잡는데, 여기 파일은 build.mjs 가 HTML 주석을 전부
    //    걷어낸 뒤라 그 배너가 없다. 남아 있는 첫 표식이 인트로 div 자신이다.
    const SEAM = '<div id="ebIntro"';
    findOnce(s, SEAM, 'EASTBIRD 인트로 블록');
    s = s.replace(SEAM, BACK_SCRIPT + SEAM);

    assertSane(s, 'android/app/src/main/assets/public/index.html');
    writeFileSync(ASSET, s);
  }
  const kb = (readFileSync(ASSET).length / 1024).toFixed(0);
  console.log(`  안드로이드 자산 index.html  ${kb}KB  — 클라우드 UI 껐다(로컬 세이브만)`);
}
