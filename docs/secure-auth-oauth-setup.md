# Secure Auth OAuth Setup

## Supabase URL Configuration

1. Supabase Dashboard -> `Authentication` -> `URL Configuration`
2. `Site URL`:
   - production: `https://your-domain.com`
3. `Redirect URLs`:
   - `http://localhost:3000/**`
   - `https://your-domain.com/**`
   - `https://*-your-project.vercel.app/**`

앱 코드는 OAuth 완료 후 `app/auth/callback/route.ts` 로 돌아오므로, 각 provider 로그인 시 `redirectTo` 는 앱의 `/auth/callback` 이 allow list 에 포함되어야 합니다.

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
   - `https://<project-ref>.supabase.co/auth/v1/callback`
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
- Naver: `provider: "custom:naver"`
- OAuth callback path: `/auth/callback`
- 로그인 완료 후 서버가 `profiles.active_session_id` 와 httpOnly 쿠키를 함께 갱신합니다.
