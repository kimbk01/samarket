# DIBAY Call Track ③ Dead Code Cleanup HARD LOCK

Status: **HARD LOCK** (2026-06-28, Track ③)

## Lock Statement

Track ③ removes **Android Legacy Web establishment dead code** that cannot execute after Track ① sync-only shutdown. No new structure was added. Desktop Web establishment (`CallV4Screen`, JS Agora, presentation stack) is **preserved**. Native Runtime, O2, O3, O4, Native UI, PiP, and Dock are **unchanged**.

## Fixed Baseline (do not reopen)

| Layer | Status |
|---|---|
| Native Runtime HARD LOCK | LOCK |
| Track ① Legacy Web Shutdown | LOCK |
| Track ② O3 Connected Ownership | LOCK |
| O2 Outgoing / O4 End / Voice UI / Video UI / PiP / Dock | LOCK |

## PR Scope (3 PRs — no scope expansion)

| PR | Action | Product code |
|---|---|---|
| PR-1 | Slim 4 core V4 files — Android `isLegacyWebCallEstablishmentRemoved()` dead-branch removal; sync-only provider | TS only (established path) |
| PR-2 | Physical delete of 6 dead files + minimal import/test cleanup | TS only (orphan removal) |
| PR-3 | Verify scripts, import-guard, LOCK doc, evidence, doc sync | **None** — docs/verify/tests only |

## Removed (Android — dead after sync-only)

| File | Reason |
|---|---|
| `lib/call/native/native-owned-web-v4-ui-guard.ts` | P2-3 quarantine guard — superseded by Track ① sync-only |
| `lib/call/__tests__/native-owned-web-v4-ui-guard.test.ts` | Guard unit test |
| `lib/community-messenger/call-v4/call-v4-pure-web-incoming-contract.ts` | Orphan re-export barrel |
| `lib/community-messenger/call-v4/call-v4-route-leave-dock.ts` | Orphan deprecated no-op re-export |
| `lib/community-messenger/call-v4/call-v4-pip-presentation.ts` | Orphan re-export barrel (zero importers) |
| `scripts/verify-call-v4-phase6-android.cjs` | Unused verify script (not in `package.json`) |

**Removed references:** `resolveNativeOwnedWebV4UiBlock`, `peekNativeOwnedWebV4UiBlockSync`, `webUiAllowed`, `native_owned_ui_forbidden`, `router_replace_calls_v4_accept_skipped_native_owned`.

## Preserved (Desktop / non-Android establishment)

- `CallV4Screen.tsx`, `call-v4-agora.ts`, presentation stack, handoff modules
- `/calls-v4` route (Desktop establishment)
- `CallV4Provider` sync-only on Android; full establishment host on Desktop
- `MainActivity` P2-4 replay suppression markers (native-owned gate — not Legacy establishment)

## Static Verification (PR-3 PASS criteria)

```bash
npx tsc --noEmit
npx vitest run lib/community-messenger/call-v4/__tests__/call-v4-import-guard.test.ts \
  components/community-messenger/call-v4/__tests__/call-v4-provider-native-route.test.ts \
  lib/community-messenger/call-v4/__tests__/call-v4-foreground-resume.test.ts \
  lib/call/__tests__/native-connected-sync.test.ts
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
```

Machine-readable bundle: `docs/artifacts/dibay-call-track3-dead-code-cleanup-evidence.json`

## Forbidden After Lock

Without explicit red-team approval:

- Restore P2-3 guard or deleted orphan barrels
- Re-introduce Android Web V4 UI mount / foreground resume restore
- Expand deletion to Desktop establishment stack
- Modify Runtime / O2 / O3 / O4 / Native UI / PiP / Dock under Track ③ excuse

## Next Track

**Track ④ Final Regression** — run `.qa-logs/native-call-final-regression.mjs` **once** after Track ③ commit bundle, then Native Telegram Runtime project **full HARD LOCK** end.
