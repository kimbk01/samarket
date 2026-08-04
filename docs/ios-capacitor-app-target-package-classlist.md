# iOS Capacitor App-target `packageClassList` — common merge authority

Status: **active contract** (2026-08-04)

## Role

`npx cap sync ios` overwrites `ios/App/App/capacitor.config.json` → `packageClassList`
with node_modules plugins only. App-target `CAPBridgedPlugin` classes must be merged back.

**Single merge SSOT:** `scripts/patch-ios-capacitor-package-class-list.mjs`
→ export `IOS_APP_TARGET_PACKAGE_CLASSES`

This is the cross-domain registration authority (Call + Auth + Delivery).
Domain HARD LOCK / Auth contracts reference subsets; they do not maintain a second merge list.

## Domain subsets

| Export | Domain | Contract |
|---|---|---|
| `IOS_CALL_OUTGOING_PACKAGE_CLASSES` | Call outgoing | `docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md` |
| `IOS_AUTH_PACKAGE_CLASSES` | Auth | Apple/Kakao native contracts + `docs/auth-ios-native-oauth-launcher-contract.md` |
| `IOS_DELIVERY_PACKAGE_CLASSES` | Delivery | App Icon delivery |

## Sync

```bash
npm run cap:sync:ios
# = npx cap sync ios && node scripts/patch-ios-capacitor-package-class-list.mjs
```

## Verify

| Gate | Scope |
|---|---|
| `npm run verify:ios-call-package-classlist-contract` | Call outgoing subset + sync hooks |
| `npm run verify:ios-native-oauth-launcher-contract` | Auth `NativeOAuthLauncherPlugin` |
| `npm run verify:ios-apple-native-contract` | Apple native shell |

## DO NOT

- Put Auth launcher ownership inside Call HARD LOCK docs/rules
- Bypass the patch after `cap sync ios`
- Treat Vercel-only redeploy as restoring a missing App-target plugin
