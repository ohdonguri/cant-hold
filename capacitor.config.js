// 안드로이드 앱(Capacitor) 설정. `.json` 이 아니라 `.js` 인 이유는 하나다 —
// **여기 값 셋은 주석 없이 두면 안 되는 값이다.** JSON 은 주석을 못 단다.
// (Capacitor CLI 는 capacitor.config.ts → .js → .json 순으로 찾는다. .ts 는
// typescript 를 새로 들여야 해서 안 쓴다 — 이 리포는 의존성을 안 늘린다.)
module.exports = {
  // ⚠️ **플레이 스토어에 한 번 올리면 영원히 못 바꾼다.** 앱 이름과 아이콘은 나중에
  // 바꿀 수 있어도 이것만은 못 바꾼다. 바꾸려면 새 앱을 올려야 하고, 그러면 기존
  // 설치자는 업데이트를 못 받는다. 형제 리포의 com.ohdonguri.fruitsmash 와
  // 같은 규칙(하이픈 없이 게임 id)이다.
  appId: 'com.ohdonguri.canthold',

  // 런처에 뜨는 이름이자 android/app/src/main/res/values/strings.xml 의 app_name 이다.
  //
  // **이 게임은 이름이 세 벌이고 셋 다 다르다.** 길이 제한이 서로 달라서다.
  //   게임 안 타이틀   이번 웨이브는 못 막습니다   제한 없음. 이게 원제다
  //   앱인토스 콘솔    이웨이브는못막습니다        10자 제한이라 띄어쓰기를 버렸다
  //   런처(여기)       못 막습니다                 아이콘 밑에서 안 잘리는 길이
  //
  // 런처는 대개 열 자 남짓에서 말줄임한다. 앱인토스 이름을 그대로 쓰면
  // 「이웨이브는…」 으로 잘려 무슨 게임인지 안 읽힌다. manifest.webmanifest 의
  // short_name 이 이미 같은 물음에 「못 막습니다」로 답해 뒀으므로 그걸 따른다.
  // appId 와 달리 **이 값은 언제든 바꿀 수 있다.**
  //
  // ⚠️ **여기만 고치면 앱 이름은 안 바뀐다.** `cap sync` 는 strings.xml 을 안 건드린다 —
  // `cap add` 로 android/ 를 처음 만들 때만 쓴다. 그래서 이 값을 바꾸면
  // `android/app/src/main/res/values/strings.xml` 의 `app_name` 과
  // `title_activity_main` 을 **손으로 같이 고쳐야 한다.** 안 고치면 빌드는 멀쩡히
  // 되고 옛 이름이 그대로 나간다 — 아무 에러도 안 난다.
  appName: '못 막습니다',

  // **build.mjs 의 산출물을 그대로 싣는다.** 웹판이 /games/canthold/ 아래 놓이는 탓에
  // index.html 의 참조가 전부 상대 경로라(index.html 머리 주석), 네이티브 루트에
  // 통째로 옮겨 놔도 그대로 뜬다. 그래서 형제 리포처럼 앱 전용 www/ 를 따로 굽지
  // 않는다 — 게임을 두 벌 두면 반드시 갈린다(toss/sync.mjs 머리 주석).
  //
  // dist/ 는 .gitignore 라서 **빌드를 먼저 돌려야 sync 가 된다.** 그 순서는
  // package.json 의 `android:sync` 가 묶어 두었다. 직접 `npx cap sync android` 를
  // 부르면 지난 빌드나 빈 폴더가 실린다.
  webDir: 'dist/games/canthold',

  android: {
    // 웹뷰가 페이지를 그리기 전에 깔리는 색. 게임 배경(#0d1117)과 같은 값이라
    // 첫 프레임에 흰 띠가 안 스친다. <meta name="theme-color"> 와 같은 색이다.
    backgroundColor: '#0d1117',
  },

  plugins: {
    // 시스템 바(상단 상태바·하단 제스처 바) 위의 시계·아이콘 색.
    // **'DARK' 는 「바가 어둡다」는 뜻이고 아이콘은 밝게 나온다** — 이름이 거꾸로
    // 읽히지만 Capacitor 의 SystemBars.setStyle 이
    // `setAppearanceLightStatusBars(!style.equals("DARK"))` 다.
    // 기본값(DEFAULT)은 기기의 다크 모드를 따라가서, 밝은 모드 기기에서는 어두운
    // 아이콘이 #0d1117 띠 위에 얹혀 **아무것도 안 보인다.** 이 게임은 기기 설정과
    // 무관하게 언제나 어두운 화면이라 따라갈 것이 없다.
    SystemBars: { style: 'DARK' },
  },

  server: {
    // https://localhost 로 서빙한다. http 로 두면 웹뷰가 secure context 가 아니라서
    // localStorage 를 비롯한 것들이 브라우저판과 다르게 논다.
    androidScheme: 'https',
  },
};
