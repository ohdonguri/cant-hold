// 토스 미니앱 런타임. **광고와 화면 적응만 한다 — 게임 코드는 한 줄도 안 건드린다.**
//
// 게임 본체는 `index.html` 안의 인라인 스크립트 그대로다(웹판에서 sync.mjs 가 떠 온
// 것). 여기서 하는 일은 둘뿐이다.
//
//   전면 광고   판 클리어·실패 때만. 웨이브 사이에는 안 띄운다 — 30웨이브짜리 판에서
//               매 웨이브면 과하다
//   배너 광고   보드가 없는 화면(스테이지 목록·덱 선택)에만. 보드 위에는 절대 안 둔다
//
// ── 세이브를 왜 localStorage 그대로 두는가 ────────────────────────────────
//
// SDK 에 `Storage` 가 있다. 확인해 보니 **기기 저장**이다.
//
//   · dist/index.d.cts:1883 — "로컬 저장소에서 문자열 값을 가져와요", "앱이 종료되어도
//     유지돼요". 계정 동기화라는 말이 없다
//   · dist/index.js:2438~2462 — 구현이 `callAsyncMethod('setStorageItem')` 이다.
//     네이티브 브리지로 그 기기의 저장소에 넣는 것이고, 서버로 올라가지 않는다
//   · 전부 Promise 다. getItem 도 비동기다
//
// 즉 localStorage 와 **보장이 같다.** 기기를 옮기면 둘 다 사라진다. 그런데 게임의
// `loadLocal()` 은 부팅 첫 줄에서 동기로 읽는다(`applyBundle(loadLocal())`). Storage 로
// 갈아 끼우면 그 자리를 비동기로 뜯어야 하고, 세이브 형식·부팅 순서를 건드리게 된다.
// **얻는 것이 없는데 건드릴 자리만 늘어난다.** 그래서 안 쓴다.
//
// 번들은 `{"v":3,"unlocked":1,"best":[],"cleared":[…15],"run":null}` 로 1KB 남짓이라
// 용량도 문제가 아니다. 리더보드가 없으니 Firebase 프로젝트를 새로 팔 이유도 없다.
//
// (토스 웹뷰가 localStorage 를 지우는 일이 관측되면 그때 Storage 로 **이중화**한다 —
//  부팅에서 localStorage 가 비었을 때만 Storage 를 읽어 채우는 식이다. 지금은 그
//  증상이 없고, 없는 증상에 비동기 부팅을 미리 심지 않는다.)

import { TossAds, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

// ── 광고 그룹 ID ─────────────────────────────────────────────
// **앱인토스 콘솔에서 발급받아 채운다.** 비어 있으면 광고 호출 자체를 안 한다 —
// 빈 ID 로 부르면 네이티브가 에러를 뱉고 그게 판마다 반복된다.
const AD = {
  fullScreen: '',   // TODO: 콘솔 > 광고 > 전면 광고 그룹 ID
  banner: '',       // TODO: 콘솔 > 광고 > 배너 광고 그룹 ID
};

// 보드가 없는 화면. 여기서만 배너를 띄운다.
// 'build'·'wave'·'over'·'clear' 는 전부 보드가 깔린 화면이다(over·clear 는 보드 위에
// 결과를 덮어 그린다). 낮은 화면(375x667)에서 셀은 이미 41px 인데 배너 60px 를 빼면
// 35px 가 된다(실측). 여섯 자리가 통째로 줄어드는 것이라 보드 위에는 안 둔다.
const BOARDLESS = new Set(['stage', 'deck']);

// 게임의 `state` 는 인라인 classic 스크립트가 `const` 로 잡은 이름이다. 그런 이름은
// **전역 렉시컬 환경**에 들어가므로 `globalThis.state` 로는 안 잡히고 맨 이름으로만
// 보인다. 게임이 안 실렸을 때 여기서 ReferenceError 로 같이 죽지 않게 감싼다.
// (`resize` 는 함수 선언이라 globalThis 에도 붙지만, 같은 통로로 부른다.)
function readPhase() {
  try { return state.phase; } catch { return null; }
}
function relayout() {
  try { resize(); } catch { /* 게임이 아직 안 실렸다 */ }
}

// ── 전면 광고 ────────────────────────────────────────────────
// **미리 받아 둔다.** 판이 끝난 그 순간에 받기 시작하면 결과 화면이 빈 채로 몇 초
// 걸린다. 부팅에서 한 번 받아 두고, 한 번 보여줄 때마다 다음 것을 다시 받는다.
let fullReady = false, fullLoading = false;

function preloadFullScreen() {
  if (!AD.fullScreen || fullReady || fullLoading) return;
  try {
    if (!loadFullScreenAd.isSupported()) return;
    fullLoading = true;
    loadFullScreenAd({
      options: { adGroupId: AD.fullScreen },
      onEvent: (e) => { if (e.type === 'loaded') { fullReady = true; fullLoading = false; } },
      onError: () => { fullLoading = false; },
    });
  } catch { fullLoading = false; }
}

// 판이 끝났을 때만 불린다. 안 받아져 있으면 **그냥 넘어간다** — 광고를 기다리느라
// 결과 화면을 붙잡아 두지 않는다.
function showFullScreen() {
  if (!AD.fullScreen || !fullReady) { preloadFullScreen(); return; }
  try {
    if (!showFullScreenAd.isSupported()) return;
    fullReady = false;
    showFullScreenAd({
      options: { adGroupId: AD.fullScreen },
      onEvent: (e) => { if (e.type === 'dismissed') preloadFullScreen(); },
      onError: () => { preloadFullScreen(); },
    });
  } catch { preloadFullScreen(); }
}

// ── 배너 ─────────────────────────────────────────────────────
// 화면 맨 아래에 자리를 하나 만들고, 그 **실제 높이**를 게임에 알린다. 게임의
// `resize()` 가 `window.__bottomReserve` 를 빼고 `view.h` 를 잡으므로 목록·덱 카드가
// 그만큼 위로 접힌다. 광고가 안 차면 높이가 0 이라 아무것도 안 뺏는다.
//
// 덮어쓰는 게 아니라 **자리를 내주는** 이유는 이 화면들의 아래쪽이 이미 차 있기
// 때문이다 — 목록은 「이어하기」 줄, 덱은 「시작 · 뒤로」 줄이 바닥에 붙는다.
let host = null, slot = null, ro = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'tossBanner';
  host.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:10;'
    // body 가 touch-action:none 이라 그대로 두면 광고가 손가락을 못 받는다.
    + 'touch-action:auto;'
    + 'display:flex;justify-content:center;';
  document.body.appendChild(host);

  // 광고가 실제로 그려진 뒤에야 높이를 안다. 창을 미리 비워 두면 안 찰 때 빈 띠가
  // 남으므로, 그려진 높이를 그대로 게임에 넘긴다.
  ro = new ResizeObserver(() => {
    const h = Math.round(host.getBoundingClientRect().height);
    if (h === (window.__bottomReserve || 0)) return;
    window.__bottomReserve = h;
    relayout();
  });
  ro.observe(host);
  return host;
}

function attachBanner() {
  if (slot || !AD.banner) return;
  try {
    if (!TossAds.attachBanner.isSupported()) return;
    slot = TossAds.attachBanner(AD.banner, ensureHost(), { theme: 'dark', variant: 'card' });
  } catch { slot = null; }
}

function detachBanner() {
  if (slot) {
    try { slot.destroy(); } catch { /* 이미 정리됐다 */ }
    slot = null;
  }
  if (host) host.replaceChildren();
  // **자리를 반드시 되돌린다.** 여기서 0 으로 안 돌리면 판 화면의 셀이 줄어든다.
  if (window.__bottomReserve) { window.__bottomReserve = 0; relayout(); }
}

// ── 화면을 따라간다 ──────────────────────────────────────────
// 게임에 갈고리를 심지 않고 `state.phase` 만 본다. 게임 코드를 안 건드리는 것이
// 「게임은 한 벌만 둔다」의 실질이라, 관찰은 밖에서 한다.
let prev = null;

function tick() {
  const phase = readPhase();
  if (phase !== prev) {
    const was = prev;
    prev = phase;

    // 판이 끝난 그 한 번만. 결과 화면에 머무는 동안 다시 뜨지 않는다.
    if ((phase === 'clear' || phase === 'over') && was !== phase) showFullScreen();

    if (BOARDLESS.has(phase)) attachBanner();
    else detachBanner();

    // 판에 들어갈 때 다음 것을 미리 받아 둔다. 부팅에서 실패했어도 여기서 한 번 더.
    if (phase === 'build' && was === 'deck') preloadFullScreen();
  }
  setTimeout(tick, 200);
}

try {
  if (!AD.fullScreen || !AD.banner) {
    console.warn('[toss] 광고 그룹 ID 가 비어 있다 — toss/toss.js 의 AD 를 채워야 광고가 뜬다');
  }
  TossAds.initialize({});
} catch { /* 토스 밖(로컬 vite dev)에서는 없는 게 정상이다 */ }

preloadFullScreen();
tick();
