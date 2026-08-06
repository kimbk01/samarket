# Slice 10 — Dead Cleanup STATUS

```text
SLICE 1–9 LOCKED (유지)
SLICE 10 PHASE 1 INVENTORY PASS
SLICE 10 PHASE 2 BUNDLE A PASS (type SSOT)
SLICE 10 PHASE 2 BUNDLE B PASS
SLICE 10 PHASE 2 BUNDLE C PASS
  - InstagramView + SettingsMainContent DEAD_PROVEN + deleted
  - MyPageConsole + MyPageContent DEAD_PROVEN + deleted
  - MyProfileCard shim DEAD_PROVEN + deleted
  - MyPageConsoleProps remains in types.ts (live)
SLICE 11–12 NOT AUTHORIZED
```

## Bundle C deletes (DEAD_PROVEN)

| File | Evidence |
|------|----------|
| `MypageInstagramView.tsx` | product value-import 0; verify no longer file-reads; hub = `MyContent`→`MyPageHomeDashboard` |
| `SettingsMainContent.tsx` | only importer was InstagramView; app settings routes do not import it |
| `MyPageConsole.tsx` | component value-import 0; `MyPageConsoleProps` is in `types.ts` only |
| `MyPageContent.tsx` | only importer was MyPageConsole |
| `MyProfileCard.tsx` | component + deprecated re-export unused; AddressDefaultsFlags SSOT = `lib/my/address-defaults-types.ts` |

## Still open (not deleted)

| Item | Status |
|------|--------|
| `logout_multi_entry` | KEEP |
| `trade_legacy_routes` | DEPRECATE_CANDIDATE |
| `MyPageConsoleProps` (type name in `types.ts`) | LIVE — rename out of Bundle C scope |

## Gates

- `npm run verify:mypage-authority-contract` PASS
- Inventory: [`slice10-phase1-inventory.json`](./slice10-phase1-inventory.json)

## Next (NOT AUTHORIZED)

Slice 11 Product Runtime Regression · Slice 12 PRODUCT PASS / HARD LOCK
