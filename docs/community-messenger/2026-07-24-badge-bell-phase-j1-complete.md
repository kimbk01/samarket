# Phase J1 — Legacy noop removal (call-0 proof)

**Status:** `PASS — PHASE J1 LEGACY NOOP REMOVAL VERIFIED` (승인 잠금 · 재개 불필요)  
**Parent LOCK:** `2026-07-24-badge-notification-domain-authority-lock.md`  
**Date:** 2026-07-24  
**Scope:** delete-ready proof only — **no** Bell/Bottom/App Icon/Projection/Target/loader/Push/Read formula changes.

---

## Deleted (after call-0)

| Symbol / path | Evidence |
|---------------|----------|
| `syncTier1HeaderInboxUnreadFromRows` | callers stripped from `PhilifeHeaderNotificationInbox.tsx`; export removed |
| `computeTier1HeaderInboxDisplayUnread` | export removed; legacy test block removed |
| `tier1-admin-notice-bell-supplement.ts` | file deleted (+ unit test) |
| `applyCommunityMessengerUnreadOptimistic` | export removed from `owner-hub-badge-store.ts` |

## Kept (LOCKED)

- `resolveTier1HeaderBellBadgeTotal` — Header Bell Domain total only
- Domain snapshot writer / projection / Bottom GD+group / App Icon independent path

## Call-0 proof

Product scan (`app|components|hooks|lib|services`, registry allowlist excluded): **0 matches** for deleted symbols/calls.

```bash
npm run verify:badge-import-ban   # PASS
```

## Import ban

- Script: `scripts/verify-badge-import-ban.mjs`
- npm: `verify:badge-import-ban`

## Registry

- `PHASE_H_QUARANTINE_CANDIDATES` R1+R4 → `deleted`
- `HUB_R1_R4_MEASUREMENT` R1+R4 → `verdict: deleted`

## Gate results (J1)

| Gate | Result |
|------|--------|
| `verify:badge-import-ban` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Bell tests (`tier1-header-inbox-sync`, `bell-domain-projection-authority`, `bell-app-icon-separation`) | PASS |
| Bottom test (`bottom-chat-live-room-count`) | PASS |
| Phase H / R1–R4 measurement tests | PASS |

Note: `verify:chat-domain-file-lock` still FAILs on pre-existing `FORBIDDEN_RESTORE` entries that now include LOCK keepers (e.g. `build-notification-badge-projection.ts`). **Not introduced by J1**; left untouched (out of J1 unlock scope).

## Non-goals (still deferred — J2 not approved)

- J2 75s surface poll
- J3 Push → Domain appIconTotal
- J4 unused hooks
