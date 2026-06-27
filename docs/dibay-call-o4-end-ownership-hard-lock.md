# DIBAY Call O4 End Ownership HARD LOCK

Status: **HARD LOCK** (2026-06-28)

## Lock Statement

O4 End Ownership HARD LOCK. Native-owned call terminal events are routed through a thin dispatcher into NativeVoiceCallRuntime / NativeVideoCallRuntime, and Runtime is the sole cleanup owner. Dispatcher does not own session, state, Agora, FGS, or cleanup. Voice local end, voice remote end, and video local end all reach runtime_cleanup_start → agora_native_disconnected → native_call_service_stop → cleanup_done.

## Scope

| In scope (LOCKED) | Out of scope (separate approval) |
|---|---|
| `NativeCallRuntimeEndDispatcher` thin routing | O2 establishment (join/create/handoff) |
| `NativeVoiceCallRuntime.onRemoteTerminal` / `cleanup` | O3 connected sync |
| `NativeVideoCallRuntime.onRemoteTerminal` / `cleanup` | Guard (`NativeCallEngineOwnership`) |
| `IncomingCallTerminalHandler` dispatch hook | Web/JS Agora fallback |
| `NativeCallServicePlugin.endCall` / `reportRemoteEnded` dispatch | CallV4Screen restore |
| Terminal → Runtime cleanup ownership | UI mixed into Runtime cleanup |

## Locked Scenarios (Product End Paths)

| Scenario | callId | Entry | Evidence |
|---|---|---|---|
| Voice local end | `e1f1908b-688e-4a37-9e0d-36160c5ca65e` | `NativeCallService.endCall` → `plugin_end_call` | `.qa-logs/o4-end-ownership-matrix/logcat-voice_local_end-e1f1908b-688e-4a37-9e0d-36160c5ca65e.txt` |
| Voice remote end | `be1cb22e-e699-4d81-8e83-ba35f408420e` | `terminal_received source=fcm:call_ended` | `.qa-logs/o4-end-ownership-matrix/logcat-voice_remote_end-be1cb22e-e699-4d81-8e83-ba35f408420e.txt` |
| Video local end | `2c78c263-a30c-4b5f-9314-7266f654b3d3` | `NativeCallService.endCall` → `runtime=video` | `.qa-logs/o4-end-ownership-matrix/logcat-video_local_end-2c78c263-a30c-4b5f-9314-7266f654b3d3.txt` |

Machine-readable bundle: `docs/artifacts/dibay-call-o4-end-ownership-hard-lock-evidence.json`

QA harness (not product proof for `end-all`): `.qa-logs/o4-end-ownership-matrix.mjs`

## Required PASS Chain (same callId, subject device)

Local end entry:

```
NativeCallService.endCall
  ↓ native_end_dispatch
  ↓ runtime_cleanup_start
  ↓ agora_native_disconnected
  ↓ native_call_service_stop
  ↓ cleanup_done
```

Remote end entry:

```
terminal_received
  ↓ native_end_dispatch
  ↓ runtime_cleanup_start
  ↓ agora_native_disconnected
  ↓ native_call_service_stop
  ↓ cleanup_done
```

Remote end proof must **not** be led by `call_heartbeat_timeout` alone. Voice remote lock run: `terminalSource=fcm:call_ended`, `heartbeatTimeoutLed=false`.

## O4 Architecture (fixed)

```
Terminal Event (FCM / plugin local end / terminal handler)
        ↓
NativeCallRuntimeEndDispatcher   ← thin router only
        ↓
NativeVoiceCallRuntime.onRemoteTerminal()
  or NativeVideoCallRuntime.onRemoteTerminal()
        ↓
Runtime.cleanup()
        ↓
Agora.leave()
        ↓
Native*CallService.stop()
        ↓
cleanup_done
```

**Dispatcher MUST NOT:** call `cleanup()`, `Agora.leave()`, `Service.stop()`, or own session/state/engine/FGS.

**Runtime MUST remain** the sole cleanup owner. No new intermediate states (e.g. `REMOTE_END_PENDING`, `CLEANUP_PENDING`).

## Code Touch Boundary (LOCKED files — no change without red-team approval)

- `android/app/src/main/java/com/dibay/app/nativecall/NativeCallRuntimeEndDispatcher.java`
- `android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java` (O4 cleanup path only)
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java` (O4 cleanup path only)
- `android/app/src/main/java/com/dibay/app/IncomingCallTerminalHandler.java` (dispatch hook)
- `android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java` (endCall/reportRemoteEnded dispatch)

Also locked by prior tracks:

- O2: `Native*CallAgoraEngine` join/create, `NativeCallEngineOwnership`, outgoing handoff/quarantine
- O3: native connected sync bridge files

## Verification

```bash
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
node .qa-logs/o4-end-ownership-matrix.mjs
```

Single scenario:

```bash
O4_SCENARIO=voice_remote_end node .qa-logs/o4-end-ownership-matrix.mjs
```

## Next Track

Native UI (Dialing → Incoming → Connecting → Connected → Voice/Video apply → PiP → Dock). UI must **render Runtime state only** and must not re-open O4 cleanup paths. See `docs/dibay-native-call-ui-design.md`.
