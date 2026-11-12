# 다크 모드 미적용 — APK·iOS·Windows 전 플랫폼 설계안 (2026-11-12)

## 0. 지시·근거

- Owner 2026-11-12: 「디바이는 다크 모드가 없는 부분이다, apk ios 윈도우 모두 다크 모드가 적용 안되는 부분으로 변경되는 설계안을 보고 해라」
- 기존 계약: `lib/stores/__tests__/delivery-visual-token-w3-contract.test.ts` 「DIBAY 는 다크 모드 없음」 (Owner 2026-11-02 「다크 모드는 없는 기능」).
- 목표 상태: 기기(Android·iOS·Windows) 시스템 테마가 다크여도 DIBAY 웹 화면·네이티브 화면·시스템 바가 **라이트 그대로**.

## 1. 원인 (코드·공식 문서로 확인)

기기 다크 → 앱이 다크로 바뀌는 경로는 **두 층**이다.

### 1-1. 웹 층 — 다크 신호를 받아 색을 바꾸는 코드 (모든 플랫폼 공통)

| # | 위치 | 내용 |
|---|---|---|
| W1 | `app/design-tokens.css:493-591` | `@media (prefers-color-scheme: dark)` — `:root` 앱 전체 토큰(배경·글자·브랜드 그린 `#0B421A`→`#4FBA6E`), 메신저 배지, 메신저 방 말풍선, `[data-admin]` |
| W2 | `app/messenger-presentation.css:398-411` | 메신저 배경 무늬·선택 행 다크 |
| W3 | `app/store-order-list-tokens.css:109-130` | 배달 허브 주문 목록 `--sol-*` 다크 |
| W4 | `lib/startup/local-runtime-markup.ts:72-74` · `:220` | 앱 시작 화면 다크 블록 + `<meta name="color-scheme" content="light dark">` (생성물 3곳: `capacitor-www/local-runtime/`·`android/.../assets/local-runtime/`·`ios/.../public/local-runtime/` `index.html`) |
| W5 | `capacitor-www/index.html:6` · `:21-23` · `:51-65` | 시작 HTML — meta `light dark`, 다크 블록, `applyTheme()` 가 `"system"` 이면 `matchMedia(dark)` 로 다크 적용 |
| W6 | `lib/business/owner-order-chat-ensure-document.ts:53-54` | 주문 채팅 실패 문서 — `color-scheme:light dark` + 다크 블록 |
| W7 | Tailwind v4 `dark:` 변형 (기본 = `prefers-color-scheme`) 10개 파일 | `app/(main)/my/store-orders/loading.tsx` · `components/admin/notifications/AdminNotificationCampaignDetailPage.tsx` · `components/stores/browse/StoresBrowsePrimaryView.tsx` · `components/stores/detail/StoreDetailSlideShell.tsx` · `components/product/detail/product-detail-bottom-constants.ts` · `components/mypage/home/MypageRequiredInfoSummary.tsx` · `components/mypage/myinfo/MyInfoHomeCategoryHub.tsx` · `components/delivery/presentation/DeliveryPresentationShell.tsx` · `components/community-messenger/room/message/MessageReactionBar.tsx` · **통화 영역** `components/community-messenger/room/message/CallStubActionPopover.tsx` · `lib/community-messenger/call-ui/incoming-call-banner-tokens.ts` |
| W8 | `app/layout.tsx:82-85` | `themeColor` 를 light/dark 미디어별로 선언(두 값 같음 — 동작 영향 없음, 다크 분기 표기만) |
| W9 | `lib/startup/startup-cache.ts:14` · `components/layout/ConditionalAppShell.tsx:145` | 시작 테마 캐시 `"system"` 저장 → W5 가 시스템 다크를 따름 |
| W10 | `*.module.css` 의 `:global(html.dark)` 3곳 | `html.dark` 를 붙이는 코드 없음 → **현재 효과 없음** (죽은 다크 규칙) |

이미 맞는 것: `app/globals.css:142` `html { color-scheme: light }`, `components/messenger/call/call-in-app-notice-center.css:8` — 브라우저 기본 부품(스크롤바·입력창)만 라이트로 고정하고, 위 미디어 쿼리는 막지 못한다.

### 1-2. 네이티브 층 — 웹에 「다크」 신호를 보내고, 네이티브 화면 자체도 다크로 그림

| 플랫폼 | 현재 | 공식 규칙 (원문 확인) |
|---|---|---|
| Android (targetSdk 36) | `MainActivity` 최종 테마 `AppTheme.NoActionBar` = `Theme.AppCompat.DayNight.NoActionBar` (`styles.xml:12`, Splash `postSplashScreenTheme`). 통화 화면 `AppTheme.IncomingCall`·`ForegroundIncomingCall` 도 DayNight (`styles.xml:38,44`) | developer.android.com 「Darken web content in WebView」: *WebView always sets prefers-color-scheme according to isLightTheme.* DayNight 는 기기 다크일 때 `isLightTheme=false` → WebView 가 웹에 다크 신호. 알고리즘 다크(자동 반전)는 `setAlgorithmicDarkeningAllowed` 를 안 쓰므로 현재 꺼져 있음(코드 검색 0건) |
| iOS | `Info.plist` 에 `UIUserInterfaceStyle` 없음 = Automatic. `UIViewControllerBasedStatusBarAppearance=true` | Apple 문서: Automatic = *adopt the systemwide user interface style* (기본값). Light = *force the light user interface style, even when the systemwide style is set to dark.* WKWebView 의 `prefers-color-scheme` 와 키보드·알림창·상태 바 글자색이 이 값을 따른다 |
| Windows (WinUI 3 + WebView2, App SDK 1.6) | `MainWindow.xaml.cs:41` 초기화에 색 설정 없음, `App.xaml` 에 `RequestedTheme` 없음 | learn.microsoft.com `CoreWebView2Profile.PreferredColorScheme`: *sets the color scheme for WebView2 UI like dialogs, prompts, and menus by setting the media feature prefers-color-scheme. The default value … Auto, which will follow whatever color scheme the OS is currently set to.* |

## 2. 설계 — 2단계

웹 층(1단계)만 고쳐도 **설치된 모든 앱(구 바이너리 포함)·PC 브라우저에서 화면 색은 라이트로 고정**된다 (다크 신호가 와도 바꿀 규칙이 없음). 네이티브 층(2단계)은 시스템 바 글자색·키보드·네이티브 대화상자·네이티브 버튼까지 라이트로 맞추고, 다크 신호 자체를 끊는다.

### 단계 1 — 웹 (main 병합 = 운영 배포, 앱 재시작만, 빌드 없음)

| 항목 | 변경 | 영향 화면·호출처 | 깨질 수 있는 것 → 같은 단계 처리 |
|---|---|---|---|
| W1 | `design-tokens.css` 다크 블록 전체(493-591) 삭제 | 앱 전체·어드민 | 라이트 값은 블록 밖에 그대로 → 변화는 다크 기기에서만 라이트로 |
| W2 | `messenger-presentation.css` 다크 블록(398-411) 삭제. 블록 안 `[data-messenger-detail-empty-pill]{display:none}` 은 블록 밖(394-396)에 이미 있음 | 메신저 목록·방 배경 | 없음 |
| W3 | `store-order-list-tokens.css` 다크 블록(109-130) 삭제 + 머리 주석(7-8행) 「다크 값…」 문장 삭제 | 배달 허브 주문 목록 | 테스트 2건 수정 (아래 T1·T2) |
| W4 | `local-runtime-markup.ts` 다크 블록 삭제, meta `color-scheme` → `light` | 앱 시작 화면 | 생성물 3곳은 `scripts/build-local-runtime.mjs` 로 재생성. **현재 생성물 3곳에 다른 작업의 미커밋 변경(제목 「홈」·탭 순서·safe 변수)이 있음** → 내 변경과 섞지 않도록 그 변경의 주인 확인 후 재생성(확인 전에는 생성물을 건드리지 않음) |
| W5 | `capacitor-www/index.html` meta → `light`, 다크 블록 삭제, `applyTheme()` 를 항상 라이트로 | Capacitor 기본 문서(번들). 현재 `server.url` 원격 로드 경로에서 이 문서가 화면에 나오는지는 **확인 못 함** | 파일은 네이티브 sync 대상 → 반영은 다음 앱 빌드. 웹 배포에는 영향 없음 |
| W6 | `owner-order-chat-ensure-document.ts` `color-scheme:light`, 다크 블록 삭제 | 매장 주문 채팅 열기 실패 화면 | 테스트 T3 수정 |
| W7 | `dark:` 클래스 삭제(통화 2파일 제외 8파일) | 위 목록 화면 | 라이트 클래스는 그대로 → 라이트 화면 무변화 |
| W7-통화 | `CallStubActionPopover.tsx`·`incoming-call-banner-tokens.ts` 의 `dark:` | 통화 기록 팝오버·수신 배너 | **통화 변경 규정 + 2026-11-12 「통화 지금 손대지 않음」 → 이 단계에서 수정하지 않음.** 대신 아래 W11 로 `dark:` 변형 자체를 꺼서 파일 수정 없이 효과를 없앤다 |
| W11 | `app/globals.css` 에 `@custom-variant dark (&:where(.dark, .dark *));` 1줄 — Tailwind v4 `dark:` 를 「`.dark` 클래스가 있을 때만」으로 바꿈(앱은 `.dark` 를 붙이지 않음) | 모든 `dark:` 사용처(통화 2파일 포함) | 통화 파일 **원문 무변경**으로 통화 화면의 다크 분기만 꺼짐. 통화 화면 라이트 값은 그대로 → 라이트 기기 화면 무변화. 이것이 통화 규정 적용 대상인지 → §4 충돌 보고 |
| W8 | `layout.tsx` `themeColor` 를 단일 `"#0B421A"` 로 | 브라우저 상단 색 | 값 같음, 동작 무변화 |
| W9 | `ConditionalAppShell.tsx:145` `"system"` → `"light"`, `StartupThemeCache` 를 `"light"` 만 | 시작 캐시 | 기존 저장값 `"system"` 은 W5 수정으로 무시됨 |
| W10 | `:global(html.dark)` 규칙 3곳 삭제 (`StoreDeliveryBufferingSpinner.module.css` · `VoiceMessageBufferingSpinner.module.css`) | 없음(현재 효과 없음) | 없음 |
| W12 | 재발 방지 계약 시험 1개: `app/**/*.css`·`components/**`·`lib/**` 에 `prefers-color-scheme: dark`·`color-scheme: light dark` 0건, `globals.css` 에 W11 1줄 존재 | — | CI 포함 |

테스트 수정:
- T1 `lib/stores/__tests__/delivery-visual-token-w3-contract.test.ts:35-39` (다크 블록 존재 전제) → 「`store-order-list-tokens.css` 에 다크 블록 없음」으로 교체
- T2 `components/mypage/__tests__/r5-orders-assets-contract.test.ts:56-59` 다크 값 기대 삭제
- T3 `lib/business/__tests__/owner-ui-token-ratchet.test.ts:89` `toContain("prefers-color-scheme:dark")` → `not.toContain`
- `lib/ui/__tests__/dibay-overlay-contract.test.ts:66`·`app/dibay-overlay.css:6`·`lib/stores/commission/store-commission-contract.ts:261` — 주석의 다크 언급만 정리(동작 무관)

### 단계 2 — 네이티브 (다음 일괄 빌드 때 반영, 빌드 번호 증가는 빌드 시 1회)

| 항목 | 변경 | 영향 | 깨질 수 있는 것 |
|---|---|---|---|
| A1 Android | `styles.xml:12` `AppTheme.NoActionBar` parent → `Theme.AppCompat.Light.NoActionBar` | `MainActivity`(WebView) → `isLightTheme=true` → WebView 가 웹에 항상 라이트 신호. MainActivity 안 네이티브 버튼 2개(「다시 시도」 `dibay_handoff_cover.xml:42`, `dibay_webview_load_error_overlay.xml:50` — 색 미지정) 라이트로 | MainActivity 안 통화 Dock(`layout_native_call_dock.xml`)·통화 로딩 오버레이는 글자색·배경 모두 직접 지정(테마 속성 0건) → 색 변화 없음 예상, **실기 확인 전 NOT_PROVEN**. 통화 표면이 같은 Activity 안에 있으므로 §4 |
| A2 Android 통화 | `styles.xml:38,44` IncomingCall·ForegroundIncomingCall → Light 계열 | 수신·통화 화면(`IncomingCallActivity`·`NativeVoice/VideoCallActivity`) — WebView 없음. 테마 의존은 `?android:attr/selectableItemBackgroundBorderless`(눌림 물결) 2곳뿐, 글자색은 직접 지정 | **통화 코드 → 이번 설계에서 제외, 별도 통화 계획·승인** (§4) |
| I1 iOS | `ios/App/App/Info.plist` 에 `UIUserInterfaceStyle` = `Light` | WKWebView 라이트 신호 고정 · 상태 바 글자 검정 · 키보드·알림창·선택기 라이트 | 앱 전체 키라 iOS 통화 화면(`NativeVoiceCallViewController` 등)에도 적용. Swift 코드에 시스템 동적 색(`systemBackground`·`label` 등) 사용 0건 → 색 변화 없음 예상, **NOT_PROVEN**. CallKit 수신 화면은 시스템 UI 라 앱 설정과 무관(확인 못 함 → NOT_PROVEN). §4 |
| X1 Windows | `MainWindow.xaml.cs` `EnsureCoreWebView2Async()` 직후 `core.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Light;` | WebView2 웹 라이트 신호 고정 + WebView2 대화상자·메뉴 라이트 | App SDK 1.6 의 WebView2 SDK 에 해당 속성 존재 여부는 빌드 시 컴파일로 확인 |
| X2 Windows | `App.xaml` `<Application … RequestedTheme="Light">` | WinUI 컨트롤·창 배경 라이트 | 창 제목 표시줄(시스템 그림)이 따라가는지는 **확인 못 함 → 실기 확인 항목** |

## 3. 검증 계획

- 코드: `typecheck:build` · 변경 관련 vitest(T1~T3·W12) · 변경 파일 eslint · `check:i18n-quality` (문구 변경 없음) · `verify:call-surface-cta-ssot`.
- 단계 1 실기 (앱 재시작, Production SHA 기록): 기기 다크 켠 상태에서 Samsung(Android)·iPhone 시뮬·Windows 로 홈·거래·배달 허브 주문 목록·메신저 목록/방·마이·어드민 1화면 — 녹화 프레임으로 배경 `#FFFCFC`·브랜드 그린 `#0B421A` 확인. 라이트 기기 화면 무변화 대조.
- 단계 2 실기 (새 빌드 설치 `user_devices.app_version` 확인 후): 다크 기기에서 상태 바 글자색·키보드·「다시 시도」 버튼·Windows 대화상자. 통화 화면은 §4 결정 전 시험 대상 아님.

## 4. Owner 결정 필요 — 지시와 기존 규정 충돌

Owner 지시 「모두 다크 미적용」과 **통화 변경 규정·2026-11-12 「통화 지금 손대지 않음」**이 다음 3곳에서 겹친다. 임의로 고르지 않고 보고한다.

1. **W11** (`dark:` 끄기 1줄) — 통화 파일 원문은 안 바꾸지만 통화 팝오버·수신 배너의 다크 표시가 꺼진다(웹 통화 화면 동작 변화).
2. **A1·I1** — 앱 전체 테마라 같은 Activity/앱 안 통화 표면(Android Dock, iOS 통화 화면)에 함께 적용된다. 색은 직접 지정이라 변화 없음 예상이지만 실기 미확인.
3. **A2** — 통화 화면 테마 직접 변경.

통화를 빼면 1·2 는 반쪽이 된다: W11 없이 통화 `dark:` 두 파일만 다크로 남고, A1·I1 은 앱 단위라 통화만 빼는 방법이 없다.

## 5. 롤백

- 단계 1: Vercel Instant Rollback (재빌드 없음) 또는 되돌림 PR.
- 단계 2: 이전 빌드 재설치. 설정 값 1줄씩이라 되돌림 PR 로 원복.
