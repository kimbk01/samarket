# DIBAY Call iOS Outgoing — packageClassList HARD LOCK

Status: **HARD LOCK** (2026-07-28)

## Lock Statement

iOS Native **outgoing call** establishment requires Capacitor Bridge registration of the
Call App-target plugins. Since 2026-10-01 they are registered **natively** in
`DibayRootBridgeViewController.makeAppTargetPlugins()` (`docs/ios-capacitor-app-target-package-classlist.md`);
`ios/App/App/capacitor.config.json` → `packageClassList` is CLI-generated and must not list them.

Without `NativeCallServicePlugin`, JS cannot load `NativeCallService` →
`startNativeOutgoingEstablishment` / `caller_outgoing_start` never runs.
**Incoming** (CallKit / VoIP) can still work while **outgoing** fails (iOS → Android APK).

This HARD LOCK owns **Call outgoing plugins only**. Auth / Delivery plugin registration
is documented elsewhere and must not be embedded here.

## Regression (locked root cause)

| Item | Value |
|---|---|
| Bad commit | `95e8100bc` (`docs(startup): lock Local Runtime cutover P0 recovery`) |
| Change | Removed App-target entries from `packageClassList` |
| Symptom | `Error loading plugin NativeCallService`; POST `/calls` OK; `caller_outgoing_start` = 0 |
| Restore commit | `a8cc203ec` (`fix(ios): restore App-target plugins in packageClassList`) |
| Evidence | `.qa-logs/ios-ab-e785-4056/post-restore-verify/JUDGMENT-LOCK.md` |
| Recurrence | 2026-10-01 plain `cap sync` on the Mac → same loss (+ Auth/Device). Root fix: native registration |

## Locked required native registrations (Call outgoing)

`makeAppTargetPlugins()` must always register:

- `NativeCallServicePlugin` — outgoing handoff SSOT
- `DibayVoipCallPlugin`
- `DibayCallPipPlugin`

Source export: `IOS_CALL_OUTGOING_PLUGIN_CLASSES` in `scripts/ios-app-target-plugins.mjs`.

Full App-target list (Call + Auth + Delivery + Device):
`docs/ios-capacitor-app-target-package-classlist.md`.

## Sync contract (DO NOT bypass)

| Allowed | Forbidden |
|---|---|
| Any `cap sync` / `cap copy` / `cap update` (the CLI-generated `packageClassList` is correct as is) | Adding Call plugins back into `packageClassList` (double load) |
| `npm run cap:sync:ios` / `cap:sync:vercel:ios` (verify registration) | Registering Call plugins anywhere other than `makeAppTargetPlugins()` |

## Code Touch Boundary

Without explicit user approval, do **not**:

- Remove any Call locked plugin from `DibayRootBridgeViewController.makeAppTargetPlugins()`
- Remove or weaken `scripts/ios-app-target-plugins.mjs` / its verification
- Treat JS-only / Vercel web redeploy as a fix for this failure mode (native rebuild + reinstall required after list restore)
- Embed Auth launcher (`NativeOAuthLauncherPlugin`) ownership in this Call HARD LOCK

## Verification

```bash
npm run verify:ios-call-package-classlist-contract
```

Device check after restore build:

- Xcode console: `[DibayRootBridge] app_target_plugins_registered count=9`
- Cap console has **no** `Error loading plugin NativeCallService`
- Outgoing dial reaches native `caller_outgoing_start` (or platform alias)

## Related

- Common App-target registration: `docs/ios-capacitor-app-target-package-classlist.md`
- Auth iOS OAuth launcher: `docs/auth-ios-native-oauth-launcher-contract.md`
- O2 Android outgoing ownership: `docs/dibay-call-o2-outgoing-hard-lock.md`
- Native Runtime SSOT: `.cursor/rules/dibay-call-native-runtime-ssot.mdc`
- Cursor rule: `.cursor/rules/dibay-call-ios-outgoing-package-classlist-hard-lock.mdc`
