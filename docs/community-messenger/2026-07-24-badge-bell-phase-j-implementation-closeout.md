# Phase J — Final Implementation Report (code / static closeout)

**Date:** 2026-07-24  
**Baseline HEAD (pre-commit):** `ada4104aa`  
**Verdict (this closeout):**

```
PASS — PHASE J CODE / STATIC GATES / LEGACY REMOVAL COMPLETE
RUNTIME LOCK — PENDING FINAL TWO-DEVICE QA
```

**Forbidden for this closeout (do not claim):**

- `PASS — PHASE J LEGACY REMOVAL VERIFIED`
- `PASS — BADGE / NOTIFICATION DOMAIN INFRASTRUCTURE LOCKED`

---

## Confirmed prior verdicts

| Verdict | Status |
|---------|--------|
| BADGE / NOTIFICATION DOMAIN AUTHORITY LOCKED | PASS |
| PHASE J1 LEGACY NOOP REMOVAL VERIFIED | PASS |
| PHASE J2A LEGACY SURFACE BADGE POLL REMOVAL VERIFIED | PASS |
| PHASE J3 APP ICON LEGACY AUTHORITY REMOVAL VERIFIED | PASS |
| PHASE J4 UNUSED BADGE PATH REMOVAL VERIFIED | PASS |
| Residual Review (delete targets = 0) | PASS |
| Final Phase J LOCK (runtime) | **PENDING** 2-device QA |

---

## Frozen formulas (unchanged except Bell Contract B 2026-07-25)

- Header Bell = `unreadApprovedNotificationEvents` (`badge-count.total` / event inbox)
- Bottom Chat = `general_direct` + `group` unread room count
- App Icon / Push badge = Domain `appIconTotal` (GD+group+trade+customer SO+owner SO+orphan)
- Customer order hub = `storeOrderCustomerUnreadRooms` / `buyerOrderAttention`
- Owner store FAB = store-scoped `storeOrderChatUnread` (not global Domain overwrite)
- Target Domain snapshot writer/RPC · Domain loaders · NativeBadgeSync
- List 75s · Domain 45s · Hub 180s · Push sound/banner · Atomic Read
- R-SO-DUAL / R-TRADE-MULTI track-only

---

## Residual (not delete targets)

| ID | Classification |
|----|----------------|
| R-INBOX-BRIDGE | Active inbox list/read adapter |
| R-LIST-75 | Active notification list poll |
| R-SO-DUAL | Product semantics track |
| R-TRADE-MULTI | QA/clear-scope track |

---

## Static gates (closeout run)

| Gate | Result | Note |
|------|--------|------|
| `verify:badge-import-ban` | PASS | Legacy product call / forbidden import 0 |
| Related Bell / Bottom / App Icon / Domain tests | PASS | See commit CI notes |
| `npx tsc --noEmit` | PASS | |
| `npm run lint` | PASS | |
| `npm run verify:i18n-key-exposure` | PASS | |
| `npm run build` | PASS | |
| `verify:chat-domain-file-lock` | **EXISTING FAIL** | `FORBIDDEN_RESTORE` paths already present on `origin/main` at `ada4104aa`; not introduced by Phase J R1 export-ban. Do not “fix” by deleting Domain authority modules. |

---

## Next (separate work)

Xiaomi + Samsung final regression — `2026-07-24-badge-bell-phase-j-final-qa.md`  
Only after that + explicit approval: Phase J LOCK / Infrastructure LOCK.
