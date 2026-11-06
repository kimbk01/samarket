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

### 심사 메모 필수 문안 — 「아이디로 로그인」 (2026-11-07~)
고객 로그인 화면(내정보·로그인 창·`/login`)의 SNS 버튼 아래에 「아이디로 로그인 · 발급받은 계정 전용 · 신규 가입 불가」가 항상 보인다
(`components/auth/AuthIdLoginEntry.tsx`). 로고 4회 탭은 보조 입구로 남아 있으나 **심사 메모에 쓰지 않는다**.
발급 ID 는 Auth 이메일 `<id>@manual.local` 기준으로 해석한다 — 첫 로그인 때 디바이 ID 가 자동 부여돼 표시 아이디가 바뀌어도 발급 ID 로 로그인된다.
심사용 계정이 아이디·비밀번호 계정이면 **제출 때마다** 아래 문안을 App Store Connect 「App Review Information › Notes」와
Play Console 「앱 액세스(App access) › 안내」에 붙인다 (App Store 지침 2.1).

> Demo account sign-in: open the My Info tab (bottom right). Below the Google / Kakao / Apple buttons, tap "아이디로 로그인" (Sign in with ID), then enter the demo ID and password provided above.
