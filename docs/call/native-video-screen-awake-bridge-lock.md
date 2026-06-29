# DIBAY Native Video Screen Awake — Bridge LOCK (2026-06-29)

Status: **LOCK-SAFE bridge-only fix**

Baseline: `66c0a7a2` **ScreenAwakeBridge.java hardening only** (no Native Activity restore).

## Scope

| Layer | Path | Role |
|---|---|---|
| Lease + apply + retry | `android/.../call/ScreenAwakeBridge.java` | acquire on CONNECTED, bounded retry, reapply on resume |
| Resume target | `android/.../call/ResumedActivityTracker.java` | peek resumed Activity (read-only contract) |
| Acquire/release trigger | `android/.../nativevideo/NativeVideoCallRuntime.java` | CONNECTED acquire / terminal release (unchanged) |

## DO NOT MODIFY (without separate approval)

- `NativeVideoCallActivity.java` — no direct `FLAG_KEEP_SCREEN_ON`
- `NativeVoiceCallActivity.java`
- `NativeVideoCallRuntime.java` / `NativeVoiceCallRuntime.java` — incoming/FSI paths
- `IncomingCall*` / push / notification paths

## Apply contract

1. `acquire` → `applyToCurrentActivity` or `screen_awake_apply_missing_activity` + bounded retry (100/300/700 ms).
2. `onActivityResumed` → `reapply_on_resume` or fallback apply.
3. `release` / terminal cleanup only → `clearAppliedActivity` + cancel pending retries.
4. Owner transfer → previous Activity window clear allowed; lease clear only on release.

## Verify

```bash
npm run verify:screen-awake-bridge-contract
node .qa-logs/connected-video-screen-awake-qa.mjs  # device QA when available
```

## Log markers (PASS)

- `screen_awake_acquire`
- `screen_awake_apply_current_activity` or `screen_awake_apply_retry_success`
- `screen_awake_apply_missing_activity` (when no target at acquire)
- `screen_awake_apply_retry_scheduled` / `screen_awake_apply_retry_giveup`
- `screen_awake_release` (terminal/cleanup only)
