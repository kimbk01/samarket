# iOS Capacitor App-target plugins — native registration authority

Status: **active contract** (2026-10-01, supersedes the 2026-08-04 `packageClassList` merge contract)

## Rule

App-target plugins (Swift `CAPBridgedPlugin` classes compiled into the App target, not npm packages)
are registered **in native code**:

`ios/App/App/DibayRootBridgeViewController.swift` → `capacitorDidLoad()` → `registerAppTargetPlugins()`
→ `bridge.registerPluginInstance(...)` for every entry of `makeAppTargetPlugins()`.

Same model as Android (`MainActivity.registerPlugin(...)`). Registration runs inside `loadView()`,
before `viewDidLoad()` → `loadWebView()`, so plugins are exported before the first document runs.

`ios/App/App/capacitor.config.json` → `packageClassList` is **CLI-generated only** (node_modules plugins)
and must **not** list App-target classes: a class in both places is loaded twice
(`registerPluginInstance` overrides and calls `load()` again).

**Single list:** `scripts/ios-app-target-plugins.mjs` → `IOS_APP_TARGET_PLUGIN_CLASSES`
(subsets: `IOS_CALL_OUTGOING_PLUGIN_CLASSES`, `IOS_AUTH_PLUGIN_CLASSES`, `IOS_DELIVERY_PLUGIN_CLASSES`,
`IOS_DEVICE_PLUGIN_CLASSES`). `checkIosAppTargetPluginRegistration()` verifies both sides.

## Why (root cause, 2026-10-01)

The Capacitor CLI writes `packageClassList` from node_modules on **every** `cap copy`, `cap update`
and `cap sync` (`generateIOSPackageJSON` in both copy and update; the update call is not awaited, so
a post-hook cannot reliably rewrite after it). App-target classes were only re-added by the
`cap:sync:ios` / `cap:sync:vercel` wrappers, so any plain `npx cap sync` shipped an iOS build without them:

| When | Symptom |
|---|---|
| `95e8100bc` (2026-07) | `Error loading plugin NativeCallService` → iOS outgoing calls broken |
| 2026-10-01 (Mac working tree, plain `cap sync`) | Google/Kakao login "앱 로그인 창을 열 수 없습니다" (`oauth_launcher_unavailable`), `Error loading plugin NativeCallService / DibayDeviceClass` |

Native registration removes the dependency on that generated file.

## Plugins

| Export | Domain | Classes | Contract |
|---|---|---|---|
| `IOS_CALL_OUTGOING_PLUGIN_CLASSES` | Call outgoing | `NativeCallServicePlugin`, `DibayVoipCallPlugin`, `DibayCallPipPlugin` | `docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md` |
| `IOS_AUTH_PLUGIN_CLASSES` | Auth | `NativeAppleAuthPlugin`, `NativeKakaoAuthPlugin`, `NativeOAuthLauncherPlugin` | `docs/auth-ios-native-oauth-launcher-contract.md` |
| `IOS_DELIVERY_PLUGIN_CLASSES` | Delivery / media | `DibayAppIconDeliveryPlugin`, `MessengerPhotoLibraryPlugin` | — |
| `IOS_DEVICE_PLUGIN_CLASSES` | Device class | `DibayDeviceClassPlugin` | — |

Adding an App-target plugin = Swift file in the App target + one line in `makeAppTargetPlugins()` +
one entry in the matching export. Nothing in `capacitor.config.json`.

## Sync

Any CLI command is safe: `npx cap sync`, `npx cap sync ios`, `npm run cap:sync`, `npm run cap:sync:ios`,
`npm run cap:sync:vercel:ios`. Nothing rewrites `capacitor.config.json` after the CLI.

## Verify

| Gate | Scope |
|---|---|
| `node scripts/ios-app-target-plugins.mjs` | all App-target plugins: registered natively, absent from `packageClassList` |
| `npm run verify:ios-call-package-classlist-contract` | Call outgoing subset |
| `npm run verify:ios-native-oauth-launcher-contract` | Auth `NativeOAuthLauncherPlugin` |
| `npm run verify:ios-apple-native-contract` | Apple native shell |

Device: Xcode console shows `[DibayRootBridge] app_target_plugins_registered count=9` and no
`Error loading plugin …` for these classes.

## DO NOT

- Add App-target classes to `packageClassList` or rewrite that file after the CLI
- Register an App-target plugin anywhere else (second authority)
- Treat a Vercel-only redeploy as restoring a missing native plugin (native rebuild required)
