# 로딩 스피너 통일 · 빈 화면 0 · 기기 네트워크 안내 — 감사·설계안 v2 (2026-11-22 · 설계만 · 구현은 승인 후)

## 0. Owner 지시 원문

1차:
> 디바이의 대기중 의 로딩스피너 부분을 정확히 모든 부분을 감사 해서 동일한 형태 통일성이 필요 한 부분이고, 기기의로딩시 항시 빈화면이 아닌 로딩 스피너가 보여 지길 원하는 부분이며 기기의 네트워크 문제시 정확히 내트워크가 불안정? 정확한 디바이의 문제가 아닌 기기의 문제하는 부분의 알림이 필요한 부분이다, 정확히 감사 해서 설계안을 보고 해라,

2차:
> 추측으로 하지 말고, 땜빵으로 되는 부분을 다시 끝까지 확인 해서 설계안을 만들어야 하는 부분이다, 아울러 오너결정 부분은 너의 줭상 추천 부분을 적용을 원하는 부분이다,

요구:
- **R1** 대기 스피너를 한 모양으로 통일한다.
- **R2** 로딩 중 빈 화면 대신 스피너를 보여 준다.
- **R3** 기기 네트워크 문제(끊김·불안정)를 DIBAY 문제와 구분해서 알린다.
- 이 v2 에서는 추측·임시 처리(땜빵)를 빼고, 1차의 「Owner 결정」 항목에는 작업자 추천안을 적용한다.

---

## 1. 1차 보고 정정 (작업자 잘못 — 먼저 적음)

1차 보고는 하위 조사 결과를 직접 확인하지 않고 쓴 부분이 있었다. v2 에서 모두 원본 코드·운영 설정·공식 문서로 다시 확인했고, 아래 9건이 틀렸다.

| # | 1차에 쓴 것 | 확인한 사실 | 근거 |
|---|---|---|---|
| 1 | `loading.tsx` 없는 115개 페이지가 빈 화면 | **빈 화면이 아니다.** Next 는 화면 이동을 `startTransition` 으로 하고, 새 구간에 로딩 경계가 없으면 **이전 화면을 그대로 둔다** | `node_modules/next/dist/client/components/layout-router.js:290-325`(로딩 모듈이 있을 때만 Suspense 를 만듦) · `app-router-instance.js:117,276-300`(startTransition) |
| 2 | `Suspense fallback={null}` 17곳이 빈 화면 | **15곳은 대기가 생기지 않는다.** `useSearchParams` 를 쓰는 클라이언트 컴포넌트를 감싼 형식뿐이고, 루트 레이아웃이 `cookies()`(`app/layout.tsx:117`)를 써서 모든 화면이 동적 렌더라 멈추지 않는다. `stores/browse/[primary]` 는 경로 값만 기다린다. **실제 대기는 `mypage/section/[section]/[item]`(·`edit`) 1곳** — `mypage/layout.tsx:15` 의 null 경계 안에서 `loadMypageServerShell()` 을 기다린다 | 각 page.tsx 확인 |
| 3 | Skew Protection 꺼짐 → 배포 직후 흰 화면 3초+ (Owner 결정 항목) | **켜져 있다.** `skewProtectionMaxAge = 604800`(7일), 2026-11-22 Vercel API 로 조회. 11-18 10:09 PHT 에 켬(`app-entry-device-fail-root-cause-design-2026-11-17.md` §24-13). `idle-menu-freeze-audit-2026-11-22.md:54` 의 「꺼짐(결정 유지)」은 오래된 기록이다. 흰 화면 3초 실측은 끄던 때(11-09~11-18) 값이라 현재 상태는 NOT_PROVEN. Next 16.1.7 은 Vercel 빌드에서 `NEXT_DEPLOYMENT_ID` 를 자동으로 쓴다(`next/dist/server/config.js:667-678`) → **결정할 것 없음** | 운영 설정 조회 |
| 4 | 셸만 그려지고 본문이 빈 순간(A5) | **아니다.** 하이드레이션 전 본문은 회색 줄 자리 표시(`MainShellDocumentLoading`)이고, 덮개가 있는 시작의 흰 프레임은 실측 0(0/34·18/18) | `ConditionalAppShell.tsx:389-393`, 시작 감사 §8 |
| 5 | DNS 실패를 「기기 끊김」으로 판정하는 것이 결함 | **절반만 맞다.** Android WebView 는 주소 찾기 실패를 `ERROR_HOST_LOOKUP`(「Server or proxy hostname lookup failed」, Android 공식 문서)으로 준다. 우리 코드에는 `ERR_INTERNET_DISCONNECTED` 를 만드는 줄이 없다(`DibayBridgeWebViewClient.java:245-280`). 그래서 기기가 끊겨도, DIBAY 주소가 안 찾아져도 같은 값이다. 결함은 「판정이 틀림」이 아니라 **「둘을 가를 수단이 없음」**이다 | 원본·공식 문서 |
| 6 | 250ms·3초·30초·2회·60초 같은 숫자 | **근거 없이 만든 값이었다** → 모두 뺐다. 앱에 이미 있는 값만 쓴다(§3-0) | — |
| 7 | Android `navigator.connection.effectiveType` 으로 불안정 판정 | 지원 여부를 확인하지 못했다(MDN 「Limited availability」, 호환표가 안 보임) → **뺐다** | MDN |
| 8 | `networkErrorKey()` — 전역 상태를 보고 기존 문구를 바꿔 끼움 | **임시 처리다.** 그 실패의 원인이 아니라 「요즘 상태」로 문구를 고른다 → 실패 하나하나를 그 오류 값으로 판정하도록 바꿨다(§3-3) | — |
| 9 | Android 도 외부 확인 주소로 판정 | 기기 OS 가 이미 인터넷 연결을 검증해 둔 값 `NET_CAPABILITY_VALIDATED`(API 23+, 「the system found actual connectivity to the general Internet the last time it checked」 — Android 공식 문서)가 있다 → **Android 는 요청 없이 OS 값을 쓴다** | 공식 문서 |

---

## 2. 확인된 사실 (v2 · 직접 확인한 것만)

### 2-1. R1 — 스피너 모양

| 모양 | 수 | 확인 |
|---|---|---|
| 12점 링 | 컴포넌트 4개 + 별칭 1개 | 4개 모두 직접 읽음. 크기 24px(`DibayPtrSpinner.module.css:6`) · 44px(`StoreDeliveryBufferingSpinner.module.css:3`) · 20px · 48px. 색이 서로 다르다. 주기는 모두 1.15s |
| 테두리 링 (`animate-spin`) | 사용자 화면 줄 27개 (테스트·lib 포함) | `grep animate-spin` 결과 |
| `.dibay-overlay-*__spinner` | 클래스 2개, 0.7s·0.8s | `app/dibay-overlay.css:458, 744` |
| Lucide `Loader2` | 8곳 | 같은 grep |
| 글자만 「불러오는 중…」 | 관리자 제외 `t("common_loading")` 101곳 / 84개 파일 | grep. **이 중 버튼 문구로 쓰는 곳과 대기 표시로 쓰는 곳은 구현 1단계에서 파일별 표로 나눈다** (지금 숫자로 나누지 않음) |
| 공통 스피너 | 없음 | `Sam`·`design-tokens.css` 에 spinner 없음 |

### 2-2. R2 — 빈 화면 (원본 코드로 확인)

**동작 원리** (`layout-router.js:405-491`):
- 화면 구간은 `stateKey` 로 새로 그려진다.
- 그 구간에 `loading.tsx` 가 있으면, 새로 생긴 Suspense 경계가 **그 파일 내용을 즉시** 보여 준다.
- 그래서 내용이 `null` 이면 본문이 빈다.
- 단, 미리받기(prefetch)로 경계까지 받아 둔 경우에만 즉시 보인다. 안 받아 둔 경우는 이전 화면이 남는다.
  - 미리받기 끈 링크 98곳, `router.prefetch` 60곳, `staleTimes.dynamic: 300`(5분 안 재방문은 캐시로 바로 그림, `next.config.js:62`).
  - 따라서 빈 화면은 **「미리받기 된 곳으로 처음 가거나 5분 넘어 다시 갈 때」** 생긴다. 실제로 몇 번·몇 ms 생기는지는 측정하지 않았다 → NOT_PROVEN.

| ID | 빈 화면 | 확인 |
|---|---|---|
| W1 | `loading.tsx` 가 `return null` 인 구간 9개의 **하위 화면** — `stores/**`, `my/**`, `mypage/**`(허브 외), `philife/**`, `market/**`, `post/**`, `community-messenger/**`(contacts 등) | 9개 파일 직접 읽음. **허브 첫 화면(하단 탭)은 해당 없다**: 보관 안 된 허브로 갈 때는 `BottomNavHubSkeleton` 이 덮는다(`HubRetentionStack.tsx:172`, 허브 목록 `resolve-main-surface.ts:97-107`) |
| W2 | `mypage/section/[section]/[item]`(·`edit`) — `mypage/layout.tsx:15` `Suspense fallback={null}` 안에서 서버 데이터 대기 | 직접 확인 |
| W3 | **매장 하위 화면 전체 화면 빈 덮개** — `DeliveryRecruitingRouteGuard.tsx:99-100` `fixed inset-0 bg-sam-app`, `/api/stores/[slug]/summary` 응답까지 | 직접 확인. **운영에서 지금 발생 중**: `delivery_launch_settings.mode = 'recruiting'`(운영 DB 읽기 전용 조회 2026-11-22, 마지막 변경 11-20 02:05 PHT) |
| W4 | 화면 크기 지연 로드 — 표시 없음: `TradeHistoryFromHeaderStack.tsx:12`, `AddressMapConfirmClient.tsx:34`, `MainAppProviderTree.tsx:48`(필라이프 글쓰기 시트), 빈 칸 `PhilifeNeighborhoodWriteForm.tsx:95-98` | 4곳 직접 확인 |
| W5 | 목록 영역 `if (loading) return null` — `StoresHomeFeedList.tsx:53`(매장 홈 아래 피드) | 직접 확인 |
| W6 | Android 덮개 없는 시작 — OAuth 복귀(`dibay://auth`), 설정 변경 재생성, 렌더러 재생성 `recreate()` | `MainActivity.java:201-214, 1487-1491`, `DibaySplashCover.java:52`. 빈 프레임 실측 없음 → NOT_PROVEN |
| W7 | 시작 덮개(초록·정지 로고)에 진행 표시 없음 — **실측 덮개 시간 Xiaomi 5.0~5.9초 · Samsung 4.4~5.8초** | `DibaySplashCover.java:92-100`, iOS `LaunchScreen.storyboard`. 실측: 시작 감사 §24-12 |
| W8 | iOS 덮개는 웹 신호 즉시 걷힘(네이티브 화면 확정을 기다리지 않음) | `DibayRootBridgeViewController.swift:400-407, 431-432`. 흰 프레임 실측 없음 → NOT_PROVEN |
| W9 | 통화 화면 `calls/[sessionId]/page.tsx:19,40,85`, `calls-v3/[callId]/page.tsx:32` | **통화 규정 → 이 설계의 웹 단계에서 제외** |

빈 화면이 **아닌** 것 (1차에서 빼거나 고침):
- loading 없는 115개 페이지 → 이전 화면이 남는다. 오래 멈추는 경우는 `idle-menu-freeze-design` S2(이동 요청 상한 8초)가 맡는다.
- 나머지 Suspense 15곳.
- 있을 수도 없을 수도 있는 작은 영역 2곳(`MessengerContactsFriendSection.tsx:45`, `CommunityMessengerTradeProcessSection.tsx:331`) → 내용이 없을 수도 있는 띠라서, 스피너를 두면 없는 내용을 기다리는 것처럼 보인다. 그대로 둔다.

### 2-3. R3 — 네트워크 안내 (원본·공식 문서로 확인)

**웹**
- 기기 신호는 `navigator.onLine` 하나뿐이다(`WebConnectivityBanner.tsx:15-22`).
- MDN 에 따르면 이 값은 LAN 에 붙어 있으면 인터넷이 없어도 true 이고, 「inherently unreliable」하다.
  - 그래서 **와이파이는 붙어 있는데 인터넷이 안 되는 경우 안내가 0** 이다.
- `common_network_error` 15곳, `common_network_error_generic` 5곳은 원인과 상관없이 「네트워크 오류가 발생했습니다」 하나를 낸다.
  - `catch` 가 기기 끊김·서버 오류·응답 해석 오류를 구분하지 않는다.
- `AppBootProvider.tsx:99-102` 는 처리 안 된 "Failed to fetch" 를 조용히 삼킨다.
- 오류 화면 `app/(main)/error.tsx:21-22` 는 「문제가 발생했어요 / 잠시 후 다시 시도해 주세요」만 낸다.

**네이티브 시작 오류**
- Android `MainActivity.java:2593-2611`:
  - 주소 찾기 실패 → 「인터넷에 연결되어 있지 않습니다」. DIBAY 쪽 원인과 구분할 수 없다.
  - 연결·시간 초과 → 제목은 「서버에 연결할 수 없습니다」(DIBAY 탓)인데, 본문은 「네트워크 연결을 확인한 뒤…」(기기 탓)로 **서로 반대**다(`values-ko/strings.xml:7-8`).
- iOS `DibayRootBridgeViewController.swift:664-679`:
  - `CannotFindHost`·`CannotConnectToHost` 까지 「기기 끊김」으로 판정한다.
  - HTTP 상태를 보는 처리(`navigationResponse`)가 없다(grep 0).
- iOS `NWPath.status == .satisfied` 는 「The path has a usable route upon which to send and receive data」(iOS SDK `Network.framework/Headers/path.h:53`)라는 뜻이다. **인터넷 도달은 보장하지 않는다.**
  - 그래서 iOS 에서 기기 문제와 DIBAY 문제를 가르려면 확인 요청 1개가 필요하다.

**범위 밖 결함 (보고만)**: `DeliveryRecruitingRouteGuard.tsx` `viewerMayEnterStore` 는 네트워크 실패(`!res.ok`·catch)를 「권한 없음」과 같게 처리한다. 그래서 사장님·관리자도 연결이 끊기면 `/stores` 로 쫓겨난다.

---

## 3. 설계 (Owner 결정 항목 = 작업자 추천안 적용)

### 3-0. 쓰는 숫자 — 새로 만들지 않고 이미 있는 값만

| 값 | 쓰는 곳 | 출처 |
|---|---|---|
| **450ms** | 스피너가 나타나기 전 대기. 이보다 빨리 오면 스피너가 안 보인다 | `messenger-page-snapshot-transition.ts:21` `ENTRY_SPINNER_DELAY_MS` — 앱에 이미 있는 유일한 「스피너 지연」 값 |
| **8초** | 「멈춤」 판정 → 네트워크 판정 시작, 「불안정」 기준 | `bottom-nav-controller.ts:37` `BOTTOM_NAV_SETTLE_WATCHDOG_MS`(하단 탭 계약 v2 승인값). idle-menu-freeze S2 가 같은 값을 `lib/net/navigation-stall-policy.ts` 로 옮길 예정이라 그 상수를 함께 쓴다 |
| **1.15s** | 스피너 한 바퀴 | 현 12점 링 4종 공통 |

두 값을 `lib/ui/loading-timing.ts` 에서 다시 내보내 한 곳만 보게 한다. 네이티브는 같은 숫자를 상수로 두고, 구조 테스트로 웹 값과 같은지 검사한다.

### 3-1. R1 — `DibaySpinner` 하나

- **모양**: 12점 링(현재 피드·배달·당겨서 새로고침·메신저 타임라인이 쓰는 모양).
  - CSS 를 `app/samarket-components.css` `.sam-spinner` 하나로 합친다.
  - 동작 줄이기 설정에서는 점 전체 펄스로 바뀐다(현 PTR 규칙 그대로).
- **크기**: `sm` 16 · `md` 24 · `lg` 44. 24·44 는 현재 PTR·배달 값이고, 16 은 현재 버튼 안 테두리 링 크기다.
- **색**: `surface`(밝은 바탕) · `inverse`(사진·영상·브랜드 바탕) · `current`(버튼 글자색). `design-tokens.css` 에 `--sam-spinner-on/off` 를 추가한다.
- **파일**: `components/ui/DibaySpinner.tsx` + `Sam.spinner`. `role="status"`, `aria-label` 은 기존 키 `chats_spinner_loading_aria`.
- **바꾸는 곳** (통화 화면 제외):
  - 12점 링 4종 → `DibaySpinner`. PTR 은 당기는 정도에 따라 점이 켜지는 동작만 남기고 점 규격·색을 공유한다.
  - 테두리 링·`Loader2`·`dibay-overlay` 스피너 클래스·`RefreshCw` 회전 → `DibaySpinner`.
  - 글자만 있는 대기 표시 → `DibaySpinner`. 버튼 문구로 쓰는 「불러오는 중…」은 버튼 안 `sm` 스피너로 바꾼다.
- **Owner 결정 1 → 추천안 적용: 스켈레톤은 유지한다.**
  - 이유: 스켈레톤은 빈 화면이 아니고, 화면 모양을 먼저 보여 줘 더 빨라 보인다.
  - 규칙: **「화면 모양을 아는 곳 = 기존 스켈레톤, 그 외 모든 대기 = `DibaySpinner`」.** 둘 외의 대기 표시는 금지한다.
  - 스켈레톤끼리 색·펄스가 다른 것(채움색 6종 이상)은 이번 범위 밖이라 보고만 한다.
- **재발 방지**: `npm run verify:loading-spinner-ssot`(CI 포함).
  - 새 `animate-spin`·`Loader2`·스피너 keyframes 를 금지한다.
  - `loading.tsx` 의 `return null` 을 금지한다.
  - 통화·관리자 경로는 기준선(파일별 현재 개수)으로만 묶어, 늘면 실패한다.

### 3-2. R2 — 빈 화면 채우기

**`DibayPendingSpinner`** (본문 가운데 `lg`)
- **450ms 동안은 `bg-sam-app` 만 보인다**(CSS `animation-delay`, JS 타이머 없음 → 하이드레이션 전에도 동작).
  - 그 안에 내용이 오면 스피너가 아예 안 보인다. 450ms 미만 동안 바탕만 보이는 것은 스피너 깜박임을 막기 위해 메신저 방 진입과 같은 기준을 쓴 것이다.
- 8초가 지나면 §3-3 의 판정 결과를 스피너 아래에 붙인다.

| ID | 바꾸는 것 |
|---|---|
| W1 | null `loading.tsx` 6개(통화 3개 제외) → `<DibayPendingSpinner />`. 허브 첫 화면은 `HubRetentionStack` 이 기존 보관 화면·`BottomNavHubSkeleton` 을 먼저 보여 주므로 동작이 같다 |
| W2 | `mypage/layout.tsx:15` fallback → `DibayPendingSpinner` |
| W3 | `DeliveryRecruitingRouteGuard` 덮개 안에 `DibayPendingSpinner` |
| W4 | 4곳 `dynamic` 에 `loading: () => <DibayPendingSpinner />`(시트는 시트 높이 안). `PhilifeNeighborhoodWriteForm` 의 빈 칸에 스피너를 넣는다 |
| W5 | `StoresHomeFeedList` 대기 → 영역 높이 유지 + `md` |

- **바꾸지 않는 것**: loading 없는 115개 페이지에 `app/(main)/loading.tsx` 를 새로 만드는 1차안은 **철회**한다.
  - 지금은 이전 화면이 남는데, 경계를 만들면 오히려 빈 칸이 새로 생긴다.
  - 오래 멈추는 경우는 S2 가 맡는다.

### 3-3. R3 — 네트워크 판정·안내 (Owner 결정 2 → 추천안 적용)

**판정은 실패 하나하나의 오류 값으로** — `lib/net/classify-request-failure.ts`

| 결과 | 조건 (모두 오류 값으로 판정) |
|---|---|
| `device_offline` | 기기 신호 「인터넷 없음」 — Android `NET_CAPABILITY_VALIDATED` 없음 / iOS `NWPath` `unsatisfied` / 웹 `navigator.onLine === false` |
| `device_unstable` | 기기 신호는 「인터넷 있음」인데, DIBAY 요청이 TypeError·시간 초과 또는 8초 넘게 응답 없음 **이고** 확인 요청(아래)도 실패·8초 초과 |
| `dibay_unreachable` | DIBAY 요청은 네트워크 단계에서 실패했는데 기기 신호·확인 요청은 정상 |
| `dibay_error` | DIBAY 가 5xx 로 응답함 (기기는 서버까지 닿았다는 뜻) |
| `aborted` | 취소 — 무시 |

- **기기 신호 (추천안)**:
  - Android 새 빌드는 OS 가 이미 검증한 `NET_CAPABILITY_VALIDATED` 를 쓴다. **요청 0건**이다.
  - iOS 는 `NWPathMonitor` 가 경로만 알려 주므로(§2-3), 판정이 필요할 때 **확인 요청 1건**을 보낸다.
  - 구 바이너리(Android·iOS)와 웹도 같은 확인 요청을 쓴다.
- **확인 요청 (추천안)**:
  - 주소는 OS 가 스스로 쓰는 연결 확인 주소다. iOS `http://captive.apple.com/hotspot-detect.html`, Android 웹 `https://www.gstatic.com/generate_204`.
  - 기기가 이미 주기적으로 접속하는 곳이라 새로 알려지는 정보가 없다. 사용자 정보·쿠키·경로는 싣지 않는다.
  - **언제 보내나**: DIBAY 요청이 실패하거나 8초 넘게 멈춘 「사건」마다 1번. 그 뒤 DIBAY 요청이 1번 성공할 때까지 다시 보내지 않는다(숫자 제한 없이 사건 단위).
  - 운영 Supabase 요청 추가 0건이다.
- **관찰 위치**: `AppBootProvider` 모듈 로드 때 전역 fetch 관찰 1개를 설치한다(`lib/net/network-health.client.ts`).
  - 요청·응답을 바꾸지 않고 결과만 읽는다. 같은 방식이 이미 2곳 있다: `supabase-call-counter.ts:220-233`, `session-freshness-fetch-gate.client.ts:234`.
  - 설치 순서는 세션 관문 다음이다(Auth HARD LOCK 의 관문 동작은 그대로).
  - 대상은 같은 출처 `/api/**` 와 Supabase REST 만이다. Realtime·통화 신호·미리받기는 제외한다.
- **화면 안 오류 문구**:
  - `common_network_error` 20곳은 그 `catch`·응답 값을 `classifyRequestFailure()` 에 넣어 결과별 키로 낸다(§3-4 문구).
  - 「전역 상태로 문구 바꿔 끼우기」(1차안)는 쓰지 않는다.
  - 기능별 「…하지 못했습니다」 키 약 40개는 범위 밖으로 기록만 한다.
- **전역 안내** = 기존 `WebConnectivityBanner` 를 확장한다(새 배너 없음).
  - `device_offline`·`device_unstable`·`dibay_unreachable` 만 띄운다.
  - `dibay_error`(5xx) 는 그 화면 문구로만 알린다. 한 API 의 5xx 를 「DIBAY 전체 장애」로 보지 않기 위해서다.
  - 사라지는 때: 다음 DIBAY 요청이 8초 안에 성공했을 때.
- **대기 화면 연결**: `DibayPendingSpinner` 가 8초에 이르면 판정을 돌린다.
  - `device_*`·`dibay_unreachable` 이면 스피너 아래 문구와 「다시 시도」를 보여 준다.
- **오류 화면**: `app/error.tsx`·`(main)/error.tsx`·`global-error.tsx`·`community-messenger/error.tsx` — 판정이 `device_*` 이면 기기 안내 1줄을 더한다.

### 3-4. 문구 (ko · en 은 같은 PR 에 SSOT §4 기준으로)

| 결과 | 새 키 | ko |
|---|---|---|
| `device_offline` | `net_device_offline` | 휴대폰이 인터넷에 연결되어 있지 않아요. Wi‑Fi 또는 모바일 데이터를 확인해 주세요. |
| `device_unstable` | `net_device_unstable` | 휴대폰의 인터넷 연결이 불안정해요. 연결이 좋아지면 다시 시도해 주세요. |
| `dibay_unreachable` | `net_dibay_unreachable` | DIBAY 연결이 잠시 원활하지 않아요. 잠시 뒤 다시 시도해 주세요. |
| `dibay_error` | `net_dibay_error` | DIBAY 에서 일시적인 오류가 났어요. 잠시 뒤 다시 시도해 주세요. |

- 기존 `app_connectivity_offline` 은 `net_device_offline` 으로 바꾸고 지운다.
- 쓰는 곳이 0인 `support_offline_hint` 는 지운다.
- **Owner 결정 2 → 추천안 적용**: DIBAY 쪽 문제도 알린다. 알리지 않으면 사용자가 자기 기기 탓으로 오해하고, 그것은 실제와 다른 안내이기 때문이다.

### 3-5. 네이티브

- **W7 시작 덮개 스피너**: Android `DibaySplashCover`·iOS 시작 덮개의 로고 아래에 같은 12점 링(흰색, 44dp/pt)을 둔다.
  - **450ms 뒤** 나타난다. 덮개를 걷는 조건은 바꾸지 않고 view 만 더한다.
  - 기존 화면 1개 위에 올리는 것이라 「Native Startup 1」 계약을 지킨다.
- **W6 덮개 없는 시작**:
  - **먼저 실측**: OAuth 복귀·설정 변경·렌더러 재생성 각 1회 녹화.
  - 빈 프레임이 나오면 그 경로에도 같은 덮개를 붙인다(통화 시작 경로 제외).
  - 실측 전에는 구현하지 않는다.
- **W8 iOS**: 실측 먼저. 흰 프레임이 나오면 Android 처럼 화면 확정 뒤에 걷는다.
- **시작 오류 안내**:
  - Android 는 `ConnectivityManager`(`NET_CAPABILITY_VALIDATED`), iOS 는 `NWPathMonitor` + 확인 요청으로 기기 상태를 먼저 보고, §3-3 표대로 문구를 고른다.
  - 제목·본문이 서로 반대인 문구(`values-ko/strings.xml:7-8`, iOS `.network`)를 §3-4 문구로 바꾼다.
- **iOS HTTP 상태**: `decidePolicyFor navigationResponse` 에서 문서 5xx → `.web` 안내.
- **웹 연결**: 기기 신호를 `DibayBootBridge` 로 웹에 넘긴다. 구 바이너리는 값이 없으므로 웹은 확인 요청으로 대신한다.

### 3-6. Owner 결정 3 → 결정할 것 없음
Skew Protection 은 이미 켜져 있다(§1-3). 배포 직후 흰 화면이 지금도 있는지는 측정이 필요하다(NOT_PROVEN). 이 설계의 구현·검증과는 별개로 실측 1회 항목으로만 둔다(§5).

---

## 4. 단계·PR

| 단계 | 내용 | 배포 구분 | 비고 |
|---|---|---|---|
| **P1** | §3-1 + §3-2 (통화 제외) + `verify:loading-spinner-ssot` | 웹 → 앱 재시작 | 성능 관련 변경이라 `verify:parity-gates` 1회 |
| **P2** | §3-3 + §3-4 (웹 판정·안내·오류 화면) | 웹 → 앱 재시작 | P1 뒤 |
| **P3** | §3-5 (통화 시작 경로 제외) | 네이티브 → 재빌드·재설치, 빌드 번호 1회 증가 | W6·W8 은 실측 뒤 |
| **P4** | 통화 화면 스피너·빈 화면(W9) | 통화 단독 | 통화 규정 3번: 영향 분석 → Owner 승인 → 구현 → 통화 행렬 실기 |

## 5. 영향·깨질 수 있는 것

- **P1 W1**: 미리받기 된 하위 화면은 지금 빈 칸이다. 바꾸면 450ms 안에 오면 지금과 같고, 넘으면 스피너가 보인다. 허브 탭 전환은 보관 화면·허브 스켈레톤이 먼저라 변화가 없다.
- **P1 PTR**: 당기는 정도에 따른 점 켜짐을 유지한다. PTR 테스트를 다시 돌린다.
- **P2 전역 관찰**: 세 번째 fetch 감싸기다. 요청을 바꾸지 않는 것은 구조 테스트로 확인한다(입력·출력 동일). 세션 관문 순서·동작은 바꾸지 않는다.
- **P2 확인 요청**: 실패 사건 때만 보낸다. 기기 신호가 「인터넷 없음」이 확실하면 보내지 않는다.
- **P3**: 덮개 걷는 조건은 바꾸지 않는다. 흰 프레임 0 실측(0/34·18/18)이 유지되는지 같은 방법으로 다시 측정한다.
- **i18n**: 새 키 ko·en 동시. `check:i18n-quality` 파일별 개수가 늘지 않게 한다.
- **요청 예산**: 운영 Supabase 0건 추가.

## 6. 검증

- **코드**: `typecheck:build`, 변경 vitest, 변경 eslint, `verify:loading-spinner-ssot`, `check:i18n-quality`, `verify:routes`, P1 `verify:parity-gates`.
  - 판정 함수 단위 테스트: TypeError·시간 초과·5xx·취소 × 기기 신호 있음/없음 × 확인 요청 성공/실패.
- **실기** (Production SHA·로그인 계정·기기·PHT 기록, 앱 처음 실행 합계 10회 이하·예상 Supabase = 실행 횟수×195건 기재):
  - P1: Samsung·Xiaomi 에서 W1~W5 화면 녹화 → 빈 본문 프레임 0, 450ms 안 전환은 스피너 0.
  - P2:
    - 비행기 모드 → `net_device_offline`.
    - 와이파이 연결 + 공유기 인터넷 끊기 → Android 는 VALIDATED 없음으로 기기 안내, iOS 는 확인 요청 실패로 기기 안내.
    - `dibay_unreachable`·`dibay_error` 는 운영에서 만들 수 없어 단위 테스트로만 → 실기 NOT_PROVEN.
  - P3: 냉시작 녹화로 덮개 450ms 뒤 스피너 확인·흰 프레임 0 확인, 비행기 모드 냉시작 → 기기 안내.
  - 별도 1회: 배포 직후 첫 이동 녹화 — Skew 켜진 뒤 흰 화면이 있는지.

## 7. 확인 못 한 것 (NOT_PROVEN)

- W1~W5 가 실기기에서 몇 번·몇 ms 보이는지(코드 경로만 확인).
- W6·W8 빈 프레임.
- Skew 켜진 뒤 배포 직후 흰 화면.
- 기기가 끊겼을 때 Android WebView 가 주는 오류 값이 실제로 `ERROR_HOST_LOOKUP` 인지(공식 문서 설명뿐, 실기 로그 미확인) → P3 비행기 모드 냉시작으로 확인.

---

## 8. P1 구현 기록 (Owner 「P1 구현 진행」 2026-11-22)

**만든 것**
- 단일 스피너 `components/ui/DibaySpinner.tsx`(`DibaySpinner`·`DibayPendingSpinner`)
  - 마크업 `lib/ui/dibay-spinner-markup.ts`
  - CSS `.sam-spinner`(`app/samarket-components.css`)
  - 토큰 `--sam-spinner-*`(`app/design-tokens.css`)
  - `Sam.spinner`
- 450ms 단일 값 `lib/ui/loading-timing.ts`. 메신저 방 진입 복사본도 같은 상수를 쓴다.
- 구간 로딩 공용 `components/layout/MainSegmentPendingLoading.tsx`.
  - 하단 탭 허브 첫 화면·통화 화면·거래 카드 연출 중에는 예전처럼 비운다.
  - 하위 화면에만 대기 스피너를 쓴다.
- 필라이프 글쓰기 시트 코드 대기 틀 `components/philife/PhilifeWriteSheetLoadingFrame.tsx`(거래 D1 과 같은 방식).
- 재발 방지 `npm run verify:loading-spinner-ssot`(`ci:static` 포함).

**바꾼 것**
- 12점 링 4종 + 별칭 → 삭제하고 `DibaySpinner` 로 바꿨다. PTR 은 진행도 점 켜짐만 남기고 같은 마크업을 쓴다.
- 테두리 링·`Loader2`·`RefreshCw` 회전·`dibay-overlay` 스피너 클래스 2개 → `DibaySpinner`. 통화 2곳·관리자 1곳은 기준선으로 남겼다.
- 글자만 있던 대기(「불러오는 중…」) → 대기 스피너 / 버튼 안 스피너.
  - 남긴 것: 문자열 자리(시트 제목·스켈레톤·aria 라벨), 스피너 옆 상태 글자 2곳, 관리자.
- W1~W5 → 대기 스피너.
  - W1: null `loading.tsx` 6개 + 내정보 하위.
  - W2: `mypage/layout.tsx`.
  - W3: 매장 모집 덮개.
  - W4: 지연 로드 4곳.
  - W5: 매장 홈 아래 피드.

**기존 계약과의 충돌 (허위 보고 금지 7번 — 보고)**
- `verify-bottom-tab-cache-first`·`verify-trade-primary-tab-transition-contract` 는 「하단 탭 구간 loading 은 `return null`」 을 요구했다.
- 필라이프 소유 계약 테스트는 「`philife/loading.tsx` 는 중립」 을 요구했다.
- 처리:
  - 계약의 목적(하단 탭 허브 전환에 스켈레톤을 덮지 않음)은 그대로 지킨다. 허브 첫 화면은 여전히 아무것도 그리지 않는다.
  - 하위 화면만 스피너를 그리도록 검사 문구를 「허브 첫 화면은 null」 로 바꿨다.
  - 필라이프는 「스켈레톤 소유자 하나」 규칙을 유지한다. 대기 스피너는 스켈레톤으로 세지 않는다.
  - 자체 스켈레톤이 있는 하위 화면은 서버 응답이 450ms 를 넘을 때만 「스피너 → 그 화면 스켈레톤」 순서로 보인다(빈 칸 없음, 동시 표시 없음).

**범위 밖 (보고만)**
- `verify:bottom-tab-cache-first` 는 이 변경 전부터 `mypage/page.tsx must not blocking-await RSC shell` 로 실패한다(main `bcd25e26f` 에서 같은 결과).
- `DeliveryRecruitingRouteGuard` 는 네트워크 실패를 권한 없음으로 처리한다(§2-3).

## 9. P2 구현 기록 (Owner 「P2 구현 진행」 2026-11-22)

**만든 것**
- 실패 분류 `lib/net/classify-request-failure.ts`(순수 함수).
- 판정 저장소 + 전역 fetch 관찰 `lib/net/network-health.client.ts`.
  - `AppBootProvider` 모듈 로드 때 맨 바깥에 설치한다. 요청·응답은 바꾸지 않고 같은 promise 를 돌려준다.
  - 대상은 `/api/**`·Supabase REST 이고, 통화·RSC·미리받기는 제외한다.
- 확인 주소 2개를 2026-11-22 HTTPS 로 직접 조회했다.
  - `https://www.gstatic.com/generate_204` → 204. CORS 머리 없음 → `no-cors`.
  - `https://captive.apple.com/hotspot-detect.html` → 200. `Cache-Control: max-age=31536000` → `cache: "no-store"` 필수.
  - 앱에 CSP 가 없어(grep 0) 막히지 않는다.
- 안내 띠 `WebConnectivityBanner` 를 3상태로 확장했다. 오류 화면 4개와 대기 스피너에는 `NetworkDeviceHint` 한 줄을 붙였다.
- 문구 키 4개를 ko·en 으로 추가했다: `net_device_offline`·`net_device_unstable`·`net_dibay_unreachable`·`net_dibay_error`. 쓰는 곳 0인 `support_offline_hint` 는 지웠다.
- 화면 안 `catch` 10곳: 공통 문구 대신 그 오류로 고른 키를 쓴다(`networkFailureMessageKey(e)`).
  - 5xx·깨진 응답 → DIBAY 오류.
  - 기기 끊김 → 휴대폰 문구.
  - 아직 판정 전 → 기존 공통 문구.

**설계와 달라진 점 (보고)**
1. 확인 요청이 **응답 없이 실패**하면 `device_unstable` 이 아니라 `device_offline` 으로 판정한다.
   - 이유: 와이파이는 붙었는데 인터넷이 안 되는 경우(§2-3 지목 상황)는 「연결되어 있지 않음」이 사실이다.
   - `device_unstable` 은 확인 요청도 8초를 넘길 때만 쓴다.
2. 대기 스피너에 「다시 시도」 버튼은 넣지 않았다.
   - 이유: 화면 이동은 이미 S2(8초 상한 → Next 문서 이동)가 회복한다. 같은 8초에 버튼을 두면 회복과 겹친다.
   - 안내 한 줄만 둔다.
3. 통화 화면의 띠는 예전 그대로다(기기 `offline` 일 때 예전 문구 `app_connectivity_offline`). 통화 변경 규정 때문에 그 키는 지우지 않았다.
4. 네이티브 OS 검증값(Android `NET_CAPABILITY_VALIDATED`·iOS `NWPathMonitor`)은 P3 다. 지금은 `navigator.onLine` + 확인 요청만 쓴다.
5. `lib` 의 코드 문자열 대응 3곳(`owner-api-error-i18n`·`support-display-labels`·`resolve-notif-inbox-error-message`)은 오류 값을 받지 않아 바꾸지 않았다.

## 10. P3 구현 기록 (Owner 「P3 구현 진행」 2026-11-22)

**만든 것**
- **W7 시작 덮개 스피너**: Android `DibayDotSpinnerView`(새 파일) · iOS `CAReplicatorLayer`.
  - 웹 `.sam-spinner` 와 같은 12점 링이다(점 0.145 · 반지름 0.38 · 1.15s · 밝기 0.25→1→0.4). 흰색 44dp/pt.
  - 로고 아래에 둔다: Android 는 가운데에서 114dp 아래(로고 보이는 부분 127dp 실측 기준), iOS 는 102pt 아래(로고 106×104pt 기준).
  - **450ms 뒤에만** 보인다. 덮개를 걷는 조건·시각은 바꾸지 않았다.
- **시작 오류 안내 — 휴대폰 문제 vs DIBAY 문제**
  - Android `DibayConnectivity`(새 파일):
    - OS 검증값 `NET_CAPABILITY_VALIDATED` 가 없으면 → 「인터넷에 연결되어 있지 않습니다」. 요청 0건.
    - 검증값이 있으면 → `gstatic.com/generate_204` 확인 요청 1건(8초).
      - 성공 → 「DIBAY 에 연결할 수 없습니다」
      - 시간 초과 → 「인터넷 연결이 불안정합니다」
      - 응답 없이 실패 → 「인터넷에 연결되어 있지 않습니다」
  - iOS: `NWPathMonitor` 가 경로 없음이면 기기 끊김으로 본다. 그 밖에는 `captive.apple.com` 확인 요청 1건(8초, ephemeral·쿠키 없음)으로 같은 3가지를 가른다.
  - 판정하는 동안에는 덮개(스피너)가 그대로 있고, 판정 뒤 안내를 띄운다.
- **iOS HTTP 5xx**: `navigationResponse` 로 문서 상태만 본다.
  - 결정은 바꾸지 않는다: Capacitor 가 구현하지 않아 허용이 기본이다(`WebViewDelegationHandler.swift` 확인).
  - 시작 중이고 통화 경로가 아니며 5xx 이면 「앱 화면을 불러오지 못했습니다」.
- **웹 연결**:
  - Android `DibayBootBridge.internetValidated()` 는 "1"·"0"·"" 를 준다.
  - iOS `window.__dibayNativeInternet` 은 "0"·"" 를 준다.
  - 웹 `readNativeInternetSignal` 이 판정 때 읽는다. 구 바이너리는 값이 없으므로 P2 확인 요청으로 대신한다.
- `AndroidManifest.xml` 에 `ACCESS_NETWORK_STATE` 를 명시했다. 병합 매니페스트에는 Firebase 가 이미 넣고 있었고(빌드 산출물 확인), 일반 권한이라 허락 창이 없다.

**통화 경계 (통화 변경 규정)**
- 통화 실행(`isCallLaunch`)·통화 경로 문서의 시작 오류는 **예전 판정·문구·시점 그대로**다. 예전 문자열 키는 그대로 두고, 새 문구는 새 키로 만들었다.
- 덮개 스피너는 덮개가 붙는 실행에만 쓰인다. 통화 실행에는 덮개가 없으므로 영향이 없다.
- iOS 5xx 판정은 통화 경로를 제외한다.

**하지 않은 것 (설계대로 실측 먼저)**
- W6(덮개 없는 시작: OAuth 복귀·설정 변경·렌더러 재생성)·W8(iOS 흰 프레임): 실측 전에는 구현하지 않는다. 이번에도 실측하지 않았다 → NOT_PROVEN.
- 빌드 번호: 설치·배포용 빌드를 만들지 않았으므로 올리지 않았다. 설치 빌드 때 `native:prepare` 가 Android 80→81 · iOS 58→59 증가를 요구한다.

## 변경 이력

- 2026-11-22 v1 작성.
- 2026-11-22 v2 — Owner 2차 지시. 1차 틀린 9건 정정(§1). 근거 없는 숫자·임시 처리 제거(기존 450ms·8초만 사용, 실패별 판정). Owner 결정 3건에 추천안 적용(스켈레톤 유지 · DIBAY 문제도 안내 + OS 확인 주소 · Skew 는 이미 켜짐). 운영 조회 2건(Vercel 프로젝트 설정 · `delivery_launch_settings.mode`, 모두 읽기 전용).
- 2026-11-22 §8 P1 구현 기록.
- 2026-11-22 §9 P2 구현 기록.
- 2026-11-22 §10 P3 구현 기록.
