# 이번 웨이브는 못 막습니다 — 앱인토스 미니앱판

**게임은 한 벌만 둔다.** 이 폴더의 `index.html` 은 **생성물**이다. `sync.mjs` 가 웹판
(`../index.html`)을 읽어 만든다. **손으로 고치지 마라 — 다음 `npm run build` 가 덮는다.**

형제 리포(fruit-smash)는 예전에 토스판을 웹판 복사본으로 두고 손으로 고쳤다. 그래서
웹판만 고쳐 나가는 동안 **토스판이 8월 5일자에 멈췄고**, 뒤늦게 보니 등급분류번호 표시도
없고 내려놓은 기능이 거기서는 살아 있었다. 게임을 두 벌 두면 반드시 갈린다.

```
node sync.mjs           토스판 index.html 생성
node sync.mjs --check    지금 파일이 최신인지만 확인 (CI 용. 어긋나면 exit 1)
```

`sync.mjs` 는 **표식을 못 찾으면 조용히 넘어가지 않고 멈춘다.** 자세한 것은 그 파일 머리
주석에 있다.

## 웹판과 다른 점

| | 웹판 | 토스판 |
|---|---|---|
| 계정 | 구글 로그인 (Firebase Auth + Firestore) | **없다.** 계정 절이 스텁으로 갈린다 |
| 스테이지 목록의 로그인 줄 | 있음 | 없음 (`CLOUD_UI = false`) |
| 진행도 | localStorage + (로그인 시) Firestore | **localStorage 만** |
| manifest · 홈 화면 아이콘 | 있음 | 없음 (미니앱은 콘솔 아이콘을 쓴다) |
| 광고 | 없음 | 전면(판 클리어·실패) · 배너(보드 없는 화면) |
| EASTBIRD 인트로 | 있음 | 있음 (같은 블록) |
| 빌드 | 없음. 단일 HTML | Vite 번들 → `.ait` |

게임 로직·판 정의·밸런스·세이브 형식은 **한 줄도 안 다르다.** `diff ../index.html
index.html` 로 매번 확인할 수 있다.

## 진행도를 왜 `localStorage` 로 두나

SDK 에 `Storage` 가 있어서 먼저 확인했다. **기기 저장이다.**

- 타입 주석이 "로컬 저장소", "앱이 종료되어도 유지돼요" 라고만 한다. 계정 동기화 얘기가
  없다 (`@apps-in-toss/web-framework/dist/index.d.cts` 의 `declare const Storage`)
- 구현이 `callAsyncMethod('setStorageItem')` 이다 — 네이티브 브리지로 **그 기기** 저장소에
  넣는 것이고 서버로 올라가지 않는다
- 전부 `Promise` 다. `getItem` 도 비동기다

즉 `localStorage` 와 보장이 같다. 그런데 게임의 `loadLocal()` 은 부팅 첫 줄에서 **동기로**
읽는다(`applyBundle(loadLocal())`). `Storage` 로 갈아 끼우려면 그 자리를 비동기로 뜯어야
하고 부팅 순서를 건드리게 된다. **얻는 것이 없는데 건드릴 자리만 늘어난다.** 그래서 안 쓴다.
번들은 1KB 남짓이라 용량도 문제가 아니다.

리더보드가 없으므로 **Firebase 프로젝트를 새로 만들 이유도 없다.** 토스는 Firebase Auth 를
안 써서 `request.auth` 가 없고, 그래서 웹판 규칙을 공유할 수도 없다 — 애초에 서버에 아무것도
안 올리므로 그 문제 자체가 안 생긴다.

## 광고

`toss.js` 가 전부다. 게임에 갈고리를 심지 않고 `state.phase` 만 밖에서 본다.

- **전면** — `state.phase` 가 `clear`(판 클리어) 또는 `over`(실패) 로 넘어가는 그 한 번만.
  **웨이브 사이에는 안 띄운다** — 30웨이브짜리 판에서 매 웨이브면 과하다.
  부팅에서 미리 받아 두고 한 번 보여줄 때마다 다음 것을 다시 받는다. 안 받아져 있으면
  **그냥 넘어간다** — 광고를 기다리느라 결과 화면을 붙잡지 않는다.
- **배너** — 보드가 없는 화면(`stage` 목록 · `deck` 선택)에만. 화면 맨 아래에 자리를 만들고
  그 **실제 높이**를 `window.__bottomReserve` 로 게임에 알린다. 게임의 `resize()` 가 그만큼
  빼고 `view.h` 를 잡으므로 목록·덱 카드가 위로 접힌다. 광고가 안 차면 높이가 0 이라 아무
  것도 안 뺏는다.

**배너는 보드 위에 절대 안 둔다.** 판 화면에서는 `__bottomReserve` 가 0 이라 **셀 크기가 한
자리도 안 바뀐다.** 낮은 화면(375x667)에서 셀은 41px 인데 여기서 배너 60px 를 빼면 **35px 로
여섯 자리가 준다**(실측 · 웹판·토스판 양쪽에서 같은 값). 그만큼 「빈 칸을 탭해 소환」(#68)의
아이콘 셋이 칸에 비해 커진다.

**덮어쓰는 게 아니라 자리를 내주는** 이유는 이 화면들의 아래쪽이 이미 차 있기 때문이다 —
목록은 「이어하기」 줄이, 덱은 「시작 · 뒤로」 줄이 바닥에 붙는다.

## 남은 작업 (사람이 해야 한다)

1. **앱인토스 콘솔에 앱 등록** — 유형을 **게임**으로. 등록 이름은 `apps-in-toss.config.ts`
   의 `appName` 과 글자 하나까지 같아야 하고 **등록 후에는 못 바꾼다.** 여기에는 하이픈
   없이 `canthold` 로 적어 뒀다 — 콘솔에도 그 철자로 등록해야 한다. (fruit-smash 가
   `fruit-smash` 로 적었다가 "appName 이 앱 정보와 다르다" 로 거부당했다.)
2. **아이콘 업로드** 후 URL 을 `apps-in-toss.config.ts` 의 `brand.icon` 에 넣는다.
3. **광고 그룹 ID** — `toss.js` 상단 `AD` 의 `fullScreen` · `banner` 를 콘솔 발급값으로
   채운다. **비어 있으면 광고를 아예 호출하지 않는다**(빈 ID 로 부르면 네이티브가 에러를
   내고 그게 판마다 반복된다). 지금은 비어 있으므로 **광고가 안 뜬다.**
4. **버전을 채널 간에 맞춘다** — 이 폴더의 `package.json` 의 `version` 이 미니앱 채널의
   버전이다. 웹판에는 버전 표시가 없어서 지금은 대조할 상대가 없지만, 웹판에 생기면
   여기와 같이 올린다.

## 명령

```sh
npm install
npm run sync         # 웹판 → 토스판 index.html
npm run sync:check   # 최신인지만 확인 (안 고침)
npm run build        # sync + vite build → dist/
npm run pack         # ait build  → .ait (deploymentId 발급)
npx ait token add    # 콘솔 API 키 등록 (최초 1회)
npm run deploy       # ait deploy
```

QR 테스트는 `pack`/`deploy` 때 찍히는 `deploymentId` 로 한다.

```
intoss-private://appsintoss?_deploymentId=<deploymentId>
```

## 알아둘 것

- `@apps-in-toss/ait-format` 이 `node >= 24` 를 요구한다고 경고하지만 node 20.19.3 에서
  `ait build` 까지 정상 동작한다(fruit-smash 실측). 나중에 깨지면 node 를 24 로 올린다.
- 문서(developers-apps-in-toss.toss.im)가 SDK v2 기준이라 실제와 어긋나는 곳이 있다.
  설정 파일은 `granite.config.ts` 가 아니라 **`apps-in-toss.config.ts`** 다.
- `TossAds.attach` 는 deprecated 다. **`attachBanner`** 를 쓴다.
- 게임의 `state` 는 인라인 classic 스크립트가 `const` 로 잡은 이름이라 **전역 렉시컬
  환경**에 들어간다. `globalThis.state` 로는 안 잡히고 맨 이름으로만 보인다 — `toss.js` 가
  그래서 `try { state.phase }` 로 접근한다.
