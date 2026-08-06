# Slice 10 — Dead Cleanup STATUS

```text
SLICE 1–9 LOCKED (유지)
SLICE 10 DEAD CLEANUP AUTHORIZED
SLICE 10 PHASE 1 INVENTORY PASS
SLICE 10 PHASE 2 BUNDLE A AUTHORIZED — type SSOT MERGE
SLICE 10 PHASE 2 BUNDLE A PASS (AddressDefaultsFlags → lib/my/address-defaults-types)
SLICE 11–12 NOT AUTHORIZED
DELETES THIS PHASE: 0
DEAD_PROVEN: 0
```

## Inventory artifact

- Script: `scripts/qa/slice10-dead-cleanup-inventory.mjs`
- JSON: [`slice10-phase1-inventory.json`](./slice10-phase1-inventory.json)

## Phase 2 Bundle A (done)

| Change | Result |
|--------|--------|
| `AddressDefaultsFlags` SSOT | `lib/my/address-defaults-types.ts` only |
| Callers migrated | `components/mypage/types.ts`, `lib/my/load-mypage-hub-extras-server.ts`, `MypageInstagramView.tsx` |
| `MyProfileCard.tsx` | re-export deprecated shim; duplicate type removed |
| Product imports of `@/components/my/MyProfileCard` | **0** (comment-only leftover in onboarding) |

## Next Phase 2 bundles (NOT AUTHORIZED until asked)

1. verify 스크립트 레거시 파일 의존 제거
2. 가장 단순한 DEAD_CANDIDATE 묶음 (HubCard / MiniProfile / ProfileCard×2)
3. InstagramView + SettingsMainContent
4. MyPageConsole + MyPageContent (+ Props rename)
5. bundle symbol → DEAD_PROVEN → delete → build/runtime

## Out of scope still

일괄 삭제 · Slice 11–12 · logout KEEP · trade legacy DEPRECATE 정책
