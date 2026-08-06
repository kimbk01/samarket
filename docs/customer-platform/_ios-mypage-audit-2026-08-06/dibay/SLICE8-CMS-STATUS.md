# Slice 8 — Legal CMS Phase 1 STATUS

```text
SLICE 7 ADMIN PROJECTION LOCK 유지
SLICE 8 CMS AUTHORIZED — PHASE 1 LEGAL ONLY
SLICE 8 LEGAL CMS PHASE 1 CODE LOCKED
SLICE 8 DEPLOYED (Git Auto Deploy)
SLICE 8 RUNTIME PASS
SLICE 8 LEGAL CMS PHASE 1 LOCK
BUSINESS INFORMATION DEFERRED TO PHASE 2
```

## Production / Git

| Item | Value |
|------|-------|
| Product + LOCK SHA | `bbc23787f2269f44e4f3472c7e997098fe4e5f31` |
| Deploy | `dpl_fm6RtnqvwVXSJizRr2G9uL39MSrW` |
| Source | **git** |
| Alias | `https://samarket.vercel.app` · Ready |
| DB | `app_legal_documents` applied (seed published terms/privacy ko+en) |

## Delivered

| Item | Result |
|------|--------|
| SSOT `app_legal_documents` | PASS |
| Admin draft/publish `/admin/app/legal` | PASS |
| Guest/Member `GET /api/legal/{terms\|privacy}` | PASS |
| `/terms` · `/privacy` CMS read | PASS |
| version / effective_at | PASS (`2026-04-store-review`) |
| Consent writer regression | PASS (`STORE_*_VERSION` unchanged) |
| Authz member 403 / anon 401 | PASS |

## Runtime evidence

`.qa-logs/customer-platform-slice8-runtime-2026-08-06T09-16-44-140Z/`

## Out / next

- Business registration CMS → **Phase 2 · 별도 인가**
- FAQ · banners · popups · notices rewrite · Slice 1–7 reopen · CLI deploy
