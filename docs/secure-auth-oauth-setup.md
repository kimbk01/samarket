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
- **Capacitor Android/iOS**: OAuth `redirectTo` 는 `dibay://auth/callback` 입니다. provider 인증 후 Supabase가 이 scheme으로 redirect 하면 앱이 deep link를 수신하고, WebView 내부에서 HTTPS `/auth/callback` 으로 브릿지해 세션을 교환합니다.

**주의**: `dibay://` scheme은 Site URL이 아니라 **Redirect URLs** 목록에 추가해야 합니다. whitelist에 없으면 Supabase가 Site URL(`https://samarket.vercel.app`)로 폴백해 Chrome 웹에 로그인 상태가 남을 수 있습니다.

### Redirect URLs 권장 최종 목록 (운영)

| 항목 | 값 | 비고 |
|------|-----|------|
| Site URL | `https://samarket.vercel.app` | 유지 |
| 웹 wildcard | `https://samarket.vercel.app/**` | 필수 |
| 로컬 | `http://localhost:3000/**` | 개발 |
| native exact | `dibay://auth/callback` | 필수 — 코드가 사용하는 redirect |
| native wildcard | `dibay://**` | **권장** — 운영 안정성·향후 deep link 확장 |

현재 코드는 `dibay://auth/callback?provider=...` 만 사용하므로 exact만으로도 동작하지만, **`dibay://**` 추가를 권장**합니다. 중복 URL(`.../auth/callback`, `dibay://auth/callback/**`)은 무해합니다.

실기기 QA: [docs/native-oauth-device-qa.md](./native-oauth-device-qa.md)

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

이 구현은 `custom:naver` provider를 사용합니다.

### 권장: Supabase Custom OAuth/OIDC Provider

1. Supabase Dashboard -> `Authentication` -> `Providers`
2. `New Provider` 생성
3. identifier를 반드시 `custom:naver` 로 설정
4. Naver가 OIDC discovery를 지원하는 환경이면 `OIDC` 방식 사용
5. OIDC가 어렵거나 discovery가 맞지 않으면 `OAuth2` custom provider로 수동 endpoint 입력

필수 항목:
- Authorization endpoint
- Token endpoint
- Userinfo endpoint
- Client ID
- Client Secret
- Scope: `name email profile_image`

Supabase가 표시하는 callback URL을 Naver Developers의 callback URL에 등록합니다.

## Vercel Environment Variables

- `NEXT_PUBLIC_SITE_URL=https://your-domain.com`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

권장:
- production / preview / development 각각 같은 규칙으로 설정
- preview 배포도 Supabase `Redirect URLs` 에 wildcard로 허용

## App-side Notes

- Google: `provider: "google"`
- Kakao: `provider: "kakao"`
- Naver: `provider: "naver"`
- Apple: `provider: "apple"`
- Facebook: `provider: "facebook"`
- OAuth callback path: `/auth/callback` (legacy `/api/auth/oauth/callback` is redirect-only)
- 로그인 완료 후 서버가 `profiles.active_session_id` 와 httpOnly 쿠키를 함께 갱신합니다.
