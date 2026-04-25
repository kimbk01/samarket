# Store Review Auth Setup Checklist

## OAuth providers
- Supabase Auth provider `google` enabled
- Supabase Auth provider `kakao` enabled
- Supabase custom provider `custom:naver` enabled and callback set to `/auth/callback`
- Supabase Auth provider `apple` enabled with iOS/App Store review build redirect URL

## Redirect URLs
- `${NEXT_PUBLIC_SITE_URL}/auth/callback`
- local development origin callback
- iOS webview / app deep-link callback if used in the native shell

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
