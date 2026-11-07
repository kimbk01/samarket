# Windows 셸 W2 — 로그인을 기본 브라우저로 (작업 계획서 · 2026-11-08 PHT)

- 상태: **계획만. 구현 0건.** Owner 승인 후 구현한다.
- 상위 설계: `docs/audit/windows-desktop-shell-design-2026-11-07.md` §W2.
- 근거: 코드 사실은 `origin/main`(`b8869178f` 이후)에서 직접 확인했다(파일:줄). 노트북 실기 결과는 W0 기록(설계서 §12)이다.

## 0. 인증 잠금 재개방 (승인 필요)

- `docs/auth-hard-lock.md` §4 에 따라, 인증 코드를 바꾸려면 **재개방 사유를 밝힌 Owner 승인**이 필요하다.
- **사유: 트리거 5 「플랫폼 정책 변경으로 계약 수정 필요」.**
  - Google 은 앱 안 웹 화면(WebView2)에서 로그인을 막는다. 근거는 [OAuth 2.0 정책](https://developers.google.com/identity/protocols/oauth2/policies)이다.
  - 노트북 실기에서 Google 이 「보안 코드」를 요구해 정상 로그인이 되지 않았다(W0 화면, 2026-11-08).
- **계약 변경점 (First Break 기록):** Windows 셸에서 Google·카카오·Apple 로그인 화면을 **앱 창 안이 아니라 기본 브라우저**에서 연다.
  - 로그인 결과(도착 화면·세션·프로필 의미)는 바꾸지 않는다.
  - 세션 교환은 기존 `/auth/callback` 그대로다.
  - Android·iOS 경로는 바꾸지 않는다.

## 1. 지금 흐름 (코드 사실)

| 단계 | Android·iOS 셸 | Windows 셸 (W0 현재) |
|---|---|---|
| 방식 결정 | `resolveOAuthNativeRoutingDecision` (`lib/auth/oauth/oauth-native-routing.ts:63-139`) | 셸 판정이 null → `web_oauth_start` (브라우저와 같음) |
| 시작 | `use-oauth-login.ts:678` `web_oauth_start && isNativeAppOAuthShell()` → `runCapacitorCustomTabOAuth` (`:490-519`) | `startOAuthLogin` — 앱 창 안에서 Supabase·공급자 화면으로 이동 |
| 인가 주소 | `fetchNativeOAuthAuthorizeUrl` (`start-oauth-login.ts:97`) → `/api/auth/oauth/start?launch=native` → redirectTo `https://samarket.vercel.app/auth/oauth/capacitor-return` | (쓰지 않음) |
| PKCE | 시작 응답이 **앱 WebView 쿠키**에 verifier 저장 (`start-oauth-login.ts` 주석 「PKCE verifier 쿠키」) | 앱 창 쿠키 |
| 로그인 화면 | Custom Tab / ASWebAuthenticationSession | **앱 창 안** → Google 막힘 |
| 복귀 | `capacitor-return` 페이지가 `dibay://auth/callback?…` 을 연다 (`app/auth/oauth/capacitor-return/page.tsx`) → `appUrlOpen` → `deliverNativeOAuthReturnUrl` (`native-oauth-return-bridge.ts`) → `/auth/callback` | 앱 창 안에서 바로 `/auth/callback` |
| 서버 판정 | `launch=native` 이면 redirectTo = capacitor-return (`resolve-native-oauth-request.server.ts` `shouldUseNativeOAuthRedirect`) | — |

**결론:** 서버·Supabase 설정·복귀 페이지는 이미 「외부 브라우저 → `dibay://` → 앱」을 지원한다. Windows 에 없는 것은 두 가지뿐이다.
1. 브라우저를 여는 손 (Android 의 Custom Tab 역할)
2. `dibay://` 를 받아 웹에 넘기는 손 (`appUrlOpen` 역할)

## 2. 바꾸는 것

### 2-1. 셸 (`windows/DibayDesktop`, 브리지 v1 → v2)

| 파일 | 변경 |
|---|---|
| `Package.appxmanifest` | `windows.protocol` 확장 — 이름 `dibay` (앱이 꺼져 있어도 `dibay://` 로 켜짐) |
| `Program.cs`(신규)·`DibayDesktop.csproj` | 단일 실행: `AppInstance.FindOrRegisterForKey` — 이미 켜진 창이 있으면 새 실행을 그 창으로 넘긴다(`RedirectActivationToAsync`). 자동 생성 Main 을 끄고(`DISABLE_XAML_GENERATED_MAIN`) 직접 Main 을 둔다 |
| `App.xaml.cs` | 프로토콜 활성화(`ExtendedActivationKind.Protocol`) → `dibay://auth/callback…` 만 창에 전달, 창을 앞으로 |
| `MainWindow.xaml.cs` | 메시지 `auth.open` 처리. 그리고 `dibay://auth/callback…` → 웹에 `auth.return` 전송 |
| `AppConfig.cs` | `BridgeVersion = 2`, 브라우저로 열어도 되는 로그인 호스트 목록 |

- **`auth.open` 조건:**
  - 앱 주소에서 온 메시지만 받는다.
  - `https` 이고, 호스트가 우리 Supabase 프로젝트(`*.supabase.co`)일 때만 기본 브라우저(`Launcher.LaunchUriAsync`)로 연다.
  - 그 밖의 주소는 무시한다. 셸이 아무 주소나 여는 통로가 되지 않게 하기 위해서다.
- **`auth.return` 조건:** scheme `dibay`, host `auth`, 경로 `/callback` 만 넘긴다. 다른 `dibay://` 는 버린다.
- **앱 창 안 로그인 호스트:** W0 에서 허용한 카카오·Apple·Google 로그인 호스트를 목록에서 **뺀다**. 앱 창 안에서 공급자 화면이 열리는 일이 없어진다.

### 2-2. 웹 (Windows 셸에서만 동작 — 판정 `isDibayWindowsShell()`)

| 파일 | 변경 |
|---|---|
| `lib/platform/dibay-windows-shell.ts` | 브리지 v2: `openWindowsShellSystemBrowser(url)`(`auth.open`), `subscribeWindowsShellAuthReturn(cb)`(`auth.return`), 셸 버전 확인 |
| `lib/auth/oauth/start-oauth-login.ts` | `fetchWindowsShellOAuthAuthorizeUrl` — 같은 `/api/auth/oauth/start?launch=native` 호출. Capacitor 브리지 대기·Android 쿠키 flush 는 하지 않는다 |
| `lib/auth/oauth/use-oauth-login.ts` | `:678` 바로 앞에 분기 1개: `web_oauth_start` 이고 Windows 셸(브리지 v2 이상)이면 → 인가 주소 받기 → `auth.open` → 「브라우저에서 로그인을 마쳐 주세요」 대기 상태. 셸이 v1(W0 빌드)이면 지금처럼 앱 창 안 로그인 |
| `lib/auth/oauth/native-oauth-return-bridge.ts` | `NativeOAuthReturnVia` 에 `"windows_shell"` 추가 (기록용). 처리 로직은 그대로 |
| `components/auth/WindowsShellOAuthReturnListener.tsx`(신규) · `app/layout.tsx` | `auth.return` 을 받아 `deliverNativeOAuthReturnUrl(url, "windows_shell")` 호출. `OAuthReturnListener` 옆에 마운트한다. Windows 셸이 아니면 아무것도 하지 않는다 |

- **방식 결정표(`oauth-native-routing.ts`)는 바꾸지 않는다.** Windows 셸은 지금도 `web_oauth_start` 로 결정된다. 바뀌는 것은 그 다음 「어디서 여느냐」 한 곳뿐이다.
  - 이 점은 설계서 §W2 의 「라우팅 표에 windows 줄 추가」보다 바꾸는 범위가 좁다. 설계서에 정정을 기록한다.
- **서버·Supabase 설정 변경 0:** `launch=native` 와 `capacitor-return` 은 이미 허용돼 있다. 구현 전에 운영 Supabase 리다이렉트 허용 목록을 **읽기만** 해서 대조한다. 바꿔야 하면 멈추고 따로 승인을 받는다.

### 2-3. 사용자 화면 문구 (신규 2개 — 승인 때 확정)

| 키 | 한국어(안) | 영어(안) |
|---|---|---|
| `auth_windows_browser_login_waiting` | 브라우저에서 로그인을 마치면 앱으로 돌아옵니다. | Finish signing in in your browser to return to the app. |
| `auth_windows_browser_open_failed` | 브라우저를 열지 못했습니다. 다시 시도해 주세요. | Couldn't open your browser. Please try again. |

## 3. 영향받는 곳 전부

| 경로 | 영향 | 같은 단계에서의 처리 |
|---|---|---|
| Android 셸 로그인 (Google 네이티브·카카오 네이티브·Apple 웹) | 없음 — 새 분기는 `isDibayWindowsShell()` 가 참일 때만 | 계약 테스트: Capacitor 환경에서 새 분기 미진입 |
| iOS 셸 로그인 (Apple 네이티브·Google/카카오 ASWebAuth) | 없음 — 같은 이유 | 같음 |
| 브라우저(PC·휴대폰) 로그인 | 없음 — `chrome.webview` 없음 | 같음 |
| Windows 셸 v1(이미 설치된 W0 빌드) | 웹이 셸 버전을 묻고, v1 이면 지금처럼 앱 창 안 로그인(Google 은 계속 막힘) | 버전 분기 테스트 |
| `/auth/callback` 세션 교환·온보딩·약관 | 없음 — 같은 주소로 들어온다 | 기존 테스트 그대로 |
| `capacitor-return` 페이지 | 없음 — 기본 브라우저에서도 같은 JS 로 `dibay://` 를 연다 | 실기에서 확인 |
| 네이버 | 대상 아님(비활성) | — |

## 4. 바뀐 뒤 깨질 수 있는 것과 대응

1. **브라우저가 `dibay://` 열기를 묻는 창**: Chrome·Edge 는 「DIBAY 열기?」를 묻는다.
   - 사용자가 취소하면 앱으로 돌아오지 않는다.
   - 대응: 복귀 페이지가 2초 뒤 「앱으로 돌아가기」 버튼을 보여 준다(기존 기능).
   - 앱 화면도 대기 상태에서 다시 시도할 수 있게 한다.
2. **앱이 꺼진 상태에서 복귀**: `dibay://` 가 앱을 새로 켠다. PKCE verifier 는 앱 WebView 쿠키에 디스크로 남아 있어 교환할 수 있다.
   - 쿠키가 실제로 남는지는 NOT_PROVEN 이다. 실기 항목 W2-5 로 확인한다.
3. **다른 앱이 `dibay://` 를 가로챔**: Android 도 같은 구조다. 인가 코드는 앱 WebView 의 PKCE verifier 없이는 교환할 수 없다. 추가 위험은 없다.
4. **브라우저에 이미 다른 계정으로 로그인됨**: 그 계정으로 들어갈 수 있다. Android Custom Tab 과 같은 동작이고, 공급자의 계정 선택 화면이 처리한다.
5. **창 두 개**: 단일 실행 처리가 없으면 복귀 때 창이 하나 더 뜬다. 그래서 2-1 의 `Program.cs` 를 같은 단계에 넣는다.

## 5. 롤백

- **웹:** W2 웹 커밋을 되돌린다. Windows 셸은 W0 동작(앱 창 안 로그인)으로 돌아가고, 휴대폰·브라우저는 영향이 없다.
- **셸:** 이전 버전(0.1.0.0)을 노트북에 다시 설치한다. 웹은 v1 셸이면 W0 동작을 하므로 짝이 맞지 않아도 깨지지 않는다.

## 6. 검증

- **코드 (Mac):**
  - 새 분기·버전 분기·복귀 리스너 계약 테스트
  - 기존 인증 테스트 전부 (`lib/auth/**`, `app/auth/**`, `components/auth/**`)
  - `typecheck:build`·`typecheck:test`·eslint
  - `verify:native-version-bump` — `[배포 구분]` 에 Windows 가 표시돼야 한다
- **셸 버전:** `0.1.0.0` → `0.2.0.0`. 설치용 빌드이므로 W1 규정대로 올리고, `--release --windows-only` 를 PASS 시킨다.
- **실기 (노트북 · Owner 계정 · Production SHA 기록):**

| # | 항목 | 기대 |
|---|---|---|
| W2-1 | Google 로그인 (브라우저에 Google 로그인 안 됨) | 기본 브라우저가 열림 → 로그인 → 「DIBAY 열기?」 허용 → 앱이 로그인 상태로 홈 |
| W2-2 | Google 로그인 (브라우저에 이미 로그인됨) | 계정 선택 → 앱 복귀 |
| W2-3 | 카카오 로그인 | 같은 흐름으로 앱 복귀 |
| W2-4 | Apple 로그인 | 같은 흐름으로 앱 복귀 |
| W2-5 | 브라우저에서 로그인하는 동안 앱을 닫음 → 복귀 | 앱이 켜지며 로그인 완료 (창 1개) |
| W2-6 | 앱이 켜진 상태에서 복귀 | 기존 창이 앞으로, 창이 2개가 되지 않음 |
| W2-7 | 「DIBAY 열기?」에서 취소 | 앱은 대기 상태 → 다시 시도 가능 |
| 회귀 | Android·iOS 실기 — Google·카카오·Apple 로그인 각 1회 | 지금과 같음 (실기 가능한 기기로. 못 하면 NOT_PROVEN 으로 표기) |

## 7. 반영 순서

1. 웹 + 셸 코드를 한 커밋으로 main 에 1회 반영한다(검증 PASS 후). 웹은 v1 셸과도 호환되므로 웹이 먼저 운영에 나가도 안전하다.
2. Owner 가 노트북에서 새 코드를 받아 F5(또는 설치 빌드)를 한다. 그 뒤 실기 W2-1~7 을 확인한다.
3. 결과를 `docs/auth-hard-lock.md` 에 Amendment 로 기록한다(재개방 절차 4번).

## 8. Owner 승인 항목

1. 인증 잠금 재개방 — **트리거 5**(Google 의 앱 안 로그인 금지 정책).
2. 화면 문구 2개(§2-3).
