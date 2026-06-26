# P1: AdminAccessDeniedPanel SSR crash when admin session is missing

**Status:** Open (tracked separately from Image Platform V2)  
**Severity:** P1  
**Image V2 blocker:** No  
**Recorded:** 2026-06-26  

## Summary

When the server admin gate in `app/admin/layout.tsx` denies access (`getOptionalAdminUserIdCached()` returns `null`), the layout renders `AdminAccessDeniedPanel` from a **Server Component**. That panel calls client hook `useI18n()` without a `"use client"` directive, causing **HTTP 500** on prod SSR instead of the intended access-denied UI.

## Root cause

| Layer | Detail |
|-------|--------|
| Trigger | Admin session missing or not recognized on server (`getOptionalAdminUserIdCached()` → `null`) |
| Fault | `AdminAccessDeniedPanel` uses `useI18n()` without `"use client"` |
| Render path | `app/admin/layout.tsx` (Server Component) → `<AdminAccessDeniedPanel />` |
| Prod log | `Attempted to call useI18n() from the server but useI18n is on the client` (digest `836022513`) |

## What this is NOT

- Not caused by Image Platform V2 or baseline measurement work
- Not Supabase outage or env misconfiguration
- Not permission logic alone (403/denial intended; crash masks it)

## Evidence (baseline audit, local prod)

- Playwright injected session: `/api/admin/banners` → **401**; `/admin/banners` SSR → **500**
- Separate probe with valid admin server auth: `/admin/banners` → **200** (empty `my_page_banners`, 0 preview images)
- `AdminBannerPreview` code contract (when page loads): raw `<img>`, no transform — unchanged

## Baseline impact

- Admin image preview **network baseline** blocked on the denial SSR path
- Does **not** block Image V2 Tier Snap or consumer migration decisions
- Code contract for preview component remains valid when auth succeeds

## Fix scope (out of Image V2)

Do **not** patch in Image V2 baseline PR. Fix options (for future PR):

1. Add `"use client"` to `AdminAccessDeniedPanel`, or
2. Render denial via a dedicated client wrapper from layout, or
3. Use server-safe copy (e.g. `translate()` / static fallback) in server-only denial path

## References

- `components/admin/AdminAccessDeniedPanel.tsx`
- `app/admin/layout.tsx`
- `docs/perf/image-platform-baseline-measurement.json` → `admin_banners_500_audit`
