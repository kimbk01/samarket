# Store Review Auth Setup Checklist

## OAuth providers
- Supabase Auth provider `google` enabled
- Supabase Auth provider `kakao` enabled
- Supabase custom provider `custom:naver` enabled and callback set to `/auth/callback`
- Supabase Auth provider `apple` enabled with iOS/App Store review build redirect URL

## Redirect URLs
- `${NEXT_PUBLIC_SITE_URL}/**` (예: `https://samarket.vercel.app/**`)
- `http://localhost:3000/**`
- `dibay://auth/callback` (필수 — native OAuth 앱 복귀)
- `dibay://**` (권장 — 운영 안정성)
- Site URL은 production HTTPS 도메인 유지
- 실기기 QA: [native-oauth-device-qa.md](./native-oauth-device-qa.md)

## Twilio Verify
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
- Verify service configured for Philippines SMS delivery

## Supabase
- `SUPABASE_SERVICE_ROLE_KEY`
- latest migration including `user_sessions`, `account_deletion_requests`, consent/profile columns applied

## Store review demo account
- admin panel can create `admin_manual` account
- reviewer account email and password documented for App Store Connect / Play Console review notes

### 심사 메모 필수 문안 — 아이디·비밀번호 로그인 숨김 (2026-11-02~)
고객 로그인 화면(내정보·로그인 창·`/login`)에는 아이디·비밀번호 입구가 보이지 않는다. 로고를 3초 안에 4번 눌러야 폼이 열린다
(`components/auth/DibayAuthLogoHiddenGate.tsx`). 심사용 계정이 아이디·비밀번호 계정이면 **제출 때마다** 아래 문안을
App Store Connect 「App Review Information › Notes」와 Play Console 「앱 액세스(App access) › 안내」에 그대로 붙인다.
이 문안이 없으면 심사자가 로그인하지 못해 반려된다(App Store 지침 2.1 / 2.3.1).

> Demo account sign-in: on the login screen, tap the dibaY logo 4 times within 3 seconds. The ID/password form appears below the social sign-in buttons. Sign in with the demo credentials provided above.
