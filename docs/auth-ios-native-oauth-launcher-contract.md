# Auth — iOS NativeOAuthLauncher (ASWebAuthenticationSession)

Status: **active contract** (2026-08-04)

## Purpose

Complete the empty iOS owner of the shared native OAuth launcher contract.
Android already implements `NativeOAuthLauncher` via Custom Tabs.
iOS sole implementation: **ASWebAuthenticationSession**.

This is **not** a new Google Auth path.

## Authority chain (Google iOS)

```text
web_oauth_start
→ GET /api/auth/oauth/start
→ NativeOAuthLauncher.open
→ ASWebAuthenticationSession
→ capacitor-return
→ dibay://auth/callback
→ OAuthReturnListener
→ /auth/callback
→ Supabase session → profile/onboarding → navigation
```

## Registration (must not drop)

| Item | Location |
|---|---|
| Swift plugin | `ios/App/App/Plugins/NativeOAuthLauncherPlugin.swift` |
| Xcode Sources | `ios/App/App.xcodeproj/project.pbxproj` |
| packageClassList | `NativeOAuthLauncherPlugin` in `ios/App/App/capacitor.config.json` |
| Merge SSOT | `IOS_AUTH_PACKAGE_CLASSES` in `scripts/patch-ios-capacitor-package-class-list.mjs` |

Common merge authority: `docs/ios-capacitor-app-target-package-classlist.md`.
**Call HARD LOCK docs must not own this plugin.**

## Launcher responsibilities

Allowed:

- Open authorize URL in ASWebAuthenticationSession
- `callbackURLScheme = dibay`
- Strong-retain session; single settle per attempt
- Resolve Promise with `callbackUrl` (`dibay://auth/callback…`) on success

Forbidden in launcher completion:

- Direct WebView `/auth/callback` navigation from Swift
- Supabase exchange
- profile / onboarding
- router navigation
- logging authorization code / URL query / tokens / email

JS after resolve (`openNativeOAuthTab`) must call `deliverNativeOAuthReturnUrl`
(same owner as `OAuthReturnListener` / `appUrlOpen`). ASWebAuth does **not**
reliably re-emit Capacitor `appUrlOpen` for the callback URL.

Session completion authority remains the shared return bridge → `/auth/callback`.

## Verify

```bash
npm run verify:ios-native-oauth-launcher-contract
```

## Related

- Call outgoing HARD LOCK (separate): `docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md`
- Common packageClassList merge: `docs/ios-capacitor-app-target-package-classlist.md`
