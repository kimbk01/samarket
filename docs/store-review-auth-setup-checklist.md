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
