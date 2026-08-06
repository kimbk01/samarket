# Slice 10 — Dead Cleanup STATUS

```text
SLICE 1–9 LOCKED (유지)
SLICE 10 PHASE 1 INVENTORY PASS
SLICE 10 PHASE 2 BUNDLE A PASS (type SSOT)
SLICE 10 PHASE 2 BUNDLE B PASS
  - verify legacy file-read removed
  - simplest orphans DEAD_PROVEN + deleted
SLICE 11–12 NOT AUTHORIZED
```

## Bundle B deletes (DEAD_PROVEN)

| File | Evidence |
|------|----------|
| `MyInfoProfileSection.tsx` | verify read removed; static importer 0; bundle 0 |
| `MyInfoProfileHubCard.tsx` | static 0; bundle 0 |
| `MyInfoMiniProfile.tsx` | static 0; bundle 0 |
| `MyInfoProfileCard.tsx` | static 0; catalog comment renamed (was false bundle hit) |
| `components/mypage/ProfileCard.tsx` | path importer 0 |
| `components/my/ProfileCard.tsx` | path importer 0 |

## Bundle B non-deletes (still open)

| Item | Status |
|------|--------|
| `MypageInstagramView` + `SettingsMainContent` | DEAD_CANDIDATE (coupled) |
| `MyPageConsole` + `MyPageContent` | DEAD_CANDIDATE (`MyPageConsoleProps` still live) |
| `MyProfileCard` shim | MERGE leftover re-export |
| `logout_multi_entry` | KEEP |
| `trade_legacy_routes` | DEPRECATE_CANDIDATE |

## Gates

- `npm run verify:mypage-authority-contract` PASS
- Inventory: [`slice10-phase1-inventory.json`](./slice10-phase1-inventory.json)

## Next (NOT AUTHORIZED)

InstagramView+Settings · Console Props rename · MyProfileCard shim remove · Slice 11–12
