# 이번 웨이브는 못 막습니다

**플레이: https://eastbirdstudio.com/games/canthold/**

성급 합성 타워디펜스. 모바일 세로, 한 판 6~8분.

- 골드로 **랜덤 1성 타워**를 뽑고, 같은 종류끼리 합성해 성급을 올린다
- 3성 / 5성에서 **분기를 고른다**. 타워당 최종 4빌드, 7종 = 28빌드
- **스테이지 15개.** 맵마다 좋은 자리가 다르다. 깨면 다음이 열린다. ⑦⑧⑨ 는 **쓸 수 있는 타워를 제한한다** — ⑦ 은 4종만 주고(오라 둘을 고른다), ⑧⑨ 는 3종만 줘서 **덱이 통째로 하나**다. ⑩~⑮ 는 제한이 없고 **레인이 셋**이다. 그중 ⑪ 빗장 · ⑫ 턱 · ⑬ 재 · ⑭ 후미는 **자음(ㅂ·ㅌ·ㅈ·ㅎ)을 모티프로 쓴 계열**이고 — 글자를 그대로 그리지는 않는다(DESIGN §자음 모티프) — ⑮ 선돌은 그 계열이 아니라 **보드를 11열로 넓힌 판**이다. 기둥 셋이 서로 사거리 밖이라 한 대로 둘을 못 보는데, **10열에서는 그 배치가 아예 안 나온다**(DESIGN §보드를 넓힌 판)
- 보드는 아래 6행만 열려 시작한다. w8·w15 클리어 때 두 행씩 열리고, 그래야 6성이 가능해진다
- 5성부터 타워가 **2x2**를 먹는다. 보드는 7x10. 뭘 버리고 뭘 키울지가 매 판의 결정
- 파쇄자·서리탑·침식자는 **주변에 상시로 깔리는 오라**다. 어디에 놓느냐가 곧 성능
- 적 편성은 3웨이브 앞까지 예고된다. 지금 최적인 빌드가 3웨이브 뒤엔 무력화된다
- 덱은 3종뿐이라 적 7종을 다 커버할 수 없다. **무엇을 포기할지가 첫 결정**

전체 설계는 [DESIGN.md](DESIGN.md).

## 조작

- **스테이지를 고른다.** 1번부터 열려 있고, 깨면 다음이 열린다
- **타워 7종 중 3종을 고른다.** 오라 3 / 공격 3 / 경제 1 로 나뉘어 있다
- **빈 칸을 누르면** 그 칸 둘레 10시·12시·2시에 덱 아이콘 셋이 뜬다
  - **아이콘을 누르면 골라진다** — 그 종류의 **사거리만** 뜨고 칸 안에 유령이 선다. 아직 안 지어진다
  - **한 번 더 누르면** 그 자리에 선다. 다른 아이콘을 누르면 선택이 그리로 옮겨간다
  - 취소는 **아이콘 밖 탭** 또는 **ESC**
- 타워를 **다른 타워 위로 끌면** 합성. 같은 종류·같은 성급만. **웨이브 중에도 된다**
- 타워를 **탭하면** 사거리 원과 정보, 판매/분기 재선택
  - 실선 + 진한 채움 = **오라**(그 안이 상시 효과), 점선 = 사격 사거리
- 오라 범위는 **고르지 않아도 항상 옅게** 깔려 있다
- 첫 웨이브는 **시작**을 눌러야 온다. 이후로는 자동이고 **빨리 보내기**로 건너뛴다 (보상 없음)
- 그 옆에 **x1·x2·x4** 배속과 **일시정지**가 붙어 있다. **ESC** 도 일시정지다
  (열려 있는 소환 창이 있으면 그것부터 닫는다)
- **일시정지 화면이 이 게임의 설명서다.** 조작·내 덱·알아둘 규칙이 거기 다 있다

일시정지 중에는 화면을 거의 불투명하게 덮어 판을 아예 못 만지게 한다. 멈춘 채로
배치·합성이 되면 웨이브가 자동으로 오는 의미가 사라진다 — 시간 압박이 이 게임의
난이도 그 자체다. 어차피 덮어야 하는 화면이라 그 자리를 설명서로 쓴다.

## 실행

```
open index.html          원본 그대로 (주석 포함)
npm run build            dist/games/canthold/index.html 로 압축
npm run verify:build     원본과 압축본을 헤드리스로 렌더해 비교 (playwright 필요)
npm run deploy           빌드 + Cloudflare 배포
npm run android:sync     빌드 + 안드로이드 프로젝트에 싣기
npm run android:apk      ↑ + 서명된 릴리스 APK
```

**`main` 에 푸시하면 Cloudflare 가 알아서 빌드하고 배포한다.** 평소에는 이게 배포다.
연동은 Cloudflare 대시보드에 걸려 있고 저장소에는 흔적이 없다 — `.github/workflows` 를
찾아봐도 없으니, 이 문단이 그 사실을 아는 유일한 곳이다.

`npm run deploy` 는 CI 를 안 기다리고 직접 밀 때 쓴다. 빌드와 배포가 한 줄로 묶여
있어서 빌드를 빼먹고 옛 페이지가 나갈 수가 없다.

어느 쪽으로 나가도 웹에 올라가는 건 항상 압축본이다 — 원본 주석에 밸런스를 왜 그 값으로
잡았는지가 길게 들어 있어서 그대로 내보내면 개발자도구에서 다 읽히고 전송량도 매번 나간다.

**배포 직후 몇 분은 옛 화면이 보일 수 있다.** Cloudflare 엣지가 이전 사본을 캐시에서
내주기 때문이고, 실패가 아니다. 브라우저 강력 새로고침(Ctrl+Shift+R)으로 대개 풀린다.
오리진에 새 것이 올라갔는지만 확인하려면 캐시를 우회해서 본다.

```
curl -s "https://eastbirdstudio.com/games/canthold/?cb=$RANDOM" | grep -c togglePause
```

작품은 대문과 같은 오리진의 경로(`/games/canthold/`)로 서빙한다. 서브도메인을
따로 두면 Firebase Auth 세션이 갈린다 (`eastbird-studio/docs/sso-migration.md`).

빌드 도구 없음. 의존성 없음. **게임 화면에는 이미지 파일이 하나도 안 쓰인다** — 도트는
문자열로 적어 캔버스에 굽는다. `index.html` 하나가 게임 전부다.

예외는 홈 화면 아이콘뿐이다. 그건 브라우저·안드로이드가 PNG 로만 받으므로 파일로 둘
수밖에 없는데, **손으로 만든 PNG 는 두지 않는다** — 원본 `icons/icon.svg` 와 뽑는
스크립트를 같이 두고 거기서 굽는다. 게임 코드는 이 파일들을 한 번도 안 읽는다.

```
icons/icon.svg           아이콘 원본. 모티프를 왜 그렇게 골랐는지가 여기 주석에 있다
icons/icon-maskable.svg  ↑ 에서 생성된다(손으로 고치지 마라)
icons/*.png              ↑ 에서 생성된다(손으로 고치지 마라)
manifest.webmanifest     홈 화면 추가. start_url·scope 는 './' 다
android/…/res/mipmap-*   ↑ 에서 생성된다(손으로 고치지 마라). 안드로이드 런처 아이콘
node tools/icons.mjs     SVG → 마스커블 SVG + PNG 여섯 장 + 안드로이드 런처 아이콘
                         (playwright 필요)
```

**안드로이드 것도 같은 실행에서 나온다.** 따로 두면 `icon.svg` 를 고치고 한쪽만
돌리게 되고, 그 사고는 아무 에러도 안 낸다 — 웹 아이콘만 새것이고 앱 아이콘은 옛
그림이 나갈 뿐이다.

`npm run build` 가 이 둘을 `dist/games/canthold/` 로 같이 옮긴다. **SVG 원본은 안 옮긴다** —
`index.html` 을 압축해 내보내는 것과 같은 이유로, 설계 근거 주석까지 배포할 것은 아니다.

빌드가 세 가지를 막는다. **셋 다 안 막으면 아무 에러 없이 옛것이 그대로 배포되는 사고다.**

- `<head>` 와 manifest 가 가리키는 주소가 배포 폴더에 실제로 있는가
- 홈 화면에 필요한 네 줄(`theme-color`·`manifest`·`icon`·`apple-touch-icon`)이 살아 있는가
- **생성물이 `icon.svg` 보다 낡지 않았는가** — 원본 지문을 생성물에 찍어 두고 대조한다.
  `icon.svg` 만 고치고 `node tools/icons.mjs` 를 안 돌리면 여기서 걸린다

## 안드로이드 앱 (`android/`)

Capacitor 껍데기 하나에 **웹 빌드 산출물을 그대로 싣는다.** `index.html` 의 참조가 전부
상대 경로라(웹에서 `/games/canthold/` 아래 놓이는 탓이다) 네이티브 루트에 통째로 옮겨
놔도 그대로 뜬다. 그래서 형제 리포(fruit-smash)처럼 앱 전용 `www/` 를 따로 굽지 않는다.

```
npm run android:sync   빌드 → cap sync → tools/android-sync.mjs
npm run android:apk    ↑ + gradlew assembleRelease + APK 안 확인 + 서명 지문
```

**`dist/` 는 `.gitignore` 라서 빌드를 먼저 돌려야 sync 가 된다.** 그 순서를 위 두 줄이
묶고 있다. `npx cap sync android` 만 손으로 돌리면 지난 빌드나 빈 폴더가 실린다.

필요한 것 둘이 저장소 밖에 있다.

- **node 22** — Capacitor CLI 가 `>=22` 를 요구한다(`.nvmrc`). 나머지 도구는 20 에서도 돈다
- **JDK 21** — Capacitor 가 깔아 주는 Gradle 8.14 는 **JDK 25 에서 못 돈다**
  (`Unsupported class file major version 69`). `tools/android-build.mjs` 가 21 을 찾아 넘긴다

### 서명 키 — 형제 리포와 공용이다

`~/keys/fruitsmash-upload.jks` 하나로 이 앱과 fruit-smash 를 **같은 지문으로** 서명한다.
비밀번호와 경로는 `android/key.properties` 에 있고, 루트 `.gitignore` 가 `*.jks` ·
`*.keystore` · `key.properties` 를 막는다. **키를 잃으면 그 appId 는 영원히 업데이트를
못 올린다.** 새 기계에서는 fruit-smash 의 `android/key.properties` 를 그대로 복사하면 된다.

`key.properties` 가 없으면 gradle 은 **성공하고** 서명 안 된 APK 를 내놓는다 — 설치도
업로드도 안 되는 물건인데 빌드 로그는 초록불이다. `tools/android-build.mjs` 가 그래서
파일이 없으면 먼저 멈춘다.

```
apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
```

### 못 바꾸는 값

`capacitor.config.js` 의 `appId` 는 **한 번 올리면 영원히 못 바꾼다.** 바꾸려면 새 앱을
올려야 하고 기존 설치자는 업데이트를 못 받는다. `android/app/build.gradle` 의
`versionCode` 는 스토어에 올릴 때마다 1 씩 올린다.

### 네이티브판에만 다른 것

**게임 코드에 「네이티브면」 분기를 심지 않는다.** 토스판과 같은 구조로,
`tools/android-sync.mjs` 가 `cap sync` 가 떠 놓은 사본을 고친다(그 사본은 Capacitor 의
`.gitignore` 가 막는다 — 저장소에 게임이 두 벌 생기지 않는다).

- **클라우드(구글 로그인) UI 를 끈다.** 유저 결정으로 **네이티브 첫 출시는 로컬 세이브만
  간다.** 웹뷰에서 `signInWithPopup` 을 뚫으려면 네이티브 인증 플러그인이 필요하고, 그러면
  SHA 지문 등록과 플러그인 의존성이 따라온다 — 첫 출시에 과하다고 봤다.
  `CLOUD_UI` 한 값을 false 로 만드는 것이 전부고, `cloudPreload` 도 비운다(안 비우면 켤
  때마다 gstatic 에서 Firebase 를 내려받고 아무 데도 안 쓴다).
  세이브는 `localStorage` 그대로다 — **앱 데이터 삭제로 날아간다.** 로그인 안 한 웹판과
  같은 조건이다
- **하드웨어 뒤로 가기를 잇는다.** 웹판의 `history` 방식은 웹뷰에서 안 먹는다 — 확인했다.
  덱 화면에서 뒤로를 누르면 화면이 한 칸 되돌아가는 게 아니라 **앱이 통째로 닫혔다.**
  `@capacitor/app` 의 `backButton` 을 받아 게임의 `navBack()` 하나로 들여보낸다(#74).
  목록에서만 `exitApp()` 이고, 그 자리인지는 `navState().pushed` 로 안다

`npm run android:apk` 는 **다 만든 APK 를 열어서** 둘 다 들어갔는지 확인한다. npm script
를 안 거치고 안드로이드 스튜디오에서 그냥 빌드하면 그 순서가 통째로 빠지는데, 그때
나오는 APK 는 아무 에러 없이 로그인 줄을 달고 있기 때문이다.

## 앱인토스 미니앱판 (`toss/`)

**게임은 한 벌만 둔다.** `toss/index.html` 은 생성물이고 `toss/sync.mjs` 가 이 파일
(`index.html`)에서 만든다. **손으로 고치지 마라.** 형제 리포(fruit-smash)가 토스판을
손으로 고친 사본으로 뒀다가 웹판만 고쳐 나가는 동안 **토스판이 8월 5일자에 멈췄다.**

```
node toss/sync.mjs           토스판 생성
node toss/sync.mjs --check   최신인지만 확인 (어긋나면 exit 1)
cd toss && npm run build     sync + vite build → toss/dist/
```

**`index.html` 을 고쳤으면 `node toss/sync.mjs --check` 가 어긋난다고 알린다.**
`sync.mjs` 는 잘라낼 표식을 못 찾으면 **조용히 넘어가지 않고 멈춘다** — 그대로 두면
구글 로그인 코드가 심사에 나가는 번들에 섞여 들어간다.

토스판에서 다른 것은 계정 절(스텁으로 갈린다) · manifest·아이콘 링크(없다) · 광고
(`toss/toss.js`)뿐이다. 자세한 것은 [toss/README.md](toss/README.md).

`index.html` 쪽에 토스가 남긴 자국은 둘뿐이다.

- `CLOUD_UI` — 스테이지 목록에 로그인 줄을 두는가. 웹판 `true`, 토스판 `false`
- `window.__bottomReserve` — 화면 아래를 게임이 아닌 것이 먹는 높이. 웹판은 늘 0 이고,
  토스판이 **보드 없는 화면에서만** 배너 높이를 넣는다. 판 화면에서는 0 이라 셀 크기가
  한 자리도 안 바뀐다

## 계정 (선택)

로그인 없이도 끝까지 돌아간다. 진행도는 항상 `localStorage` 에 먼저 남고,
로그인은 **기기를 옮길 때** 쓴다. SDK 를 못 받아와도 게임은 그대로 진행된다.

**이 절은 웹판 이야기다.** 토스판과 안드로이드 앱판에는 로그인이 아예 없고 세이브가
`localStorage` 에만 남는다 — 왜 그렇게 뒀는지는 각각 위 두 절에 있다.

저장하는 것은 두 층이다.

| 층 | 내용 |
|---|---|
| 영구 | 스테이지 해금, 스테이지별 **클리어 여부**, 스테이지별 최고 웨이브 |
| 이어하기 | 스테이지·덱·웨이브·골드·정수·관문·개방 행, **타워 배치 전부**(좌표·성급·분기·특성) |

**스냅샷은 웨이브 사이에만 찍는다.** 웨이브 도중을 저장하려면 적·발사체·장판까지
넣어야 하는데, 어차피 합성도 준비 단계에서만 되므로 이어하기의 의미가 없다.

계정은 스튜디오 공용 Firebase 프로젝트(`eastbirdstudio-abfb5`)를 쓴다. 게임들이 같은
오리진이라 한 번 로그인하면 어디서나 같은 사람이다 (`eastbird-studio/docs/sso-migration.md`).
`index.html` 의 config 값은 공개돼도 되는 식별자다 — 접근 통제는 아래 규칙이 한다.

규칙은 게임마다 따로 두지 않는다. 스튜디오 공용 파일 하나가 다섯 게임을 다 받는다 —
`eastbird-studio/firestore.rules` 의 `match /games/{gameId}/saves/{uid}` 다. 새 게임을
붙일 때 **두 곳**을 같이 고쳐야 한다.

- `knownGame()` 의 화이트리스트에 게임 id (`canthold`) 를 넣는다
- `validSave()` 에 그 게임의 세이브 모양 분기를 (`chSave()`) 더한다

둘 중 하나만 하면 절반만 열린다. 화이트리스트에 없으면 **읽기부터** `permission-denied`
로 떨어지는데, 로그인 자체는 멀쩡히 되므로 증상이 로그인 문제로 안 보인다.

**고친 규칙을 실제로 올리는 건 사람이 Firebase 콘솔에서 해야 한다** (이 환경에는 콘솔
권한도 firebase CLI 도 없다). 올리기 전에는 화면 아래에 `읽기 거부됨 — 서버 규칙을
확인해야 한다` 가 뜨고, 진행도는 `localStorage` 에만 남는다. 게임은 그대로 끝까지 돌아간다.

규칙을 고쳤으면 올리기 전에 에뮬레이터로 확인할 수 있다 (Java 필요).

```
cd ../eastbird-studio
npx firebase-tools emulators:exec --only firestore --project eastbirdstudio-abfb5 "<테스트>"
```

## 개발

```
npm test     규칙 테스트 + 시드 고정 회귀 (헤드리스). 아래 둘을 이어서 돌린다
  tools/test.js       규칙·경계·렌더 호출 검사
  tools/seedcheck.js  시드 고정 밸런스 회귀 (결과 + Math.random 호출 횟수)
npm run seedcheck 시드 회귀만 따로
npm run curve 스테이지 난이도 곡선 (판당 35덱 x 6회 = 210판). **난이도 눈금의 정본이다**.
             덱을 제한하는 판(`allowKinds`)은 허용 4종이면 4덱 x 6회 = 24판, 허용 3종
             (= `DECK_SIZE`)이면 **1덱 x 6회 = 6판**이라 **표본이 다르다** — 행 끝
             태그에 덱 수가 찍히고, 다른 표본끼리 나란히 읽으면 안 된다
npm run affinity 판이 어느 타워를 좋아하는가 (판당 35덱 x 8회 · 제약 판은 4덱/1덱). 난이도와
             **직교하는 자**다 — 같은 판 안에서 어느 타워가 값을 하는지를 잰다. 포화된
             판은 행에 `포화` 가 붙는다. 거기서는 0 이 「선호 없음」이 아니라 「못 잰다」다.
             `─` 는 뺄 것이 없어 못 잰 칸이다(0 과 다르다) — 안 받는 종류이거나,
             **덱이 하나뿐이라 「안 든 덱」이 없는 판**(행 전체가 `─` · 표시는 `1덱`)이다
npm run tune 밸런스 상수 그리드 서치. 축을 움직였을 때의 진도 이동량(민감도)만 찍고
             **어떤 조합도 추천하지 않는다** — 목표값은 DESIGN §난이도의 눈금에 있다
npm run sim  그리디 플레이 1회 결과
npm run shot 레이아웃 스크린샷 (playwright 필요)
npm run shot -- --repeat 10  같은 캡처를 10번 돌려 컷별 md5 가 갈리는지 본다.
                             갈리면 어느 컷이 어떤 값들을 오갔는지 찍고 exit 1.
                             재현이 확률적이라 2~5런으로는 놓친다 — 10런을 돌려라.
npm run verify:build 압축본이 원본과 같은 화면인지 (playwright 필요)
node tools/paths.js       경로 후보 비교
node tools/stagetune.js N 스테이지 N 의 HP 배율 역산
npm run sprites          도트 미리보기 (emit 으로 SPR 테이블 출력)
node tools/icons.mjs     홈 화면 아이콘을 icons/icon.svg 에서 다시 뽑는다 (playwright 필요)
```

밸런스 수치를 만지면 `npm test` 를 반드시 다시 돌릴 것. 근거는 [DESIGN.md](DESIGN.md) 참고.

**`tools/test.js` 혼자서는 밸런스 회귀를 못 잡는다.** 전역 `Math.random` 을 그대로 두고
돌려서 실행할 때마다 결과가 다르기 때문이다. 시드를 고정하고 결과 문자열과
**난수 호출 횟수까지** 비교하는 건 `tools/seedcheck.js` 뿐이라 `npm test` 가 둘을 같이 돌린다.
호출 횟수를 세는 이유는, 난수를 한 번 더 뽑으면 그 뒤의 모든 판정(관측소 치명,
조폐소 약탈, 소환 자리, 덱 롤)이 한 칸씩 밀려서 **밸런스를 한 줄도 안 고쳤는데
결과가 바뀌기** 때문이다. 그래서 연출처럼 규칙과 무관한 코드는 전역 난수를 쓰면 안 된다.
