# DIBAY Windows 데스크톱 셸 (WebView2 + MSIX) 설계서 (2026-11-07 PHT)

- 상태: **설계만. 구현 0건.** 각 단계(W0~W5)는 Owner 승인을 따로 받는다.
- 위치: `docs/audit/windows-msstore-launch-audit-2026-11-07.md` §5 순서 3번 「Windows 셸 설계서」.
- 근거: 코드 사실은 모두 `origin/main` `a530b38dd` 에서 직접 확인했다(파일:줄). 외부 사실은 공식 문서로 확인했다(§9). 확인하지 못한 것은 NOT_PROVEN 으로 적었다.

## 0. 결론

- Windows 앱은 **Android·iOS 의 Capacitor 셸과 같은 역할의 얇은 셸**이다. 운영 웹(`samarket.vercel.app`, 나중에 회사 도메인)을 WebView2 로 띄운다. 웹 코드는 복제하지 않는다.
- 셸이 직접 해야 하는 일은 세 가지뿐이다.
  1. 로그인을 시스템 브라우저로 넘긴다.
  2. 알림 채널(WNS)을 받아 웹에 넘긴다.
  3. 창·작업표시줄 같은 OS 동작을 맡는다.
- 첫 Store 제출부터 이 셸(MSIX)로 낸다. PWA 로 먼저 낸 뒤 셸로 바꾸면 같은 상품의 업데이트가 되는지 공식 문서로 확인하지 못했다(NOT_PROVEN, §9-3).
- **잠금 충돌 (Owner 결정 필요):**
  - 통화: `docs/dibay-chat-call-current-normal-hard-lock.md:180-183` 는 「Windows Call」 수정을 금지한다. 그래서 W4(통화)는 Owner 가 단계를 열어야 설계·구현할 수 있다.
  - 알림·인증: 알림 단계(W3)는 알림 SSOT 잠금(`docs/dibay-global-notification-ssot-hard-lock.md`)을 적용받는다. 인증 단계(W2)는 `docs/auth-hard-lock.md` 를 적용받는다.

## 1. 현재 상태 (코드 사실)

| 영역 | 사실 | 근거 |
|---|---|---|
| 셸 판정 | 앱 플랫폼 값은 `android`·`ios` 두 개뿐 | `lib/platform/capacitor-native.ts:23,35` |
| 셸 판정 | 판정 순서: Capacitor → 브리지(`androidBridge`·`webkit.messageHandlers.bridge`) → UA → `dibay_app` 표시(주소 쿼리 → sessionStorage → 쿠키) | `capacitor-native.ts:118-136`, `:53-108` |
| 기기 분류 | Windows 브라우저와 앞으로의 WebView2 셸이 둘 다 `DESKTOP_WINDOWS` (UA 정규식) — 구분 불가 | `lib/device/dibay-device-class.ts:139-140,264-275` |
| 화면 | DESKTOP 은 왼쪽 세로 레일(`DESKTOP_SIDE_RAIL`) — 이미 운영 반영 | `lib/device/dibay-shell-resolver.ts:56-69` |
| 푸시 DB | `user_devices.platform` CHECK `android·ios·web`, `push_provider` CHECK `fcm·apns·voip_apns·web_push` | `supabase/migrations/20260915100000_user_devices_notification_deliveries.sql:6,9` |
| 푸시 등록 | RPC `register_user_device` 가 같은 목록으로 막는다 | `20270607110000_register_user_device_ios_stale_apns.sql:58-66` |
| 푸시 등록 | `/api/me/devices/register` 는 모르는 값을 **조용히** `web`/`fcm` 으로 바꾼다 | `app/api/me/devices/register/route.ts:25-26,64-75` |
| 푸시 발송 | `push_provider` 별 분기, 모르는 값은 건너뜀(`unknown_provider`) | `lib/push/dispatch/dispatch-push-for-user.ts:58-69` |
| 웹 푸시 | 운영 Web Push 꺼짐(VAPID 키 없음) | `/api/me/push/vapid-key` → `{"publicKey":null,"web_push_enabled":false}` |
| WNS | 코드 0건 (`wns`·`WebView2`·`msix` 검색 결과 없음) | grep |
| 통화 알림 | 휴대폰이 하나라도 있으면 웹 푸시 통화 알림을 끈다(`native_call_preferred`) | `lib/push/dispatch/push-payload-types.ts:255-257` |
| 통화 화면 | Windows·브라우저는 웹 어댑터(떠 있는 창, OS PiP 없음) | `lib/community-messenger/call-v4/presentation/web/call-v4-presentation-web.adapter.ts:19-22` |
| 로그인 | 셸 로그인 = `NativeOAuthLauncher`(Custom Tab·ASWebAuthenticationSession) → `/auth/oauth/capacitor-return` → `dibay://auth/callback` → `appUrlOpen` → `/api/auth/native/exchange` | `lib/auth/oauth/open-native-oauth-tab.ts:14,58`, `native-oauth-redirect.ts:2,10`, `components/auth/OAuthReturnListener.tsx:69` |
| 로그인 | 셸 판정이 null 이면 브라우저용 웹 OAuth 로 간다. WebView2 안에서 Google 은 정책상 막힌다 | `oauth-native-routing.ts:134-138`, `docs/native-oauth-device-qa.md:145` |
| 업데이트 화면 | `AppReleasePlatform = android·ios`, DB CHECK 같음, Play 링크 하드코딩 | `lib/app-releases/app-release-version.ts:6`, `20271101060000_app_releases.sql:6`, `AppUpdateHistoryClient.tsx:14` |
| 빌드 절차 | 네이티브 구분·버전 증가·설치 확인(`user_devices.app_version`)이 Android·iOS 만 | `docs/native-build-release-process.md` §1·§2·§5 |

## 2. 구조

```
windows/                         ← 새 최상위 폴더 (android/·ios/ 와 같은 층)
  DibayDesktop/                  ← .NET 8 + WinUI 3 (Windows App SDK) + WebView2
    MainWindow                   ← WebView2 1개, 운영 주소 로드
    Bridge                       ← 웹 ↔ 셸 메시지 (WebView2 postMessage)
    Auth                         ← 시스템 브라우저 열기 + dibay:// 프로토콜 받기
    Push                         ← PushNotificationManager → 채널 URI → 웹에 전달
  Package.appxmanifest           ← MSIX (프로토콜 dibay, 시작 작업 등)
```

- **기술 선택:** .NET 8 + WinUI 3 + Windows App SDK 로 한다. WNS 수신 API(`PushNotificationManager`)를 Microsoft 가 데스크톱 앱용으로 안내하는 SDK 이기 때문이다(§9-1).
- **빌드 장소:** Windows 빌드는 Mac 에서 할 수 없다. 노트북(Windows)에 Visual Studio 를 설치해서 빌드한다. 설치 항목은 W0 승인 때 목록으로 따로 받는다.
- **웹과의 약속(브리지):** 셸 → 웹은 `dibay_app=windows` 표시와 `window.chrome.webview` 존재로 알린다. 웹 → 셸은 메시지 3종만 쓴다: `auth.open`, `push.register`, `app.info`. 이외 기능은 만들지 않는다.

## 3. 단계 (각 단계 = 별도 승인 · 별도 커밋 · 별도 main 반영)

### W0 — 셸 뼈대 + 웹의 Windows 판정 (통화·알림·인증 동작 변경 0)
- **셸:** WebView2 창 1개가 운영 주소를 연다. 창 크기·위치를 기억한다. 외부 링크는 기본 브라우저로 연다. 크롬(테두리)은 OS 기본 그대로다.
- **웹 (구현 때 정정 — 2026-11-08):** 처음 설계는 `DibayAppPlatform` 에 `windows` 를 넣는 것이었다. 그런데 그 값이 non-null 이면 「네이티브 셸」로 가는 호출처(로그인·푸시·통화·권한)가 바뀐다. 그래서 다음처럼 바꿨다.
  - 기존 Android·iOS 판정은 **건드리지 않는다.**
  - 별도 함수(`lib/platform/dibay-windows-shell.ts`, `window.chrome.webview` 존재)로만 알아본다.
  - `dibay_app=windows` 표시는 쓰지 않는다.
  - W0 에서 쓰는 곳은 화면 속성 `data-dibay-host-shell="windows"` 하나뿐이다.
  - 기기 분류(`DESKTOP_WINDOWS`)와 화면(레일)은 바꾸지 않는다.
- **영향받는 곳:** `resolveCapacitorShellPlatform()` 을 쓰는 모든 분기. 지금은 android·ios 가 아니면 「웹」으로 처리된다.
  - 권한 어댑터
  - 통화 화면 어댑터
  - 로그인 라우팅
  - 푸시 등록
  - 업데이트 화면

  W0 에서는 `windows` 를 **모든 분기에서 웹과 똑같이** 처리하게 한다. 동작 변화 0 을 테스트로 고정한다.
- **깨질 수 있는 것:** `normalizeDibayAppPlatform` 이 `windows` 를 받게 되면, 지금 android/ios 전용인 함수가 windows 로 잘못 들어갈 수 있다. W0 의 테스트가 호출처 전부를 대조한다.
- **확인:** 노트북 설치 → 로그인(카카오·Apple) → 거래·메신저·배달 화면.
  - Google 로그인은 W2 전까지 **실패가 예상된다**. W0 에서는 Google 버튼을 숨기지 않고 「브라우저에서 로그인」 안내만 띄운다. 문구는 W0 승인 때 확정한다.

### W1 — 빌드·배포 절차에 Windows 추가
- `docs/native-build-release-process.md` 에 Windows 줄을 추가한다.
  - `windows/**` 변경 = 네이티브(Windows)
  - 버전은 `Package.appxmanifest` 의 `Version`
  - 증가 규칙은 Android·iOS 와 같다(설치·배포용 빌드 때 1회)
- `verify:native-version-bump` 가 `windows/**` 를 네이티브로 판정하게 한다.
- 설치 확인은 `user_devices.app_version` 으로 한다. W3 이후에야 windows 행이 생긴다. 그 전에는 셸이 `app.info` 로 보낸 버전을 화면에서 확인한다.

### W2 — 로그인 (인증 잠금 적용)
- **방식:** Android·iOS 와 같은 경로를 쓴다. 셸만 다르다.
  1. 웹이 `auth.open(url)` 을 보낸다.
  2. 셸이 **기본 브라우저**를 연다.
  3. 기존 `/auth/oauth/capacitor-return` 이 `dibay://auth/callback?...` 으로 보낸다.
  4. MSIX 프로토콜 선언으로 셸이 다시 켜진다(이미 켜져 있으면 같은 창).
  5. 셸이 그 주소를 웹에 넘긴다.
  6. 웹은 기존 `/api/auth/native/exchange` 로 세션을 만든다.
- **라우팅 표:** `oauth-native-routing.ts` 에 windows 줄을 추가한다. Google·Kakao·Apple 셋 다 「시스템 브라우저 웹 OAuth」다.
- **영향 확인:**
  - `OAuthReturnListener`(`appUrlOpen`) 대신 브리지 메시지를 받는 경로를 추가한다. 기존 Capacitor 경로는 그대로 둔다.
  - Supabase 리다이렉트 허용 목록은 이미 `capacitor-return` 이 있다. 바꿀 것이 없는지 W2 에서 운영 설정을 읽기 전용으로 대조한다. 바꿔야 하면 Supabase 설정 변경이므로 별도 승인을 받는다.
- **위험:** 기본 브라우저가 이미 다른 계정으로 로그인돼 있으면 그 계정으로 들어갈 수 있다. 이 동작은 Android Custom Tab 과 같다.

### W3 — 알림 (WNS · 알림 잠금 적용 · DB 변경 포함)
- **DB (운영 적용은 별도 승인):**
  - `user_devices.platform` CHECK 에 `windows` 를 추가한다.
  - `push_provider` CHECK 에 `wns` 를 추가한다.
  - `register_user_device` RPC 검증에도 같은 값을 추가한다.
  - 목록을 **넓히기만** 하므로 기존 행·기존 앱 영향은 0 이다.
- **서버:**
  - `/api/me/devices/register` 의 조용한 대체(모르는 값 → web/fcm)를 이번에 함께 고친다. `windows`/`wns` 가 `web`/`fcm` 으로 잘못 저장되는 것을 막는다.
  - `PushProvider`·`PushPlatform` 형식에 `wns` 를 추가한다.
  - 발송 분기에 `wns` 발송기를 추가한다. Entra 앱 토큰으로 WNS 채널 URI 에 토스트를 보낸다.
  - 무효 채널 처리(410·404 → 비활성화)를 추가한다.
- **셸:**
  - `PushNotificationManager` 로 채널 URI 를 받아 웹에 `push.register` 로 넘긴다.
  - 웹은 기존 등록 API 로 저장한다.
  - 토스트를 누르면 해당 화면을 연다. 주소 규칙은 기존 `PushRouteListener` 를 재사용한다.
- **선행 조건 (Owner):**
  - Azure 계정과 Entra 앱 등록
  - 패키지 이름 ↔ Azure 앱 연결 신청(이메일, 주 1회 처리, §9-1)
  - 패키지 이름은 Partner Center 이름 예약 뒤에 나온다. 그래서 **W3 은 Store 계정(순서 4번) 이후**에만 가능하다.
- **웹 푸시 버튼(U-6):** 셸 안에서는 「브라우저 알림」 줄을 숨긴다(§5).

### W4 — 통화 (통화 변경 규정 · 동결 해제 필요)
- **현재 동결 대상**이다(`dibay-chat-call-current-normal-hard-lock.md:180-183`). Owner 가 단계를 열기 전에는 설계도 하지 않는다.
- **W0~W3 동안의 통화 동작:** 지금 Windows 브라우저와 같다.
  - 앱 창이 열려 있으면 실시간 신호로 웹 화면에서 울린다.
  - 창이 닫혀 있으면 울리지 않는다.
  - 휴대폰이 있으면 휴대폰이 울린다(`native_call_preferred`).
  - 이 동작은 바뀌지 않는다.
- **W4 를 열 때 써야 할 것:**
  - 통화 규정 3번 형식: 바뀌는 파일·동작·경로, 설치된 구 바이너리 호환, 회귀 위험, 롤백, 실기 행렬
  - WNS 통화 토스트
  - 마이크·카메라 권한(WebView2 권한 요청 처리)
  - 휴대폰과 동시에 울릴지

### W5 — 업데이트 화면·스토어 링크 (U-5)
- **형식·DB:** `AppReleasePlatform`·`app_releases` CHECK 에 `windows` 를 추가한다(DB 별도 승인).
- **Store 링크:** Microsoft Store 링크 상수 1곳을 둔다. Store 식별자는 이름 예약 뒤에 나온다.
- **화면:** 업데이트 화면이 셸을 「웹 전용」으로 처리하지 않게 한다. Store 업데이트는 Store 가 맡는다. 화면은 버전과 「Microsoft Store 에서 업데이트」 링크만 보여 준다.

## 4. 구 바이너리·다른 앱 영향

- **Android·iOS 설치본:**
  - W0~W5 는 웹 판정에 `windows` 값을 **추가**만 한다. 기존 android/ios 경로는 바뀌지 않는다.
  - DB CHECK 는 넓히기만 한다.
  - 테스트로 「android/ios 분기 결과 변화 0」을 고정한다.
- **웹 브라우저(Windows Edge·Chrome):** 셸 표시가 없으므로 지금과 같다.
- **셸 구버전:** 브리지 메시지에 버전 필드를 넣는다. 웹은 모르는 버전이면 W0 동작(웹과 동일)으로 내려간다.

## 5. U-6 — 알림 버튼 정리 (웹, 셸과 독립)

- **현재:** 운영 Web Push 가 꺼져 있다. 그런데 설정의 「브라우저 알림」 줄은 보이고 버튼만 비활성이다. 안내 문구는 「지금은 사용할 수 없음」이다(`WebPushSettingsRow.tsx:154,166-168,188`).
- **설계:**
  - Web Push 가 꺼져 있으면(`web_push_enabled:false`) 그 줄을 숨긴다.
  - 셸(windows) 안에서는 항상 숨긴다. 셸 알림은 W3 의 WNS 가 맡는다.
- **영향:** 설정 화면 1곳뿐이다. 휴대폰 앱은 이 줄을 이미 쓰지 않는지 W0 승인 때 호출처를 대조한다.
- **승인 시점:** 셸과 상관없이 따로 승인·반영할 수 있다.

## 6. U-5 — 「Windows 앱 받기」 링크

- Store 식별자가 생긴 뒤(순서 4번)에 W5 와 함께 한다.
- 지금 할 일은 없다.

## 7. 롤백

| 단계 | 롤백 방법 |
|---|---|
| W0·W2·W5 웹 | 해당 커밋을 되돌린다 (웹만) |
| W3 DB | CHECK 를 넓힌 것은 그대로 둬도 무해하다. 발송기는 `wns` 분기만 끈다 |
| 셸 | Store 에서 이전 패키지로 되돌린다(Partner Center 제출) |
| 통화 | W4 규정의 롤백 항목을 따른다 |

## 8. 실기 확인 행렬 (노트북 · Owner 계정 · Production SHA 기록)

| 단계 | 항목 |
|---|---|
| W0 | 설치·첫 실행·창 크기 기억·외부 링크·레일·메신저 3단·거래·배달·로그아웃 |
| W2 | Google·Kakao·Apple 로그인 (브라우저 미로그인 / 다른 계정 로그인 상태 각각), 앱이 꺼진 상태에서 로그인 복귀 |
| W3 | 채팅·거래·주문 알림 토스트 수신(창 열림 / 최소화 / 닫힘), 토스트 → 해당 화면, 앱 삭제 후 채널 비활성 |
| W4 | 통화 규정 5번 행렬 (Windows 포함) |
| 공통 | Android·iOS 회귀 — 하단 탭·로그인·알림·통화 1회씩 |

## 9. 외부 근거 (공식 문서)

1. **WNS 수신:** 데스크톱 앱은 Windows App SDK `PushNotificationManager` 를 쓴다. 조건은 다음과 같다.
   - 패키지 신원(MSIX)이 필요하다.
   - Azure 계정과 Entra 앱 등록이 필요하다.
   - 패키지 이름 ↔ Azure 앱 연결은 이메일로 신청하며, 주 1회 처리된다.
   - 근거: [푸시 알림 빠른 시작](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/push-quickstart), [WNS 개요](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview)
2. **Google 로그인:** 앱 안에 넣은 웹 화면(임베디드 user-agent)으로 OAuth 를 열면 안 된다. 데스크톱 앱은 시스템 브라우저를 쓴다. 근거: [OAuth 2.0 정책](https://developers.google.com/identity/protocols/oauth2/policies), [데스크톱 앱 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
3. **상품 신원:**
   - 패키지 이름·게시자는 업데이트할 때 같아야 한다.
   - 예약 이름에서 나온 신원은 바꿀 수 없다.
   - PWA 제출에서 MSIX 셸로 같은 상품을 잇는 공식 근거는 찾지 못했다(NOT_PROVEN).
   - 근거: [MSIX 패키지 업데이트](https://learn.microsoft.com/en-us/windows/msix/app-package-updates), [패키징 개요](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/packaging/)

## 10. Owner 결정 필요 (설계로 정할 수 없는 것)

1. W4(통화) 동결 해제 여부와 시점.
2. Azure 계정·Entra 앱 등록 (W3 선행). 회사 계정으로 만들지 여부는 Store 계정과 맞춘다.
3. 노트북에 Visual Studio(빌드 도구) 설치 승인 (W0 선행).

## 11. W0 구현 기록 (2026-11-08, Owner 「W0 진행」)

- **웹:**
  - `lib/platform/dibay-windows-shell.ts` — 판정, `app.info` 브리지 v1
  - `ConditionalAppShell` 화면 속성 1개
  - `vercel-ignored-build-step` 에 `windows/` 추가
  - 계약 테스트 10건
- **셸:** `windows/DibayDesktop` — WinUI 3 + WebView2, 단일 프로젝트 MSIX
  - 시험 신원 `DibayDesktop.Dev` / 「DIBAY (dev)」
  - 창 위치·크기 기억
  - 앱 밖 주소 → 기본 브라우저
  - 앱 주소에서 온 `app.info` 에만 답함
  - 빌드 방법: `windows/README.md`
- **검증:**
  - 웹 코드 PASS (테스트·타입검사·린트)
  - **셸 빌드·실행은 Mac 에서 불가 — NOT_PROVEN.** 노트북에 Visual Studio 를 설치한 뒤 `windows/README.md` 확인 항목으로 확인한다.
