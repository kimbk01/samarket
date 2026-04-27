# dibaY Vercel/Env Checklist

## 1) Local env keys (names only)
- [ ] `.env.local` has `NEXT_PUBLIC_SITE_NAME=dibaY`
- [ ] `.env.local` has `NEXT_PUBLIC_APP_NAME=dibaY`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` value unchanged
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` value unchanged
- [ ] `SUPABASE_SERVICE_ROLE_KEY` value unchanged

## 2) Vercel Environment Variables
- [ ] `NEXT_PUBLIC_SITE_NAME=dibaY`
- [ ] `NEXT_PUBLIC_APP_NAME=dibaY`
- [ ] Existing Supabase URL/KEY values unchanged
- [ ] OAuth provider secrets unchanged

## 3) Vercel Project/Domain
- [ ] Project Name updated to `dibaY` (optional)
- [ ] `dibaY.vercel.app` domain connected
- [ ] Production alias/domain points to dibaY brand URL

## 4) Supabase Auth URL configuration
- [ ] Site URL uses dibaY production domain
- [ ] Redirect URLs include `https://dibaY.vercel.app/**`
- [ ] Supabase callback path remains `https://<project-ref>.supabase.co/auth/v1/callback`
