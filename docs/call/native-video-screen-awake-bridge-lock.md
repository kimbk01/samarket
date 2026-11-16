# DIBAY Native Video Screen Awake — Bridge LOCK (2026-06-29)

> **2026-11-17 규칙 확장 (Owner 승인 2026-11-17)** — 단일 정의는 `docs/audit/call-screen-awake-audit-2026-11-16.md` §4.
> 화면 유지 기준을 「연결된 영상」에서 **「통화 화면이 보이는 동안」(Telegram 동일)** 으로 넓혔다.
> - Android: `NativeVoiceCallActivity`·`NativeVideoCallActivity` 가 `CallScreenKeepAwakeHost` 로 자기 창에 유지 (음성 PiP·Dock 은 해제).
>   브리지는 아래 계약 그대로이며, 통화 화면 창 플래그를 지운 뒤에는 그 화면이 자기 규칙으로 다시 계산한다.
> - Android 근접: `call/NativeCallProximityOwner.java` (음성·수화기만).
> - iOS: `ScreenAwakeBridge.swift` = 통화 화면 표면(push/pop) + 연결 영상 lease 참조 계수.
> 아래 「DO NOT MODIFY」 의 두 Activity·`NativeVoiceCallRuntime` 은 이 승인 범위에서 위 목적으로만 바뀌었다.

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
