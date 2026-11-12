# 다크 모드 미적용 — 남은 위험 감사·확정 설계 (2026-11-13 04:33 PHT)

선행: `docs/design/no-dark-mode-all-platforms-design-2026-11-12.md` (PR kimbk01/samarket#214 · #217)
지시: Owner 2026-11-13 「남은 위험이 없도록 정확한 감사와 확인 후 설계안을 보고 해라」

## 0. 내 잘못 먼저

- 2026-11-12 설계·구현에서 **Android·iOS 상태 바 아이콘 색**을 빠뜨렸다. 상태 바 아이콘 색은 앱 테마가 아니라 Capacitor `SystemBars` 가 정하는데, 이 코드는 **기기 다크 여부를 직접 본다**(§2 R1). 그래서 #214·#217 의 테마 변경(Android Light·iOS `UIUserInterfaceStyle`)만으로는 다크 기기에서 **밝은 머리글 위에 흰 상태 바 아이콘**이 나와 안 보인다. Android 1.2.6(50) 설치 기기도 같다.
- #214 에서 Android 테마를 `DayNight` → `Light` 로 바꾸면서, 기존 `DayNight` 에는 적용되지 않던 **Android 강제 다크(Force Dark)** 의 대상 조건 하나(`isLightTheme=true`)를 새로 만족시켰다. 기본 설정에서는 동작하지 않지만, 개발자 옵션·제조사 기능으로 켜면 적용될 수 있다(§2 R2). 설계 단계에서 확인하지 않았다.

## 1. 이번에 직접 확인한 것 (증거)

| 항목 | 조건 | 결과 | 증거 |
|---|---|---|---|
| PR #214 | GitHub 1회 조회 | MERGED 2026-11-12 22:45 PHT, `ci-ok` SUCCESS, merge `8ffc0bd1e` | `gh pr view 214` |
| PR #217 | GitHub 1회 조회 | MERGED 2026-11-12 22:50 PHT, `ci-ok` SUCCESS, merge `7a353de25` | `gh pr view 217` |
| Production | Vercel 1회 조회 | `7a353de25` = READY (#214·#217 둘 다 포함). 이후 `158d0682c`·`4bf987ea0`(Android 빌드 번호만)은 CANCELED(빌드 생략 — 정상) | Vercel deployments `dpl_DZHw5prZrkFnaxUh5KDxrzsaUNqG` |
| 운영 웹 다크 반응 | **Production `7a353de25` · 비로그인 · 375×812 · 제 브라우저 창에서 `prefers-color-scheme: dark` 흉내** · 04:3x PHT | 다크 신호 `true` 상태에서 `--sam-bg-app #fffcfc` · `--sam-primary #0b421a` · `--sam-text-primary #362415` · body `rgb(255,252,252)` · `color-scheme: light` · theme-color 1개 `#0B421A`. `/`·`/market`·`/stores`·`/philife`·`/community-messenger`·`/mypage`·`/admin` 의 CSS 전부(홈 3개 + 화면별 16개)에서 `prefers-color-scheme: dark`·`light dark`·`:where(.dark` **0건** | 화면 캡처(홈 라이트), JS 조회 결과 |
| 설치 앱 버전 | 운영 DB `user_devices` 읽기 전용 (최근 3일) | Android 1.2.6(50) 1대 · (40) 1대 · (39) 12대 · iOS 1.2.1(31) 5대 · (32) 2대 · 1.2(27) 9대 등. **iOS 는 `UIUserInterfaceStyle` 이 들어간 빌드가 아직 없음** | SQL 결과 |
| 연결 기기 | adb 조회(입력 없음) | Samsung SM-M156S = 1.2.6(**50**, #214·#217 네이티브 포함) · Xiaomi = 1.2.6(40, 구 테마). 둘 다 기기 다크 **꺼짐**, DIBAY 앞 화면. Samsung 상태 바 뒤 머리글 = 밝은 색 | `cmd uimode night` · `dumpsys package` · 화면 캡처 |
| 웹 잔여 다크 코드 | `origin/main` 전체 검색 (docs·테스트 제외) | `prefers-color-scheme: dark`·`light dark`·시스템 다크 조회 JS 0건. 남은 「dark」는 색 이름(`--delivery-dark` 등)·회원 액자 종류 `"dark"` 값으로, 다크 모드와 무관 | grep 결과 |

## 2. 남은 위험 — 원인과 확정 설계

### R1. 상태 바 아이콘이 기기 다크를 따름 (Android·iOS) — **결함**

- 원인 (Capacitor 8.4.0 원문):
  - Android `node_modules/@capacitor/android/.../plugin/SystemBars.java:282-331` — 설정 `style` 기본값 `DEFAULT` → `getStyleForTheme()` 가 `Configuration.uiMode & UI_MODE_NIGHT_MASK` 로 판단 → 기기 다크면 `DARK` → `setAppearanceLightStatusBars(false)` = **흰 아이콘**. 앱 테마와 무관하다. `handleOnConfigurationChanged` 는 마지막으로 정한 값을 다시 적용한다.
  - iOS `node_modules/@capacitor/ios/.../Plugins/SystemBars.swift:74-88` — 기본 `DEFAULT` → `.default` → 앱 표시 방식(현재 설치본은 시스템 따라감)을 따라 다크면 흰 글자.
- 설계:
  - R1-a (웹, **설치된 모든 앱에 즉시**): 네이티브 앱일 때 앱 시작 시 1회 `SystemBars.setStyle({ style: SystemBarsStyle.Light })` (`@capacitor/core` 8 내장 플러그인 — 2026-06 부터 모든 설치본에 포함). 새 클라이언트 컴포넌트 `components/layout/NativeSystemBarsLight.tsx` 를 `ConditionalAppShell` 에 1회 마운트한다. 실패(플러그인 없음)는 무시한다. Android 는 이후 설정 변경 때 저장된 `LIGHT` 를 다시 적용하므로 다크 전환에도 유지된다.
  - R1-b (네이티브 설정, 다음 빌드): `capacitor.config.ts` `plugins.SystemBars.style: "LIGHT"` — 웹이 뜨기 전 첫 화면부터 적용한다.
  - 영향: `LIGHT` = 지금 **라이트 기기에서 보이는 것과 같은 값**이라, 라이트 기기 화면은 변하지 않는다. 웹 쪽 다른 `SystemBars` 호출은 0건(검색 확인)이라 충돌 없음. 통화 화면(별도 Activity·iOS 통화 화면)은 Capacitor 화면이 아니라 영향 없음.

### R2. Android 강제 다크(Force Dark) 대상이 됨 — **위험**

- 원인 (AOSP 원문): `ViewRootImpl.determineForceDarkType()` — 기기 다크 && 테마 `isLightTheme=true` && 테마 `forceDarkAllowed`(값이 없으면 개발자 옵션 「강제 다크 재정의」 `debug.hwui.force_dark` 를 따름) → 강제 다크. Android 36 플랫폼 테마·AppCompat 1.7.1 리소스에는 `forceDarkAllowed` 값이 없다(직접 확인) → **기본 설정에서는 꺼짐**. 그러나 개발자 옵션이나 이 값을 쓰는 제조사 기능을 켜면 #214 이후 Light 테마는 대상이 된다. 그 경우 공식 문서상 WebView 도 `prefers-color-scheme` 를 쓰지 않는 페이지(지금의 DIBAY)를 알고리즘으로 어둡게 칠할 수 있다.
- 설계: 테마에 `<item name="android:forceDarkAllowed">false</item>` (공식 해제 방법, attrs.xml: 부모 체인의 `false` 는 덮이지 않음).
  - R2-a 일반: `AppTheme`, `AppTheme.NoActionBar`, `AppTheme.NoActionBarLaunch`
  - R2-b 통화 (통화 단독 PR): `AppTheme.IncomingCall`, `AppTheme.ForegroundIncomingCall`
- 앱이 막을 수 없는 것 (원문 확인): Android 「색상 반전 강제(접근성)」 `ACCESSIBILITY_FORCE_INVERT_COLOR_ENABLED` 는 AOSP 주석상 *개발자 해제와 다크 테마를 무시*한다. 사용자가 고르는 접근성 기능이라 앱 결함이 아니다. iOS 「스마트 반전」도 같다.

### R3. 인앱 브라우저(Custom Tabs / SFSafariViewController) 툴바 — **위험**

- 원인: `lib/destination/open-destination.ts:48` · `lib/community-messenger/messenger-file-download.ts:54` 가 `Browser.open({ url })` 만 호출 → Android Custom Tabs 툴바가 시스템 다크를 따른다.
- 설계: 두 호출에 `toolbarColor: "#FFFFFF"` (Capacitor Browser 원문: Android `setDefaultColorSchemeParams`, iOS `preferredBarTintColor`). 웹 변경이라 설치본에 즉시 적용된다. 열린 **페이지 내용은 외부 사이트**(파일·외부 링크)의 화면이라 DIBAY 범위 밖이다.

### R4. iOS 설치본 — 키보드·알림창·선택기 — **반영 조건**

- 원인: `UIUserInterfaceStyle=Light`(#214)는 main 에 있지만 **그 코드로 만든 iOS 빌드가 아직 없다**(설치 최신 1.2.1(32)).
- 설계: 코드 추가 없음. 다음 iOS 빌드에 포함된다. 그 전까지 웹 색(#214)과 상태 바(R1-a)는 웹으로 해결된다.

### R5. Windows 제목 표시줄 — **위험 (원문 확인)**

- 원인: 고정 속성 `AppWindowTitleBar.PreferredTheme`(Light) 는 **Windows App SDK 1.7 부터**다(Microsoft 문서). 프로젝트는 1.6.250205002 라 쓸 수 없다. 기본 `Legacy`.
- 설계: SDK 를 올리지 않고 `MainWindow` 생성자에서 `AppWindowTitleBar.IsCustomizationSupported()` 일 때 `AppWindow.TitleBar` 의 `BackgroundColor`·`ForegroundColor`·`InactiveBackgroundColor`·`InactiveForegroundColor`·`ButtonBackgroundColor`·`ButtonForegroundColor`·`ButtonHoverBackgroundColor`·`ButtonHoverForegroundColor`·`ButtonPressedBackgroundColor`·`ButtonPressedForegroundColor`·`ButtonInactiveBackgroundColor`·`ButtonInactiveForegroundColor` 를 라이트 값(흰 배경 `#FFFFFF`, 글자 `#362415`, hover/pressed `#F2F2F2`/`#E6E6E6`, 비활성 글자 `#8A8A8A`)으로 지정한다(1.0 부터 있는 API).
- 확인 경로: Windows 컴파일 CI 가 없다(`.github/workflows` 검색 0건). #214 의 `core.Profile.PreferredColorScheme` 도 **아직 컴파일되지 않았다**. 다만 1.6 이 요구하는 WebView2 SDK 1.0.2651.64 에 해당 API 가 있다(nuget·Microsoft 문서 확인). 다음 Windows 빌드에서 컴파일과 실기를 함께 확인한다.

### R6. PR1 계약 시험의 통화 제외 목록 — **정리**

- `lib/ui/__tests__/no-dark-mode-contract.test.ts` 의 `CALL_DARK_VARIANT_PENDING` 2개 파일은 #217 로 이미 `dark:` 가 0건이다. 목록을 지우고 모든 파일에 적용한다. R1~R3 계약도 같은 시험에 추가한다.

## 3. 반영 단위 (규정: 통화 단독 · 작업 단위 PR)

| PR | 내용 | 배포 구분 |
|---|---|---|
| PR-A `fix/no-dark-mode-residual` | R1-a 웹 · R1-b `capacitor.config.ts` · R2-a 일반 테마 3개 · R3 툴바 2곳 · R5 Windows 제목 표시줄 · R6 시험 정리 + 계약 시험 | 웹 = 병합 후 앱 재시작으로 R1-a·R3 적용 / 네이티브 = 다음 빌드 |
| PR-B `fix/no-dark-mode-residual-call` | R2-b 통화 테마 2개 `forceDarkAllowed=false` | 네이티브(통화) — 다음 빌드 |

검증(로컬 1회): `typecheck:build` · `test:ci` · 변경 파일 eslint · `verify:call-surface-cta-ssot`(PR-B).

## 4. 실기기 확인 계획 — 기기 다크 켬 (끝나면 원래대로)

기기 다크 전환은 **시험 기기의 시스템 설정 변경**이라 Owner 승인 후 한다(Android `adb shell cmd uimode night yes`/`no`, iOS 시뮬 `xcrun simctl ui <기기> appearance dark`/`light`). 다른 세션이 그 기기를 쓰는 중이면 하지 않는다. 판정은 녹화·캡처 프레임으로만 한다.

| # | 기기·빌드 | 시점 | 확인 |
|---|---|---|---|
| V1 | Samsung 1.2.6(50) | PR-A 병합·배포 후 앱 재시작 | 홈·채팅·배달·마이 배경 라이트, **상태 바 아이콘 검정**(R1-a), 「다시 시도」 버튼 라이트, 인앱 브라우저 툴바 흰색 |
| V2 | Xiaomi 1.2.6(40, 구 DayNight) | 같음 | 웹 라이트 + 상태 바 아이콘 검정 (구 바이너리에서 웹만으로 해결되는지) — 입력 막힘 기기라 화면 확인만 |
| V3 | iPhone 시뮬 설치본 | 같음 | 웹 라이트 + 상태 바 글자 검정 |
| V4 | 다음 일괄 빌드 (Android ≥51 · iOS ≥33 · Windows) | 설치 후 `user_devices.app_version` 확인 | 첫 화면부터 상태 바 검정(R1-b), 개발자 옵션 「강제 다크 재정의」 켜도 라이트(R2), iOS 키보드·알림창 라이트(R4), Windows 제목 표시줄·대화상자 라이트(R5·#214) |
| V5 | 같은 빌드 통화 | V4 와 함께 | 통화 규정 실기 행렬(Android↔iPhone 음성·영상 발신·수신·거절·벨 중 취소·지연 푸시·통화 중·무응답·종료 후 재발신) — 다크 기기 상태에서 수신 화면·Dock·PiP 라이트 |
