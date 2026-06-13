# Secure Auth OAuth Setup

## Supabase URL Configuration (Production Standard)

1. Supabase Dashboard -> `Authentication` -> `URL Configuration`
2. `Site URL`:
   - production: `https://dibaY.vercel.app`
3. `Redirect URLs`:
   - `https://dibaY.vercel.app/**`
   - `http://localhost:3000/**`
   - `dibay://auth/callback` (Capacitor Android/iOS OAuth 앱 복귀)
   - `dibay://**` (native deep link wildcard)

dibaY는 Supabase Auth OAuth 단일 구조입니다.

- **웹/PWA**: OAuth 완료 후 `{origin}/auth/callback` 으로 복귀합니다.
- **Capacitor Android/iOS**: Supabase `redirectTo` 는 `https://samarket.vercel.app/auth/oauth/capacitor-return` 입니다. Custom Tab이 이 https 페이지를 연 뒤 JS가 `dibay://auth/callback` 으로 앱을 깨우고, WebView 내부에서 HTTPS `/auth/callback` 으로 브릿지해 세션을 교환합니다.

**주의**: `dibay://` scheme은 Site URL이 아니라 **Redirect URLs** 목록에 추가해야 합니다. whitelist에 없으면 Supabase가 Site URL(`https://samarket.vercel.app`)로 폴백해 Chrome 웹에 로그인 상태가 남을 수 있습니다.

### Redirect URLs 권장 최종 목록 (운영)

| 항목 | 값 | 비고 |
|------|-----|------|
| Site URL | `https://samarket.vercel.app` | 유지 |
| 웹 wildcard | `https://samarket.vercel.app/**` | 필수 |
| 로컬 | `http://localhost:3000/**` | 개발 |
| native exact | `dibay://auth/callback` | 권장 — 브릿지 페이지가 최종 앱 복귀에 사용 |
| native wildcard | `dibay://**` | 권장 |
| native https bridge | `https://samarket.vercel.app/auth/oauth/capacitor-return` | **필수** — Supabase redirectTo (웹 wildcard `/**` 로 포함됨) |

Supabase `redirectTo` 는 **https capacitor-return** 을 사용합니다. Samsung 등 기기에서 Custom Tab이 `dibay://` 직접 핸드오프를 하지 않는 경우가 많아, 이 페이지가 `code` 를 포함한 query를 `dibay://auth/callback` 으로 넘깁니다.

실기기 QA: [docs/native-oauth-device-qa.md](./native-oauth-device-qa.md)

## OAuth 시작·복귀 (Google / Kakao / Apple)

Supabase OAuth(Google·Kakao·Apple)는 **서버 주도 start** + 단일 클라이언트 hook(`useOAuthLogin`)으로 동작합니다. Naver·비밀번호 로그인은 별도 경로를 유지합니다.

### Web / PWA

1. 버튼 클릭 → `window.location.assign('/api/auth/oauth/start?provider=...')`
2. 서버 `signInWithOAuth({ skipBrowserRedirect: true })` → **302** provider authorize URL (+ PKCE cookies)
3. provider → `{origin}/auth/callback?code=...` → `exchangeCodeForSession`

### Capacitor Native (Android / iOS)

PKCE verifier는 **WebView 쿠키**에 저장되어야 `/auth/callback` exchange가 성공합니다. Custom Tab에 start URL만 열면 PKCE가 분리됩니다.

1. 버튼 클릭 → WebView `fetch('/api/auth/oauth/start?provider=...&launch=native', { credentials: 'include', headers: { Accept: 'application/json' } })`
2. 서버 → **200** `{ ok: true, authorizeUrl, redirectTo }` + PKCE `Set-Cookie` (WebView)
3. WebView → `NativeOAuthLauncher.open(authorizeUrl)` (Custom Tab)
4. provider → Supabase → `https://samarket.vercel.app/auth/oauth/capacitor-return?code=...` (Custom Tab) → JS `dibay://auth/callback?code=...` → `OAuthReturnListener` (`appUrlOpen`) → HTTPS `/auth/callback` 브릿지 → exchange

관련 코드:

- Start API: `app/api/auth/oauth/start/route.ts`
- 클라이언트: `lib/auth/oauth/start-oauth-login.ts`, `lib/auth/oauth/use-oauth-login.ts`
- Launch: `app/auth/oauth/launch/NativeOAuthLaunchClient.tsx`, `lib/auth/oauth/open-native-oauth-tab.ts`
- 복귀: `app/auth/oauth/capacitor-return/page.tsx`, `components/auth/OAuthReturnListener.tsx`
- Callback (유지): `app/auth/callback/route.ts`
- 계약: `lib/auth/oauth/native-oauth-contract.ts`

Logcat 필터: `oauth|DIBAY_OAuth|NativeOAuthLauncher` — [native-oauth-device-qa.md](./native-oauth-device-qa.md)

## Google

1. Google Cloud Console에서 OAuth Client를 생성합니다.
2. Authorized redirect URI에 Supabase가 보여주는 callback URL을 등록합니다.
   - 형식: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase Dashboard -> `Authentication` -> `Sign In / Providers` -> `Google`
4. Google Client ID / Secret을 입력하고 enable 합니다.

## Kakao

1. Kakao Developers에서 앱 생성
2. `Kakao Login` 활성화
3. Redirect URI에 Supabase callback URL 등록
   - `https://ckdosyydvgzqwpbwuhon.supabase.co/auth/v1/callback`
4. Supabase Dashboard -> `Authentication` -> `Sign In / Providers` -> `Kakao`
5. REST API Key 기반 Client ID / Secret을 입력하고 enable 합니다.

## Naver

**코드 기준: Supabase custom OIDC가 아니라 server OAuth2** (`/api/auth/naver/start` → `/api/auth/naver/callback`).

1. Naver Developers에서 애플리케이션 생성
2. Callback URL:
   - **Web**: `{origin}/api/auth/naver/callback`
   - **Native (Capacitor)**: `https://samarket.vercel.app/auth/oauth/capacitor-return?provider=naver` (Google/Kakao/Apple과 동일 https bridge)
3. Client ID / Secret → Vercel env `NAVER_OAUTH_CLIENT_ID`, `NAVER_OAUTH_CLIENT_SECRET`
4. Native 복귀: capacitor-return → `dibay://auth/callback?provider=naver&code=...` → `/auth/callback` → `/api/auth/naver/callback`

## Facebook

**미연결** — Admin에서 enable 해도 start API 없음. UI는 `isOAuthLoginStartSupported` 로 버튼 숨김. P2에서 Supabase Facebook provider 연결 또는 영구 비활성 결정.

## Vercel Environment Variables

- `NEXT_PUBLIC_SITE_URL=https://your-domain.com`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

권장:
- production / preview / development 각각 같은 규칙으로 설정
- preview 배포도 Supabase `Redirect URLs` 에 wildcard로 허용

## App-side Notes

- Google / Kakao / Apple: `GET /api/auth/oauth/start?provider=...` (native: `launch=native` + fetch-then-`NativeOAuthLauncher` Custom Tab)
- Naver: `GET /api/auth/naver/start?next=...` (native: https capacitor-return bridge + `provider=naver`)
- Native SDK exchange (P2): `POST /api/auth/native/exchange` — Apple/Kakao idToken 서버 검증
- OAuth callback path: `/auth/callback` (legacy `/api/auth/oauth/callback` is redirect-only)
- OAuth in-flight mutex: `lib/auth/oauth/native-oauth-contract.ts` (`tryBeginOAuthFlow`)
- 로그아웃·계정전환 wipe: `lib/auth/client-session-wipe.ts` + `verify:auth-session-contract`
- Provider matrix: [docs/auth-provider-matrix.md](./auth-provider-matrix.md)
- 로그인 완료 후 서버가 `profiles.active_session_id` 와 httpOnly 쿠키를 함께 갱신합니다.
