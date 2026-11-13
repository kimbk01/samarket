# 알림 탭 → 목적지 진입 수정 설계 (2026-11-13 · Owner 「P1·P2 구현 승인」 2026-11-13)

- Owner 지시: 「fcm 알림 부분을 선택 하면, 바로 들어 가는 부분이 아니라 다른 여러 잡동작을 하고 최종 목적지로 가는 부분의 결함등 명확하게 감사 해서 보고 해라」(11-10) → 「수정 설계 작성해라」(11-13).
- 근거 실측: 2026-11-10 20:17~21:58 PHT, Samsung SM-M156S, 운영 앱 `com.dibay.app` 1.2.6 (39), 계정 9259ab7d(로그인), 방 `1de13b3e`·`86e94be1`. 화면 녹화 + 기기 로그(`DIBAY_PUSH_ROUTE`·`DIBAY_WebView`).
- 계약: `docs/dibay-app-entry-resume-hard-lock.md`(DRAFT) H1·H2·H3, `docs/DIBAY_APP_LIFECYCLE_SSOT.md` §8(의도 목적지가 있으면 직전 화면 복원을 먼저 띄우지 않는다), `lib/ui/overlay-back-stack.ts` INAPP-07.
- 범위: 웹만(Android 설치본 39 에 필요한 네이티브 기능 `getPendingPushRoute` 가 2026-06-15 부터 있음). 통화 경로(`/community-messenger/calls*`)·통화 코드는 바꾸지 않는다.

## 0. 실측 요약

| # | 상황 | 판정 | 실제 화면 순서 |
|---|---|---|---|
| A | 앱 프로세스 종료 → 잠금화면 실제 알림 카드 탭 (21:57) | FAIL | 스플래시 2.5초 → **홈 1.5초** → 빈 화면 → 「채팅방 입장 중…」 → 방 (탭 후 약 7초) |
| B | 프로세스만 살아 있음 → 알림과 같은 인텐트 (20:17) | FAIL | 스플래시 3초 → **홈 0.5초** → 「불러오는 중…」 → 빈 골격 → 「채팅방 입장 중…」 → 방 (약 5초) |
| C | 백그라운드 → 실제 알림 카드 탭, 그사이 운영 배포 바뀜 (21:55) | FAIL | 직전 화면 → 빈 골격 → 「불러오는 중…」 → 「채팅방 입장 중…」 → 방 (약 5.5초), 중간에 **문서 전체 재로드** |
| D | 백그라운드 → 알림, 배포 변화 없음 (20:19) | PASS | 직전 화면 0.8초 → 「채팅방 입장 중…」 1.2초 → 방 |
| E | 알림으로 방 A(손대지 않음) → 다른 알림으로 방 B → 시스템 뒤로 (20:19~20:20) | FAIL | 두 번 눌러도 반응 없음. 앱 안 「<」는 동작 |
| F | 직전 화면을 실제 터치한 뒤 알림 → 시스템 뒤로 (20:30) | PASS | 채팅 목록으로 돌아감 |
| G | 잠금화면 알림 표시 (21:55·21:57) | PASS | 「zxzx11 오후 9:55 auditlock1」 등 표시 |

## 1. 수정 항목

### P1. 알림 목적지가 있는 시작에서 홈이 먼저 보임 (A·B)

**확인된 원인 (코드·로그)**
1. 네이티브는 항상 `/` 를 먼저 연다 (`initial_remote_path defer_to_web reason=lifecycle_ssot`, `MainActivity.ensureInitialRemotePathOnce`). 이것은 의도된 계약(D1 race 제거)이며 바꾸지 않는다.
2. 웹 성공 신호(스플래시 해제)는 「첫 목적지 화면이 그려짐」에서 나간다 — `MarkInitialDestinationVisualReadyOnce`([ConditionalAppShell.tsx](../../components/layout/ConditionalAppShell.tsx)) → `markInitialDestinationVisualReady`([startup-metrics.ts:399](../../lib/startup/startup-metrics.ts)). 이 함수는 **기다리는 알림 목적지가 있는지 보지 않는다**. 실측 A: 홈 그림 34.39s → 해제 34.53s, 방 확정 36.8s.
3. 11-12 추가된 P3 해제(`releaseNativeSplashAtServerBodyFrame`, 홈 서버 본문 첫 그림)도 같은 판단이 없다. 실측(11-10)은 P3 이전이라 이 경로의 실기 결과는 NOT_PROVEN — 코드상 홈을 더 일찍 드러낸다.
4. 수명주기는 알림 목적지를 이미 안다 — `hasLaunchIntent()` → `navigate_skipped reason=launch_intent:push_route` (실측 A). 해제만 이 판단과 연결되어 있지 않다.

**수정 (해제 권한 2개 유지 · 새 해제 경로·표시 타이머 없음 — H1-1·H1-2)**
- 신규 `lib/startup/launch-push-intent-gate.ts` (순수 모듈 1개):
  - `startLaunchPushIntentProbe()` — 문서당 1회, hydration 전에도 동작하도록 `window.Capacitor.Plugins.NativeIncomingCall.getPendingPushRoute()` 를 직접 부른다(동적 import 없음). 통화 경로는 대상에서 뺀다(`/community-messenger/calls` 시작).
  - 상태: `unknown` → `none` | `pending(path)` → `settled`. 플러그인 없음·예외(웹·iOS·구버전) = 즉시 `none`.
  - `settleLaunchPushIntent(reason)` — 목적지 처리가 끝났을 때(이동 완료·버림·로그인 시트·작성 중 글 유지·고객센터 모달) 호출.
- `releaseNativeSplashAtServerBodyFrame`(P3): 게이트가 `none` 일 때만 해제. `unknown` 이면 다음 프레임에 다시 확인(기존 rAF 반복 그대로), `pending` 이면 P3 해제를 하지 않는다.
- `markInitialDestinationVisualReady`: 게이트가 `pending(path)` 이고 지금 경로가 그 목적지가 아니면 **해제하지 않고 돌아간다**(한 번 표시 플래그도 세우지 않음 → 목적지 경로가 그려질 때 같은 함수가 다시 불려 해제). `settled` 면 현재 화면에서 해제.
- `PushRouteListener`([components/push/PushRouteListener.tsx](../../components/push/PushRouteListener.tsx)): 목적지 처리가 끝나는 모든 분기에서 `settleLaunchPushIntent` 호출 후 `markInitialDestinationVisualReady()` 를 1회 다시 부른다(경로가 안 바뀌는 분기 — 로그인 시트·버림·같은 경로 ACK — 도 해제되게).
- 상한(H2-3): 게이트의 기다림은 네이티브 응답 1회뿐이고, 응답이 오지 않는 고장은 기존 네이티브 고장 판정(T_release)이 해제한다. 새 타이머를 두지 않는다.

**영향 화면·호출처**
- 모든 콜드·문서 재시작 진입(알림 없는 시작은 게이트 `none` → 기존과 동일).
- 인트로(`LaunchIntroRoot`)는 이미 알림 의도가 있으면 COMMUNITY 로 넘긴다 — 해제 주체 판단(`getLaunchOsReleaseOwner`)은 바꾸지 않는다.
- 로그인 필요 목적지 + 비로그인: 로그인 시트 분기에서 settle → 현재 화면 해제(시트가 보임).
- 계정 불일치로 버림: settle → 현재 화면 해제.
- 고객센터 모달 목적지: 모달 전달 성공 시 settle.

**깨질 수 있는 것과 같은 단계 처리**
- settle 누락 분기가 있으면 스플래시가 T_release 까지 남음 → `navigate()` 의 모든 `return` 분기에 settle 을 넣고, 분기 전수 계약 시험(소스 검사)으로 고정.
- 방 진입 중 화면(「채팅방 입장 중…」)은 목적지 자신의 로딩이라 해제 뒤에도 보인다 — 이 단계 범위 밖(아래 3절 R4, 실측 후 별도 판단).

**검증**
- 코드: `npm run typecheck:build`, `vitest` — 게이트 상태 전이·P3 보류·첫 화면 해제 보류/재시도·settle 전수 분기 시험, 기존 `startup-metrics`·`launch-intro`·`push-route` 시험.
- 실기(Samsung 운영 앱, 매 시험 Production SHA 기록): ① 프로세스 종료 → 실제 알림 탭 ② 프로세스 생존·화면 없음 → 실제 알림 탭 ③ 알림 없이 아이콘 시작(기존과 같은지) ④ 비로그인 상태 알림 탭(로그인 시트) ⑤ 다른 계정 알림 탭(버림). 녹화 프레임에 홈이 0프레임이어야 PASS.
- iOS: `getPendingPushRoute` 가 iOS 에 없어 게이트가 `none` → 동작 변화 없음. iOS 의 같은 결함 여부는 NOT_PROVEN(별도 실측 후 판단, 이 단계에서 iOS 네이티브 변경 없음).

### P2. 알림 진입이 쌓이면 시스템 뒤로가기가 죽음 (E)

**원인**
- 알림 이동은 페이지 안 사용자 터치 없이 일어난다(`router.push`). Chromium 「history manipulation intervention」: 사용자 활성화 없이 기록을 추가한 문서의 항목은 브라우저 뒤로 UI 에서 **건너뛴다**. 모든 이전 항목이 건너뛰기 대상이면 `CanGoBack()` 이 false. `history.back()` API 는 영향 없음.
  - 원문: [Chromium docs/history_manipulation_intervention.md](https://chromium.googlesource.com/chromium/src/+/127.0.6533.99/docs/history_manipulation_intervention.md)
- Capacitor 기본 뒤로(`@capacitor/app` 8.1.0 `AppPlugin`)는 JS 리스너가 없으면 `if (canGoBack) goBack()` 만 하고, false 면 **아무것도 하지 않는다**.
- 실측 E·F 와 맞음(앱 안 「<」 = `history.back()` 은 동작, 직전 화면을 터치하면 정상). Android WebView `canGoBack()` 값 자체는 직접 측정하지 못함.
- **0단계 결과 (11-13)**: 측정 불가 — 두 기기 모두 개발 앱(웹뷰 디버그 가능)이 지워졌고 운영 앱은 웹뷰 디버그가 꺼져 있다. 구현은 이 값에 의존하지 않게 했다: 오버레이 → 웹 기록(`navigation.canGoBack`) 뒤로 → 앱 내리기. `navigation.canGoBack` 이 건너뛰기 규칙 영향을 받는 경우에도 결과는 「앱 내리기」(지금의 무반응보다 나쁘지 않음). 배포 후 운영 앱 실기 E 로 판정한다.

**수정 (Android 웹만)**
- `lib/ui/overlay-back-stack.ts`: Android 에서는 뒤로 리스너를 **항상 1개** 둔다(지금은 오버레이가 있을 때만). 처리 순서:
  1. 맨 위 오버레이 있으면 그것만 닫음(기존 INAPP-07 그대로).
  2. 없으면 Navigation API `navigation.canGoBack` 이 true 면 `history.back()`. (`navigation.canGoBack` 이 건너뛰기 규칙의 영향을 받지 않는지는 문서로 확인하지 못함 — 0단계 결과 참고.)
  3. 둘 다 아니면 `App.minimizeApp()` (Android 첫 화면 뒤로 = 앱 내리기. 지금은 아무 반응 없음).
- Navigation API 가 없는 WebView 는 이벤트의 `canGoBack`(기존 값)으로 판단 → 기존 동작과 같음.
- INAPP-07 계약 문구(「오버레이 없을 때 리스너 없음」)를 이 동작으로 개정 — 계약 개정이므로 이 항목은 Owner 승인 대상.

**영향 화면·호출처**
- Android 의 모든 웹 화면 시스템 뒤로. 오버레이 16곳(`useOverlayHardwareBack`·`pushOverlayBackEntry` 전수)은 1번 단계 그대로.
- 통화 화면: 네이티브 통화 Activity 는 별도 Activity — 영향 없음. MainActivity 의 통화 중 뒤로(`activeCallBackPressedCallback`)가 Capacitor 보다 먼저 받으므로 통화 연결 중 동작 불변. 통화 코드는 수정하지 않는다.
- 허브 뒤로 슬라이드(`AppRouteTransition` Navigation API traverse 판정, 47eef0f11): `history.back()` 도 traverse 이므로 판정 유지 — 실기 확인 항목.
- iOS·웹·Windows: 리스너를 설치하지 않음(기존과 같음).

**깨질 수 있는 것과 같은 단계 처리**
- 첫 화면(탭 루트)에서 뒤로 = 앱 내리기로 바뀜(지금은 무반응) — Android 표준 동작. 
- 문서가 다시 열리면(새 배포 재로드 등) 새 문서가 리스너를 다시 설치한다. 이전 문서 리스너가 네이티브에 남더라도 아무 일도 하지 않고 새 문서 리스너가 처리. 실기 확인 항목.
- 구현 주의: `document.addEventListener("backbutton")` 은 Capacitor 브리지가 네이티브 「빈」 backButton 리스너를 추가해 기본 뒤로를 막는다(`native-bridge.js` 273~283행). 쓰지 않는다.

**검증**
- 코드: `overlay-back-stack.test.ts` 확장(오버레이 우선·JS 기록 뒤로·첫 화면 내리기·Navigation API 없음).
- 실기(Samsung): E·F 재현, 탭 루트 뒤로, 오버레이 열린 채 뒤로, 거래·주문 채팅 방 뒤로, 허브 뒤로 슬라이드, 통화 연결 중 뒤로(PiP — 동작 불변 확인만).

## 2. 수정하지 않는 항목 (원인 확인 · Owner 결정 따름)

### C. 새 배포 직후 첫 알림 탭에 문서 전체 재로드 (실측 C — FAIL 기록 유지)
- 원인: 20:17 과 21:55 사이 운영 배포가 바뀜(재로드 전후 청크 파일 이름이 다름, Vercel 프로젝트 갱신 21:52 PHT). 이동 중 문서가 목적지 주소(`/community-messenger/rooms/1de13b3e…`)로 다시 열림(`doc_reset reason=same_epoch_reload_keep_current`).
- 하드락 H3-1: Skew Protection 끔은 Owner 결정(2026-11-09 「승인, 적용해」 — 켜면 새 배포 첫 실행 7~10초). H3 은 새 빌드 감지 시 1회 새로고침을 수단으로 정했다. → 이 재로드는 그 결정의 결과이며 이 설계에서 바꾸지 않는다. 재로드가 목적지 주소로 열려 목적지는 유지된다.

## 3. 보고만 (화면 결함 미확인 · 이번 수정 범위 밖)

| # | 내용 | 상태 |
|---|---|---|
| R1 | 탭 1회에 네이티브가 같은 목적지를 웹에 약 15~20회 전달(`PENDING_ROUTE_RETRY_DELAYS_MS` 120·450·900·2000·4000ms, ACK 전까지 반복). 웹이 중복을 버려 이동은 1회 | 화면 영향 없음 |
| R2 | 앱 프로세스 종료 후 알림 탭 시, 이전에 처리된 인텐트(20:17 시험)가 새 알림보다 먼저 다시 들어옴 | 서로 다른 방일 때 영향 NOT_PROVEN |
| R3 | ~~디버그 연결로 문서를 다시 읽은 뒤 이전 문서의 `backButton` 리스너가 남아 뒤로를 삼킴~~ — **정정(11-13): 측정자 잘못.** 측정 중 넣은 `document.addEventListener("backbutton")` 이 Capacitor 브리지에서 네이티브 빈 리스너를 만들었다. 결함 아님 | 삭제 |
| R4 | 방 진입 중 화면이 여러 개(「불러오는 중…」·빈 골격·「채팅방 입장 중…」) 순서대로 보임. 어느 컴포넌트가 그리는지 프레임 단위 계측 안 함 | P1 후 남는 것만 실측해 별도 판단 |
| R5 | iPhone 알림 탭 경로 전체 | NOT_PROVEN |

## 4. 배포 구분 · 순서

- P1·P2 모두 **웹** (앱 재시작만, 빌드 없음). 한 작업 = PR 1개.
- 순서: 0단계(측정 불가 — 위) → P1 구현·시험 → P2 구현·시험 → PR·자동 병합 등록 → 운영 앱에서 1절 실기 행렬.
- 승인: P1·P2 구현(INAPP-07 계약 개정 포함) — Owner 2026-11-13.
