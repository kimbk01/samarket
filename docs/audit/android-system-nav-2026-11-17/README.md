# Android 시스템 내비게이션(◁ 뒤로 · ○ 홈 · ||| 최근 앱) 도메인별 감사 — 2026-11-17 PHT (2차)

- 범위: 감사·수정안 보고만. 코드 변경·커밋 없음.
- 원칙(Owner 11-17): ◁·○·||| 는 **기기 기능**이다. DIBAY 가 막거나, 동작을 지우거나, 바꿔서는 안 된다.
- 설치(adb `dumpsys package`): 두 기기 모두 `com.dibay.app` **1.2.7 (66)**, targetSdk 36. main 의 versionCode 도 66이다.
- 기기
  - **S** = Samsung SM-M156S: Android 16, **3버튼 내비**(`navigation_mode=0`, threebutton 오버레이 켜짐). 계정 q테스트1.
  - **X** = Xiaomi 24076RP19G: Android 16, **제스처 내비**(`navigation_mode=2`).
- 측정 조건
  - 서버: 운영 `https://samarket.vercel.app`(WebView 주소로 확인).
  - 시각: 17:19~17:42 PHT. 기기마다 로그인 상태는 그대로 두었다.
- 측정 방법
  - ◁: S 는 `input keyevent 4`(3버튼 ◁ 와 같은 키), X 는 왼쪽 가장자리에서 밀기(실제 제스처).
  - ○: `keyevent 3`(S), 아래에서 위로 밀기(X). 복귀는 런처 아이콘으로 했다.
  - |||: `keyevent 187`. 복귀는 최근 앱 카드를 눌러서 했다.
  - 판정 근거: 매 단계 **화면 캡처 + 웹 기록(WebView CDP `navigation.entries`, 읽기 전용) + 맨 앞 Activity**. 증거 파일은 모두 이 폴더에 있다.

## 0. 작업자가 기기에 한 일 (먼저 보고)

- S·X 에서 DIBAY 를 **강제 종료 후 재시작**했다. S 4회(17:28·17:39·17:40×2), X 0회.
- 측정을 위해 화면 이동·◁·○·||| 를 반복했다.
- 열어 본 화면: 글·상품·메뉴 시트·신고 창·고객센터 문의 시트, 채팅방 1곳.
  - 채팅방은 **안 읽은 메시지가 없는 방(zxzx11)** 만 열었다.
  - 신고·문의는 **보내지 않고** 닫았다.
- X 에서 배달의민족을 열어 비교 측정했다. 그 결과 X 의 맨 앞 앱은 DIBAY 다.
- adb 포트 연결은 측정 후 모두 해제했다.
- 1차 보고(17:19)에서 S 의 HOME 기록이 마켓 주소로 덮어써진 상태를 남겼다. 이후 재시작으로 정상화했다.

## 1. 기기 기능 정의 (Android 16 기준)

| 버튼 | 기기 기능 | DIBAY 가 지켜야 할 것 |
|---|---|---|
| ◁ 뒤로 | ① 열린 키보드·메뉴·시트 닫기 → ② 앱 안 이전 화면 → ③ 갈 곳이 없으면 **앱을 떠남**(런처 루트는 종료 대신 작업을 뒤로 보냄) | 단계마다 반드시 무언가 일어나야 한다. 무반응은 기기 기능 차단이다. targetSdk 36 에서는 `onBackPressed()` 가 불리지 않고 디스패처 콜백만 불린다. |
| ○ 홈 | 앱을 백그라운드로 보냄. 다시 열면 그 화면 그대로 | 복귀할 때 화면을 바꾸지 않는다 |
| ||| 최근 앱 | 작업 목록을 보여 줌. 카드를 누르면 그 화면 그대로 | 카드가 보이고, 복귀하면 같은 화면이다 |

비교 기준(실측, X, 배달의민족, 17:42 PHT): 첫 화면에서 제스처 뒤로를 했다.
- 1·2번째: 화면 위 배너가 닫혔다(`bm2`·`bm3`).
- 3번째: **앱을 떠났다**. 맨 앞이 직전 앱으로 바뀌었다(dumpsys).

## 2. 도메인별 실측 결과

표기: P = PASS, **F** = FAIL, N = NOT_PROVEN(측정 안 함). 주소는 측정 당시 WebView 주소다.

### HOME

| 화면 | ◁ | ○ | ||| | 증거 |
|---|---|---|---|---|
| HOME 첫 화면 `/` (S) | **F** 무반응, 앱 유지 | P 같은 화면 | P 카드 표시·같은 화면 | `s0`·`s1`, `h1-*` |
| HOME 첫 화면 (X 제스처) | **F** 무반응 | N | N | `x0`·`x1`, `xg1` |
| 정보 공유 → `/philife` | P `/home` 복귀 | N | N | `h2-info*` |
| 이벤트 `/events` | P | N | N | `h3-event*` |
| 알림 `/notifications` | P | N | N | `h4-noti*` |
| telRING 채팅·통화 버튼 | P | N | N | `h5`·`h6` |
| 「마켓」 카드 → `/market` → ◁ | **F (1회 발생)** HOME 기록이 `/market?location=city&lgu=pasig` 로 덮어써져 HOME 으로 못 돌아감. 2번째 ◁ 무반응 | — | — | `s2`~`s5`, CDP 기록 (17:19). 재현 4회(17:39~17:40: 0.8초×2, 콜드 1.5·2.5초) **재현 안 됨** → `d2-*` |

### LOUNGE

| 화면 | ◁ | ○ | ||| | 증거 |
|---|---|---|---|---|
| 정보 공유 첫 화면 `/philife` (S) | **F** 무반응 | N | N | `l0`·`l1` |
| 같은 화면 (X 제스처) | **F** 무반응 | N | N | `xg2` |
| 글 상세 `/philife/{id}` (S) | P `/philife` | P 같은 글 | P 같은 글 | `l2-*`·`l3` |
| 글 상세 (X 제스처) | P | P | P(카드 표시) | `xg3`·`xg4` |
| 글 「⋯」 더보기 메뉴가 열린 채 | **F** 메뉴가 닫히지 않고 **글 목록으로 이동** | — | — | `r1`·`r2` |
| 글 신고 창 | P 창만 닫힘 | — | — | `r3`·`r4` |
| 마켓 `/market` → 상품 `/post/{id}` | P 상품 → 마켓 → `/philife` | N | N | `l4`~`l7` |
| 상품 「⋮」 시트 | P 시트만 닫힘 | — | — | `r6`·`r7` |
| 상품 → **고객센터 문의 시트** | **F** ◁ 2회 모두 무반응(시트 그대로). X 로 닫으면 정상 | — | — | `r8`~`r11` |
| 모임 `/moim` → 모임 찾기 | P 1번째 ◁ 키보드 닫힘, 2번째 `/moim` | N | N | `l8`~`l10` |

### DIPICK

| 화면 | ◁ | ○ | ||| | 증거 |
|---|---|---|---|---|
| 첫 화면 `/stores`(앞 기록 없음) | **F** 무반응 | P | P | `d2`, `d3-*`·`d4` |
| 첫 화면(이전 탭 기록이 남은 경우) | **F(일관성)** LOUNGE 탭 `/philife` 로 이동. 탭 이동이 replace 라서, 남은 아무 기록으로 간다 | — | — | `d0`·`d1` |
| 매장 화면 `/stores/owner?storeId=…` | P `/stores` | P | P | `d5-*`·`d6` |
| 장바구니 아이콘 | 이동하지 않음(눌림 표시만). 뒤로와 무관해 기록만 함 | — | — | `d3-cart` |

### telRING

| 화면 | ◁ | ○ | ||| | 증거 |
|---|---|---|---|---|
| 대화 첫 화면 | **F** 무반응 | N | N | `t0`, `t3` |
| 친구 탭 · 통화 탭 | **F** 무반응(탭 전환이 replace) | N | N | `t4-friends`·`t5-calls-back` (CDP) |
| 채팅방 `/community-messenger/rooms/{id}` | P 대화 목록 | P 같은 방 | P 같은 방 | `t1-*`·`t2` |
| 거래 채팅 · 검색 · 설정 | P | N | N | `t6`~`t8` |

### MY

| 화면 | ◁ | ○ | ||| | 증거 |
|---|---|---|---|---|
| MY 첫 화면 `/mypage` | **F** 무반응 | N | N | `m0` |
| QR 시트 · 프로필 수정 시트 | P 시트만 닫힘 | P 시트 유지 | P 시트 유지 | `m1`, `m4-*`·`m5` |
| CREW REP · 설정 · 알림 | P | N | N | `m2`·`m3`·`m6` |

### 통화 (네이티브 통화 화면)

| 화면 | 판정 | 근거 |
|---|---|---|
| 수신 벨·연결 중 화면 ◁ | **N (코드상 결함)** | `IncomingCallActivity.onBackPressed()` 재정의만 있다(IncomingCallActivity.java:526). Android 16·targetSdk 36 에서는 불리지 않으므로 「작게 내리기」가 실행되지 않는다. 대신 시스템 기본 처리(화면 종료)가 된다. 실기 미측정. |
| 연결된 음성·영상 ◁·○·||| | N (빌드 66) | 코드: `OnBackInvokedCallback`·자동 PiP·최근 앱 카드·카드 밀기 = 통화 유지(`CallForegroundService.onTaskRemoved`). 이전 빌드 실측만 있다(SSOT `docs/dibay-call-minimized-surface-cta-ssot.md` §4). |

## 3. 결함 목록과 원인

| # | 결함 | 범위 | 판정 | 원인 (확인한 것) |
|---|---|---|---|---|
| **D1** | 갈 곳 없는 화면의 ◁ 무반응 → 앱을 떠날 수 없음 | **5개 탭 첫 화면 전부** + 탭 안 전환 화면(telRING 친구·통화) + 기록이 건너뛰기된 화면 | **F (S·X 실측)** | Capacitor `AppPlugin` 뒤로 콜백(node_modules/@capacitor/app 8.1.0 `AppPlugin.java:50-63`)이 항상 켜져 있다. 그런데 `canGoBack=false` 이면 **아무것도 하지 않고 소비**한다. DIBAY 에는 이 경우를 처리하는 코드가 없다. `exitApp`·`minimizeApp`·`moveTaskToBack`(통화 제외) 사용 0건. JS 리스너(`lib/ui/overlay-back-stack.ts:59-67`)도 같은 경우 무동작이다. |
| **D4** | 탭 첫 화면 ◁ 가 그때그때 다른 곳으로 감 | 탭 이동 뒤 첫 화면 | **F (S 실측: DIPICK → LOUNGE)** | 하단 탭 이동이 `router.replace`(lib/main-menu/main-bottom-nav-route-commit.ts:35-39 「hub tabs = replace」)다. 그래서 탭 이동 전에 남은 기록 중 아무거나로 돌아간다. |
| **D5** | 열린 메뉴를 ◁ 가 닫지 않고 화면을 떠남 | LOUNGE 글 「⋯」 메뉴 | **F (S 실측)** | `components/community/ui/CommunityMoreMenu.tsx` 가 `useOverlayHardwareBack` 에 등록하지 않는다(`useRegisterOpenOverlay` 만 있음). |
| **D6** | 열린 시트에서 ◁ 를 삼킴(무반응) | 고객센터 문의 시트 | **F (S 실측)** | `components/support/SupportModalHost.tsx:341` 가 `dismissible={false}` 다. `DibayOverlayRoot`(:81)는 이 경우 핸들러 `null` 로 등록해 ◁ 를 삼킨다. |
| D6-b | 같은 구조라 ◁ 를 삼킬 화면 | `DibayFullSheet`(하드코딩 false, :87) 사용처: 거래 상품 신고 `ReportReasonModal`·매장 위치 선택 `StoreLocationPickSheet`·메신저 전달 `MessengerForwardSheet`. 그 밖에 `ImageEditorModal`(:347)·`ChatMobileImagePickerSheet`(:63)·`MessengerPillarLeaveConfirmSheet` | **N (코드 확인, 실기 미측정)** | D6 과 같다 |
| D2 | 마켓 진입 직후 ◁ 때 HOME 기록 덮어쓰기 | HOME → 마켓 | **F (1회 실측)**, 재현 4회 실패 → 발생 조건 NOT_PROVEN | 덮어쓴 주소 형식은 `useTradeMarketplaceLocationHydrate` 의 `router.replace`(lib/trade/location/use-trade-marketplace-location-hydrate.ts:112·189) 결과와 같다. 이 hook 은 비동기로 기다린 뒤 주소를 바꾸며, 화면을 떠났는지 확인하지 않는다(`runId` 만 비교). |
| D3 | 수신 벨 화면 ◁ 가 설계와 다르게 동작 | 통화 | **N (코드)** | §2 통화 표 |

참고. 기기 기능을 막지는 않지만 의도된 보호 동작이다.
- 작성 중 이탈 확인: LOUNGE 글쓰기, 주소 편집, 탈퇴 요청, 고객센터 댓글, 주문 후기. ◁ 를 누르면 「나갈까요?」 확인을 먼저 띄운다.
- 처리 중(busy) 대화 상자: 처리 중에만 ◁ 를 삼킨다.
- 앱 시작 인트로: ◁ = 건너뛰기. 홈 준비 전에는 최대 10초 대기(DibayNativeIntro.java:74·286).

이번 측정에서 이 항목들의 실기 측정은 하지 않았다(N).

○·||| 복귀 시 화면을 바꿀 수 있는 코드도 확인했다.
- 하단 탭 이동이 8초 넘게 멈춘 경우 문서 다시 열기(bottom-nav-controller.ts:110)
- 30분 이상 숨김 + 새 배포(web-version-resume.client.ts)
- 필수 주소 게이트(MandatoryAddressGate.tsx:89)
- 통화·알림 대기 경로 재생

이번 측정의 ○·||| 14회는 **모두 같은 화면으로 복귀**(P)했다. 위 조건들은 측정하지 않았다(N).

## 4. 수정안 (원인별 · 임시 처리 없음)

### F1 — D1: 「갈 곳 없으면 앱을 떠난다」를 되돌려 놓기 (웹만, 빌드 없음)

`lib/ui/overlay-back-stack.ts` 의 단일 JS 리스너를 **Android 메인 앱에서 상시 설치**한다. 처리 순서는 기기 기능 순서 그대로다.
1. 열린 시트·메뉴가 있으면 맨 위만 닫는다. 지금 그대로.
2. `ev.canGoBack` 이면 `history.back()`. Capacitor 기본 `goBack()` 과 같다.
3. 알림 이동 직후 화면이면 `history.back()`. 결함 E 처리 그대로.
4. 그 밖, 즉 갈 곳이 없으면 `App.minimizeApp()` 를 부른다. Capacitor 내장이며, 시스템 기본 동작과 같은 `moveTaskToBack(true)` 이다.

- 지금과 달라지는 것은 「무반응」 하나뿐이다.
- 통화 연결 중 ◁ 는 MainActivity 콜백이 먼저 받으므로 영향이 없다(통화 코드 무변경).
- 설치본 66 에 `@capacitor/app` 이 이미 있어 웹 배포만으로 적용된다.
- 위험: JS 가 멈추면 ◁ 도 멈춘다. 실기 검증 항목에 넣는다.
- #252 P2 와 비슷한 구조다. #252 는 P1(iOS 시작 멈춤) 때문에 전체가 되돌려졌다. 이 안은 Android 드라이버에서만 설치된다.

### F2 — D5: 메뉴·팝업은 반드시 뒤로 처리에 등록

`CommunityMoreMenu` 에 `useOverlayHardwareBack(open, () => setOpen(false))` 를 추가한다.
- 같은 종류(열림 상태가 있는데 등록이 없는 메뉴·팝업)를 찾는 **정적 검사**를 추가한다(`useRegisterOpenOverlay` 사용처 ↔ `useOverlayHardwareBack` 대조).
- 찾은 것은 목록으로 보고한 뒤 같은 PR 에서 처리한다.

### F3 — D6·D6-b: 「닫을 수 있는 시트는 ◁ 로 닫힌다」

- `dismissible={false}` 는 「바깥 탭으로 닫기 막기」 용도로만 쓰고, ◁ 는 `onClose`(X 와 같은 처리)로 연결한다.
- `DibayOverlayRoot` 에서 ◁ 를 삼키는 경우는 **처리 중(busy)** 과 **강제 업데이트 화면** 둘로 한정한다.
- 문의 시트처럼 작성 중 내용이 있는 경우는 기존 이탈 확인(X 와 같은 확인)을 그대로 띄운다.
- 대상: SupportModalHost, DibayFullSheet 사용처 3곳, ImageEditorModal, ChatMobileImagePickerSheet, MessengerPillarLeaveConfirmSheet. 각각 X 버튼의 동작과 1:1 로 맞춘다.

### F4 — D4: 탭 첫 화면의 ◁ 목적지 고정 (Owner 결정 필요)

현재 계약은 「허브 탭 = replace, Back ≠ hub」(`cm-hub-navigation-contract`)이다. 이 계약 때문에 목적지가 남은 기록에 따라 달라진다. 선택지는 두 가지다.
- (가) Android 표준(Navigation 컴포넌트 기본): HOME 이 아닌 탭 첫 화면 ◁ → HOME 탭, HOME 에서 ◁ → 앱 떠남.
- (나) 모든 탭 첫 화면 ◁ → 앱 떠남.

기존 계약을 바꾸는 일이라 임의로 정하지 않는다. F1 만 적용해도 「무반응」은 없어진다. 다만 「다른 탭으로 감」은 남는다.

### F5 — D2: 마켓 위치 확정의 늦은 주소 변경 차단 (웹만)

- `router.replace` 직전에 「hook 이 시작된 경로 = 지금 `location.pathname`」 과 「마운트 유지」를 확인한다. 다르면 주소를 바꾸지 않는다.
- 정리 함수에서 `runIdRef` 를 올려 진행 중 결과를 버린다.
- 재현 조건이 확정되지 않았으므로, 구현 전에 `history.replaceState` 호출 위치를 기록하는 측정을 먼저 한다.

### F6 — D3: 수신 화면 뒤로를 디스패처 콜백으로 (네이티브 · 통화 규정)

- `IncomingCallActivity` 의 `onBackPressed` 처리를 `getOnBackPressedDispatcher().addCallback` 으로 옮긴다. 음성·영상 화면과 같은 방식이다.
- 통화 규정 3번에 따른 순서: 실기 측정으로 결함 확정 → 영향 분석 문서 → Owner 승인 → 단독 PR → 재빌드(67) → 통화 행렬 검증.

### 반영 순서 (권장)

1. F1·F2·F3 = 웹 PR 1개. 도메인은 「Android 시스템 뒤로」 하나로 같다.
2. F5 측정 → 수정.
3. F4 는 Owner 결정 후.
4. F6 는 통화 단독.

## 5. 남은 확인 (NOT_PROVEN)

- 통화 화면 전체(수신 벨·연결 음성·영상 × ◁·○·|||).
- D6-b 각 화면 실기.
- 작성 중 이탈 확인 화면들의 ◁.
- ○·||| 복귀 시 화면을 바꾸는 조건들(8초 감시, 30분 재로드, 주소 게이트, 통화·알림 재생).
- X 의 DIPICK·telRING·MY 제스처 측정(같은 원인 경로지만 측정 안 함).
- D2 발생 조건.

## 6. 증거 파일

이 폴더의 `s*`·`a0`·`h*`·`l*`·`d*`·`t*`·`m*`·`r*`(Samsung), `x*`·`xg*`(Xiaomi), `bm*`(배달의민족 비교) PNG. 웹 기록 값은 §2 각 행의 CDP 결과(측정 로그)에서 옮겼다.

## 7. 구현 반영 (Owner 「Start F1·F2·F3」 2026-11-17) — 코드 PASS 만, 실기 NOT_PROVEN

- 증거 PNG 는 크기 때문에 저장소에 올리지 않았다(작업 기기 로컬 `docs/audit/android-system-nav-2026-11-17/*.png` 보관).
- **F1 (D1)**: `lib/ui/android-root-back.ts` + `components/layout/providers/AndroidRootBackHost.tsx`(MainAppProviderTree 1곳)
  - 웹 기록 첫 항목(Navigation API index 0)에서만 `overlay-back-stack` 의 단일 리스너를 켠다.
  - 처리 순서 = 오버레이 → 알림 이동 뒤로 → `canGoBack` 이면 `history.back()` → 그 밖은 `App.minimizeApp()`(기기 기본과 같은 `moveTaskToBack`).
  - index > 0 화면은 손대지 않는다. Navigation API 가 없거나 Android 가 아니면 지금 동작 그대로다.
- **F3 (D6)**: `DibayOverlayRoot.backDismissible`(기본 = `dismissible`)을 추가했다. 바깥 탭 잠금과 ◁ 를 분리한다.
  - ◁ = X 와 같은 처리: DibayFullSheet, ImageEditorModal, ChatMobileImagePickerSheet, 고객센터 문의(SupportModalHost, 접수 중에는 삼킴), 거래·주문 나가기 확인(처리 중에는 삼킴).
  - 처리 중(busy) 대화 상자는 지금처럼 삼킨다.
- **F2 (D5)**: 열림 등록(`useRegisterOpenOverlay`)만 있고 ◁ 등록이 없던 16곳에 등록했다. 각 곳의 ◁ 는 ✕·바깥 탭과 같은 닫기다.
  - 메뉴: LOUNGE 글·내 글 「⋯」, 댓글 「⋯」
  - 패널: 메신저·거래내역 머리글 패널, 알림함
  - 시트·화면: 거래 글쓰기 시트·불러오는 틀, 모임 앨범 보기, 사장님 주문 채팅·매장 미리보기, 수수료 상세, 매장 필터 시트, 주문 패널·주문 내역 서랍·구매자 주문 시트, 오픈 그룹 가입 미리보기(가입 요청 중에는 삼킴)
  - 거래 글쓰기는 ◁ 도 ✕ 처럼 「나갈까요?」 확인을 거친다. 지금까지는 확인 없이 닫혔다. 확인이 떠 있을 때 ◁ = 「계속 쓰기」.
  - 정적 검사 `lib/ui/__tests__/overlay-back-registration-contract.test.ts` 로 새 누락을 막는다.
- **이번에 고치지 않고 보고만** (Owner 결정 필요)
  1. `blocking` 확인창(이어쓰기·카테고리 변경·작성 이탈·방 나가기 등 10곳)은 ◁ 처리에 등록되지 않는다. 그래서 ◁ 가 아래 화면으로 넘어간다. 「이어쓰기?」 창은 취소 = 「새로 쓰기(임시저장 삭제)」라서, ◁ 를 일괄로 취소에 연결하면 임시저장이 지워진다. 창마다 ◁ 의 뜻을 정해야 한다.
  2. 채팅방 만드는 중 표시(`TradeChatEntryCreatingOverlay`)에는 닫기 수단이 없다. 지금은 ◁ 가 아래 화면으로 넘어간다.
  3. `MessengerContactsRevokeDialog`(주소록 권한 해제 후 삭제/유지)에는 중립 선택지가 없다. 지금은 ◁ 가 아래 화면으로 넘어간다.
  4. F4(탭 첫 화면 ◁ 목적지), F5(D2), F6(D3 통화)는 각각 별도로 진행한다.
