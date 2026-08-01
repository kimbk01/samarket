# DIBAY Call iOS Outgoing — packageClassList HARD LOCK

Status: **HARD LOCK** (2026-07-28)

## Lock Statement

iOS Native outgoing establishment requires Capacitor Bridge registration of App-target plugins in `ios/App/App/capacitor.config.json` → `packageClassList`.

Without `NativeCallServicePlugin`, JS cannot load `NativeCallService` → `startNativeOutgoingEstablishment` / `caller_outgoing_start` never runs. **Incoming** (CallKit / VoIP) can still work while **outgoing** fails (iOS → Android APK).

## Regression (locked root cause)

| Item | Value |
|---|---|
| Bad commit | `95e8100bc` (`docs(startup): lock Local Runtime cutover P0 recovery`) |
| Change | Removed App-target entries from `packageClassList` |
| Symptom | `Error loading plugin NativeCallService`; POST `/calls` OK; `caller_outgoing_start` = 0 |
| Restore commit | `a8cc203ec` (`fix(ios): restore App-target plugins in packageClassList`) |
| Evidence | `.qa-logs/ios-ab-e785-4056/post-restore-verify/JUDGMENT-LOCK.md` |

## Locked required `packageClassList` entries

Must always include (order may vary; presence is required):

- `NativeCallServicePlugin` — outgoing handoff SSOT
- `DibayVoipCallPlugin`
- `DibayCallPipPlugin`
- `NativeAppleAuthPlugin`
- `NativeKakaoAuthPlugin`
- `DibayAppIconDeliveryPlugin` — iOS Delivery Adapter v1 (App Icon / SpringBoard)

Source of truth for the merge list: `scripts/patch-ios-capacitor-package-class-list.mjs` → `IOS_APP_TARGET_PACKAGE_CLASSES`.

## Sync contract (DO NOT bypass)

| Allowed | Forbidden |
|---|---|
| `npm run cap:sync:ios` (runs `npx cap sync ios` **then** patch) | Bare `npx cap sync ios` without patch (drops App-target plugins) |
| `npm run cap:sync:vercel` / `cap:sync:vercel:ios` (must call patch) | Committing `capacitor.config.json` with only node_modules plugins |
| Startup / Local Runtime docs-only commits | Touching `packageClassList` in docs/chore commits |

## Code Touch Boundary

Without explicit user approval, do **not**:

- Remove any locked plugin from `ios/App/App/capacitor.config.json` `packageClassList`
- Remove or weaken `scripts/patch-ios-capacitor-package-class-list.mjs`
- Change `package.json` `cap:sync:ios` to drop the post-sync patch
- Treat JS-only / Vercel web redeploy as a fix for this failure mode (native rebuild + reinstall required after list restore)

## Verification

```bash
npm run verify:ios-call-package-classlist-contract
npm run verify:ios-apple-native-contract
```

Device check after restore build:

- Embedded `App.app/capacitor.config.json` includes `NativeCallServicePlugin`
- Cap console has **no** `Error loading plugin NativeCallService`
- Outgoing dial reaches native `caller_outgoing_start` (or platform alias)

## Related

- O2 Android outgoing ownership: `docs/dibay-call-o2-outgoing-hard-lock.md`
- Native Runtime SSOT: `.cursor/rules/dibay-call-native-runtime-ssot.mdc`
- Cursor rule: `.cursor/rules/dibay-call-ios-outgoing-package-classlist-hard-lock.mdc`
