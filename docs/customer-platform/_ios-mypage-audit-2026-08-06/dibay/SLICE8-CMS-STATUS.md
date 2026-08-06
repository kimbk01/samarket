# Slice 8 — Legal CMS Phase 1 STATUS

```text
SLICE 7 ADMIN PROJECTION LOCK 유지
SLICE 8 CMS AUTHORIZED — PHASE 1 LEGAL ONLY
TERMS + PRIVACY
BUSINESS INFORMATION DEFERRED TO PHASE 2
SLICE 8 IN PROGRESS
```

## Scope

- SSOT: `app_legal_documents` (separate from `app_notices`)
- Admin draft/publish at `/admin/app/legal`
- Guest/Member read: `/api/legal/{terms|privacy}` → `/terms` · `/privacy`
- `version` + `effective_at` / `published_at`
- Consent writer (`/api/me/legal-consent` + `STORE_*_VERSION`) unchanged

## Out

Business registration CMS · FAQ · banners · popups · notices rewrite · Slice 1–7 reopen · CLI deploy
