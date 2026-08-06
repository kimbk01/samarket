# Slice 8 — CMS STATUS

## Phase 1 Legal — LOCKED

```text
SLICE 8 LEGAL CMS PHASE 1 LOCK
```

| Item | Value |
|------|-------|
| Product + LOCK SHA | `bbc23787f2269f44e4f3472c7e997098fe4e5f31` |
| Deploy | `dpl_fm6RtnqvwVXSJizRr2G9uL39MSrW` · source=`git` |
| SSOT | `app_legal_documents` |

## Phase 2 Business — LOCKED

```text
SLICE 8 BUSINESS CMS PHASE 2 AUTHORIZED
SLICE 8 BUSINESS CMS PHASE 2 CODE LOCKED
SLICE 8 BUSINESS CMS PHASE 2 DEPLOYED (Git Auto Deploy)
SLICE 8 BUSINESS CMS PHASE 2 RUNTIME PASS
SLICE 8 BUSINESS CMS PHASE 2 LOCK
```

| Item | Detail |
|------|--------|
| Product SHA | `170c92900f5758fdf15d61c132293ea846cea83c` |
| Deploy | `dpl_93zyXzJPDTTZ11jhLCS88jboQUYa` · Ready · source=`git` |
| Alias | `https://samarket.vercel.app` |
| SSOT | `app_platform_business_info` (≠ Legal · ≠ Notices) |
| Migration | `20261019130000_app_platform_business_info.sql` applied |
| Admin | `/admin/app/business` · authz member 403 |
| Public | `GET /api/business-info` · `/business-info` · company `dibaY` |
| Member menu | MyPage support → `/business-info` |
| Consent | unchanged |
| Legal isolation | PASS |

## Runtime evidence

`.qa-logs/customer-platform-slice8p2-runtime-2026-08-06T09-33-47-881Z/`

## Out of scope (다음 인가 필요)

FAQ · banners · popups · notices rewrite · Slice 1–7 reopen · CLI deploy · Auth/Messenger/Call/Badge
