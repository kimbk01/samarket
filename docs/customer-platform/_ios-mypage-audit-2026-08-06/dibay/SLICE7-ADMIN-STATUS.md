# Slice 7 — Admin Projection STATUS

```text
SLICE 6 ACCOUNT LOCK 유지
PRODUCT BASELINE (pre-Slice7) = 2676cc333
SLICE 7 ADMIN PROJECTION AUTHORIZED
SLICE 7 IN PROGRESS
SLICE 8 NOT AUTHORIZED
```

## Scope

Admin Trust History Projection only:

- `GET /api/admin/users/:id/trust` → `profiles.trust_score` + recent `reputation_logs`
- `AdminUserTrustSection` (score + history + adjust CTA, no duplicate UI)
- Adjust remains `POST /api/admin/trust-score` → `applyTrustScoreDelta`
- Member↔Admin SSOT Runtime · authz · isolation

## Out of scope

Auth · Messenger · Call · Badge · CMS (Slice 8) · Member mypage edits · Slice 1–6 reopen · dead-file delete · CLI deploy

## Deploy

`git push origin main` → Vercel Git Auto Deploy only (CLI emergency-only).
