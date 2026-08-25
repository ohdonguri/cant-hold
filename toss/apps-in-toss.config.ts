import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // ⚠️ 앱인토스 콘솔에 등록한 값과 **글자 하나까지 같아야 하고, 등록 후에는 못 바꾼다.**
  // 형제 리포(fruit-smash)가 콘솔에는 `fruitsmash` 로 등록해 놓고 여기에 `fruit-smash`
  // 로 적었다가 업로드에서 "appName 이 앱 정보와 다르다" 로 거부당했다.
  // **하이픈 없이** 등록한다 — 콘솔 등록도 이 철자로 해야 한다.
  appName: 'canthold',

  brand: {
    displayName: '이번 웨이브는 못 막습니다',
    // 게임이 화면을 끝까지 칠하는 색. 웹판 <meta name="theme-color"> 와 같은 값이다.
    primaryColor: '#0d1117',
    icon: '', // TODO: 콘솔에 업로드한 아이콘 이미지 URL
  },

  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'node sync.mjs && vite dev',
      // sync.mjs 가 웹판에서 index.html 을 다시 만든 뒤 번들한다. 빌드에 묶어 두면
      // 게임을 고치고 토스판 갱신을 잊는 일이 없다 — 토스판이 8월 5일자에 멈췄던
      // 사고가 정확히 그것이었다(sync.mjs 머리 주석).
      build: 'node sync.mjs && vite build',
    },
  },

  // 카메라·위치·연락처 같은 네이티브 권한을 안 쓴다. 이 게임은 리더보드도 로그인도
  // 없고 진행도는 기기 안(localStorage)에만 남는다.
  permissions: [],

  outdir: 'dist',
});
