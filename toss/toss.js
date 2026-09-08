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
  fullScreen: 'ait.v2.live.498fb69217df489a',  // 콘솔 > 광고 > 전면 광고 그룹 ID
  banner: 'ait.v2.live.ce271d27543a4493',      // 콘솔 > 광고 > 배너 광고 그룹 ID
};

// ── 광고가 왜 안 뜨는지 화면에 적는다 ────────────────────────
// **기기에는 콘솔이 없다.** 미니앱은 QR 로 토스 앱 안에서 도는 것이라 `console.warn`
// 을 아무도 못 읽는다. 그런데 이 파일의 실패 경로는 전부 조용했다 — `isSupported()`
// 가 false 면 `return`, `attachBanner` 가 던지면 `catch`, 광고가 안 차면 높이 0.
// **셋이 화면에서 똑같이 「아무것도 없음」으로 보인다.** 배너가 안 뜬다는 신고를
// 받고 나서 어느 쪽인지 가릴 방법이 없었던 것이 이 티켓의 실제 비용이다.
//
// `AD_DEBUG` 가 켜져 있으면 배너 자리에 한 줄을 그린다. **출시 값은 false 다** —
// 진단용 빌드에서만 켜서 말고, 원인을 잡으면 다시 끈다.
const AD_DEBUG = false;

// 보드가 없는 화면. 여기서만 배너를 띄운다.
// 'build'·'wave'·'over'·'clear' 는 전부 보드가 깔린 화면이다(over·clear 는 보드 위에
// 결과를 덮어 그린다). 낮은 화면(375x667)에서 셀은 이미 41px 인데 배너 60px 를 빼면
// 35px 가 된다(실측). 여섯 자리가 통째로 줄어드는 것이라 보드 위에는 안 둔다.
const BOARDLESS = new Set(['stage', 'deck']);

// ── 일시정지는 예외다 ────────────────────────────────────────
// **셀이 줄어드는 것이 왜 문제였는지를 보면 정지가 왜 예외인지 나온다.** 위 35px 이
// 문제인 이유는 「빈 칸을 탭해 소환」(#68)의 아이콘 셋이 칸에 비해 커져서 칸 밖으로
// 나가기 때문이다. 그런데 **정지 중에는 배치도 합성도 안 된다** — 그 화면이 스스로
// 「멈춰 있는 동안에는 배치도 합성도 되지 않습니다」라고 적고 있고, `pointerdown` 의
// 정지 분기가 탭을 통째로 먹는다. 즉 셀이 줄어서 나빠질 조작이 **하나도 없다.**
//
// 화면도 이미 덮여 있다 — `drawPause` 가 95% 불투명으로 판을 가린다. 보드가 안
// 보이는 화면이니 「보드 위에는 안 둔다」의 취지에도 안 걸린다. 오히려 정지 화면은
// 아래쪽이 「아무 곳이나 눌러 계속」 한 줄뿐이라 자리를 내주기 가장 쉬운 화면이다.
//
// `state.paused` 는 `state.phase` 와 **다른 축이다**(정지 중에도 phase 는 build·wave
// 그대로다). 그래서 화면을 하나의 키로 합쳐 본다 — 안 합치면 정지를 눌러도 phase 가
// 안 바뀌어서 `tick` 이 아무 일도 안 한다.
function readPaused() {
  try { return !!state.paused; } catch { return false; }
}
function wantsBanner(phase, paused) {
  return BOARDLESS.has(phase) || paused;
}

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

// 전면 광고를 닫고 돌아왔을 때 게임을 되살린다. **게임 쪽에도 같은 장치가 있다** —
// `index.html` 의 `reviveView` 가 `visibilitychange`·`pageshow`·`focus` 로 스스로
// 돈다(#124). 여기서 한 번 더 부르는 것은 **전면 광고가 그 셋 중 어느 것도 안 쏠 수
// 있어서**다. 웹뷰 안에 겹쳐 뜨는 광고라면 문서는 계속 visible 이고 포커스도 안 옮겨진다.
// 멱등하므로 둘 다 불려도 손해가 없다. 옛 게임 판(그 함수가 없는)에서는 `resize()` 로
// 떨어진다 — 이 파일은 게임보다 나중에 실리므로 이름이 없으면 그냥 없는 것이다.
function reviveGame() {
  try { reviveView(); return; } catch { /* 그 판에는 없다 */ }
  relayout();
}

// 광고 SDK 초기화가 끝났는가. **두 광고가 같이 본다** — 전면도 배너도 초기화 전에
// 부르면 실패하고 그 실패는 조용하다(아래 §붙이는 시점이 문제였다). 선언이 전면 절
// 위에 있는 것은 전면이 이 파일에서 먼저 나오기 때문이지 전면 전용이라서가 아니다.
let adsReady = false;

// ── 전면 광고 ────────────────────────────────────────────────
// **미리 받아 둔다.** 판이 끝난 그 순간에 받기 시작하면 결과 화면이 빈 채로 몇 초
// 걸린다. 부팅에서 한 번 받아 두고, 한 번 보여줄 때마다 다음 것을 다시 받는다.
let fullReady = false, fullLoading = false;

function preloadFullScreen() {
  if (!AD.fullScreen || fullReady || fullLoading) return;
  // **배너와 같은 경주다.** `TossAds.initialize` 가 끝나기 전에 부르면 실패하고,
  // 그 실패는 `catch` 가 삼킨다. 배너는 화면이 바뀔 때 다시 붙어서 증상이
  // 「첫 화면에서만 안 뜬다」였는데, 전면은 부팅에서 한 번 받아 두고 판이 끝날 때
  // 쓰는 것이라 **첫 판의 결과 화면이 통째로 광고 없이 지나간다.** 초기화가 끝나면
  // `onInitialized` 가 여기를 다시 부른다.
  if (!adsReady) return;
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
      // **닫히면 되살린다.** 아이폰에서 광고를 보고 오면 검은 화면이 뜨고 탭이 안
      // 먹는다는 신고가 있었다(#124) — 웹뷰가 백그라운드에서 캔버스 백버퍼를 회수하고
      // rAF 를 안 돌려준다. 광고가 그 상황을 가장 자주 만든다.
      onEvent: (e) => { if (e.type === 'dismissed') { reviveGame(); preloadFullScreen(); } },
      onError: () => { reviveGame(); preloadFullScreen(); },
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
let host = null, slot = null, ro = null, badge = null;

// 마지막으로 무슨 일이 있었는가. `AD_DEBUG` 가 이걸 그린다.
let adState = 'boot';

function setAdState(v) {
  adState = v;
  if (!AD_DEBUG || !badge) return;
  badge.textContent = 'AD ' + v;
}

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

  if (AD_DEBUG) {
    badge = document.createElement('div');
    badge.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:11;'
      + 'font:11px/1.4 monospace;color:#ffd700;background:rgba(0,0,0,.75);'
      + 'padding:3px 6px;pointer-events:none;word-break:break-all;';
    document.body.appendChild(badge);
    setAdState(adState);
  }

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

// ── 붙이는 시점이 문제였다 ───────────────────────────────────
// **`TossAds.initialize` 는 즉시 끝나지 않는다** — 완료를 `onInitialized` 콜백으로
// 알려 준다(SDK `InitializeOptions`). 그런데 예전 코드는 `initialize({})` 를 부른
// 바로 다음 줄에서 `tick()` 을 돌렸고, 첫 틱의 화면이 이미 `stage` 라 **초기화가
// 끝나기 전에 `attachBanner` 를 불렀다.** 거기서 실패하면 `catch` 가 삼키고,
// `tick` 은 **화면이 바뀔 때만** 다시 붙이므로 목록에 머무는 동안 재시도가 없다.
// 스테이지 목록은 부팅하면 바로 떠 있는 화면이라 「한 번 실패하면 끝」이었다.
//
// **증상이 그 모양 그대로였다.** 신고는 「목록·덱에서 배너가 안 보인다」였는데,
// 같은 빌드에서 **판에 들어갔다가 일시정지 → 판 나가기로 목록에 돌아오면 뜬다.**
// 나가기가 `wave` → `stage` 로 화면을 바꿔 `attachBanner` 를 한 번 더 부르고, 그때는
// 초기화가 끝나 있어서 붙는다. 즉 붙이는 코드가 틀린 게 아니라 **처음 한 번의 시점**
// 만 틀렸다 — 이 문단이 그 재현 경로다.
//
// 그래서 셋을 고친다.
//   ① 초기화가 끝나야 붙인다(`adsReady`). 아직이면 표시만 해 두고 끝나면 그때 붙인다
//   ② 실패하면 재시도한다 — 화면 전환에 기대지 않고 이 파일이 직접 다시 부른다
//   ③ 붙인 뒤의 결과를 `callbacks` 로 받는다. 「안 찼다(onNoFill)」와 「못 그렸다
//      (onAdFailedToRender)」가 갈려야 콘솔 문제인지 코드 문제인지 가른다
let wantBanner = false;
let retryT = null, retries = 0;
const RETRY_MAX = 5;
const RETRY_MS = 1500;

function attachBanner() {
  wantBanner = true;
  if (slot || !AD.banner) return;
  if (!adsReady) { setAdState('wait-init'); return; }
  try {
    if (!TossAds.attachBanner.isSupported()) { setAdState('unsupported'); return; }
    setAdState('attaching');
    slot = TossAds.attachBanner(AD.banner, ensureHost(), {
      theme: 'dark',
      variant: 'card',
      callbacks: {
        onAdRendered: () => { retries = 0; setAdState('rendered'); },
        onAdViewable: () => setAdState('viewable'),
        onNoFill: () => setAdState('no-fill'),
        onAdFailedToRender: (p) => setAdState('render-fail ' + (p && p.error ? p.error.code + ':' + p.error.message : '?')),
      },
    });
  } catch (e) {
    slot = null;
    setAdState('throw ' + (e && e.message ? e.message : e));
    scheduleRetry();
  }
}

// 붙는 데 실패했을 때만 다시 부른다. **상한을 둔다** — 안 되는 것을 무한히 두드리면
// 배터리만 쓴다. 화면을 나갔다 들어오면 `detachBanner` 가 카운터를 되돌린다.
function scheduleRetry() {
  if (retryT || retries >= RETRY_MAX) return;
  retries++;
  retryT = setTimeout(() => {
    retryT = null;
    if (wantBanner && !slot) attachBanner();
  }, RETRY_MS);
}

function detachBanner() {
  wantBanner = false;
  if (retryT) { clearTimeout(retryT); retryT = null; }
  retries = 0;
  if (slot) {
    try { slot.destroy(); } catch { /* 이미 정리됐다 */ }
    slot = null;
  }
  if (host) host.replaceChildren();
  if (badge) badge.textContent = '';
  // **자리를 반드시 되돌린다.** 여기서 0 으로 안 돌리면 판 화면의 셀이 줄어든다.
  if (window.__bottomReserve) { window.__bottomReserve = 0; relayout(); }
}

// ── 화면을 따라간다 ──────────────────────────────────────────
// 게임에 갈고리를 심지 않고 `state` 만 읽는다. 게임 코드를 안 건드리는 것이
// 「게임은 한 벌만 둔다」의 실질이라, 관찰은 밖에서 한다.
//
// **전면 광고는 `phase` 만 본다.** 정지는 판이 끝난 것이 아니므로 전면을 띄우면 안 된다.
// 배너만 정지를 같이 본다(위 §일시정지는 예외다).
let prev = null;        // 직전 phase. 전면 광고가 「판이 방금 끝났다」를 가르는 축이다
let prevWant = false;   // 직전에 배너를 원했는가. 정지 토글은 phase 를 안 바꾸므로 따로 든다

function tick() {
  const phase = readPhase();
  const want = wantsBanner(phase, readPaused());

  if (phase !== prev) {
    const was = prev;
    prev = phase;

    // 판이 끝난 그 한 번만. 결과 화면에 머무는 동안 다시 뜨지 않는다.
    if ((phase === 'clear' || phase === 'over') && was !== phase) showFullScreen();

    // 판에 들어갈 때 다음 것을 미리 받아 둔다. 부팅에서 실패했어도 여기서 한 번 더.
    if (phase === 'build' && was === 'deck') preloadFullScreen();
  }

  if (want !== prevWant) {
    prevWant = want;
    if (want) attachBanner(); else detachBanner();
  }
  setTimeout(tick, 200);
}

try {
  // **어느 쪽이 비었는지 이름을 찍는다.** 둘을 따로 발급받으므로 한쪽만 채워진
  // 기간이 실제로 생긴다(배너 먼저 받았다). 「비어 있다」로만 찍으면 채운 쪽까지
  // 안 뜨는 줄 알고 콘솔을 다시 뒤지게 된다.
  const missing = Object.entries(AD).filter(([, id]) => !id).map(([k]) => k);
  if (missing.length) {
    console.warn(`[toss] 광고 그룹 ID 가 비어 있다: ${missing.join(', ')} — toss/toss.js 의 AD 를 채워야 그 광고가 뜬다`);
  }
  if (!TossAds.initialize.isSupported()) {
    setAdState('init-unsupported');
  } else {
    setAdState('init');
    TossAds.initialize({
      callbacks: {
        onInitialized: () => {
          adsReady = true;
          setAdState('init-ok');
          // 초기화 전에 목록 화면이 이미 떠 있었으면 여기서 처음 붙는다.
          if (wantBanner && !slot) attachBanner();
          preloadFullScreen();
        },
        onInitializationFailed: (e) => setAdState('init-fail ' + (e && e.message ? e.message : e)),
      },
    });
  }
} catch (e) {
  // 토스 밖(로컬 vite dev)에서는 없는 게 정상이다.
  setAdState('init-throw ' + (e && e.message ? e.message : e));
}

preloadFullScreen();
tick();
