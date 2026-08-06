# Slice 10 — Dead Cleanup STATUS

```text
SLICE 1–9 LOCKED (유지)
SLICE 10 DEAD CLEANUP AUTHORIZED
SLICE 10 PHASE 1 INVENTORY APPROVED
SLICE 10 PHASE 1 INVENTORY PASS
SLICE 11–12 NOT AUTHORIZED
DELETES THIS PHASE: 0
```

## Inventory artifact

- Script: `scripts/qa/slice10-dead-cleanup-inventory.mjs`
- JSON (linked): [`slice10-phase1-inventory.json`](./slice10-phase1-inventory.json)
- Run log: `.qa-logs/customer-platform-slice10-inventory-*/`

## Classification counts

| Class | IDs |
|-------|-----|
| KEEP | `logout_multi_entry` |
| MERGE_CANDIDATE | `MyProfileCard` (type `AddressDefaultsFlags` still imported from file) |
| DEPRECATE_CANDIDATE | `MyInfoProfileSection`, `trade_legacy_routes` |
| DEAD_CANDIDATE | `MypageInstagramView`, `SettingsMainContent`, `MyPageConsole`, `MyPageContent`, `MyInfoProfileCard`, `MyInfoProfileHubCard`, `MyInfoMiniProfile`, `ProfileCard_mypage`, `ProfileCard_my` |
| DEAD_PROVEN | *(none — Phase 1 forbid for named live-reference candidates; bundle symbol NOT_SCANNED)* |

## Why named candidates are not DEAD_PROVEN

| Candidate | Why references still “alive” |
|-----------|------------------------------|
| MypageInstagramView | No product JSX importer; `verify-mypage-authority-contract.mjs` reads file; owns Settings/Logout subtree |
| SettingsMainContent | Rendered only inside `MypageInstagramView` settings sheet |
| MyPageConsole | Component unused; **`MyPageConsoleProps` type** still used by ItemScreen/tabs |
| MyInfoProfileCard | No TSX importer; catalog comment + disk file; replaced by `MypageProfileSummary` |
| MyProfileCard | Component unused; **type imports** of `AddressDefaultsFlags` from this path (SSOT should be `lib/my/address-defaults-types.ts`) |

## Replacement Runtime evidence

| Domain | Evidence |
|--------|----------|
| Hub | Slice 3 UI RUNTIME LOCK + Slice 9 MULTIPLATFORM RUNTIME LOCK — `MyContent` → `MyPageHomeDashboard` |
| Trade activity | Slice 5 ACTIVITY LOCK — `/mypage/trade/*` |
| Logout | Slice 3 modal MOVE + Slice 6 ACCOUNT — `MyInfoAccountMenuSection` |

## Phase 2 delete proposal (NOT AUTHORIZED)

Requires separate approval + verify-script rewrite + type import migrate + bundle scan before any DEAD_PROVEN:

1. `components/my/mypage/MypageInstagramView.tsx` (blocker: verify script)
2. `components/my/settings/SettingsMainContent.tsx` (requires 1)
3. `components/mypage/MyPageConsole.tsx` (keep/rename `MyPageConsoleProps` first or with merge)
4. `components/mypage/MyPageContent.tsx` (requires 3)
5. `components/mypage/myinfo/MyInfoProfileCard.tsx`
6. `components/mypage/myinfo/MyInfoProfileHubCard.tsx`
7. `components/mypage/myinfo/MyInfoMiniProfile.tsx`
8. `components/mypage/ProfileCard.tsx`
9. `components/my/ProfileCard.tsx`

**MERGE first (not delete):** `components/my/MyProfileCard.tsx` — migrate `AddressDefaultsFlags` imports → `lib/my/address-defaults-types.ts`.

**Not in Phase 2 delete list:** `trade_legacy_routes` (compat redirects), logout canonical CTAs (KEEP).

## Out of scope

Product code · route · redirect · i18n changes · Slice 11–12
