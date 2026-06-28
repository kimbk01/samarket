# DIBAY Call O3 Connected Ownership HARD LOCK

Status: **HARD LOCK** (2026-06-28, Track ②)

## Lock Statement

O3 Connected Ownership HARD LOCK. After Native Runtime reaches `state_connected`, native emits `native_connected_emit` and Web hydrates via sync-only path (`native_connected_received` → store hydrate → ops start → heartbeat/terminal watch → ops done). Web does not establish media (`agora_join_success`, `markCallV4MediaConnected`, `CallV4Screen` = 0). Native-owned FGS for Web establishment is forbidden (`CallForegroundService_start` = 0).

## Fixed Baseline (do not reopen)

| Layer | Status |
|---|---|
| Native Runtime HARD LOCK | LOCK |
| O2 Outgoing Establishment | LOCK |
| Legacy Web Shutdown (Track ①) | LOCK |
| O4 End / Cleanup | LOCK |

## Scope

| In scope (LOCKED) | Out of scope (separate approval) |
|---|---|
| Native connected emit (`NativeCallServicePlugin.publishNativeConnected`) | O2 join/create/handoff |
| Web sync-only connected ops (`startNativeConnectedSync`, `markCallV4NativeConnectedOps`) | End / Cleanup ownership |
| Heartbeat + remote terminal watch start on connected | Native UI / PiP / Dock |
| 4 mandatory O3 scenarios (voice/video outgoing + incoming) | Legacy Web establishment restore |

## Locked Scenarios (4/4 PASS — 2026-06-28)

APK baseline: post–Track-① debug build at `52d76d9b`. `CAPACITOR_SERVER_URL=http://192.168.100.83:3000`. Devices A=`8b37179f7d94` B=`RRGL4046NTW`.

| Scenario | callId | Evidence |
|---|---|---|
| o2_voice_outgoing | `cead29d3-6589-40e4-bd9f-4b67e8f14e40` | `.qa-logs/o3-connected-device-qa/logcat-o2_voice_outgoing-cead29d3-6589-40e4-bd9f-4b67e8f14e40.txt` |
| o2_video_outgoing | `4cbaa669-92a4-468e-98d4-620355c77224` | `.qa-logs/o3-connected-device-qa/logcat-o2_video_outgoing-4cbaa669-92a4-468e-98d4-620355c77224.txt` |
| native_voice_incoming | `52913eb8-7bc2-4228-9613-870b80fe00d2` | `.qa-logs/o3-connected-device-qa/logcat-native_voice_incoming-52913eb8-7bc2-4228-9613-870b80fe00d2.txt` |
| native_video_incoming | `98d6aa99-8996-4484-a5cb-a27fdbb70cac` | `.qa-logs/o3-connected-device-qa/logcat-native_video_incoming-98d6aa99-8996-4484-a5cb-a27fdbb70cac.txt` |

Machine-readable bundle: `docs/artifacts/dibay-call-o3-connected-ownership-evidence.json`

QA harness: `.qa-logs/o3-connected-device-qa.mjs`

### Harness note (full matrix vs video standalone)

Full 4-scenario matrix run (`report.json`, `overallPass: false`) failed at `voice_product_cleanup_prereq` before `o2_video_outgoing` started — **harness voice→video handoff precondition, not O3 product FAIL**. Red-team ruling: 3 executed scenarios had full O3 chains PASS; `o2_video_outgoing` validated separately via standalone run (`O3_VIDEO_OUTGOING_ONLY=1`, `report-video-outgoing-only.json`).

## Required PASS Chain (per locked callId)

Native (≥1 each):

```
state_connected → native_connected_emit → active_call_connected
```

Web sync (≥1 each):

```
native_connected_received
  → native_connected_store_hydrate
  → native_connected_ops_start
  → call_heartbeat_watchdog_start
  → remote_terminal_watch_start
  → native_connected_ops_done
```

## Forbidden Markers (0 per locked callId)

- `route_to_screen`
- `outgoing_ringing`
- `screen_mounted`
- Web `agora_join_success` (JS; native `agora_native_join_success` allowed)
- `markCallV4MediaConnected`
- native-owned `CallForegroundService` start (Web establishment FGS)

## Code Touch Boundary (LOCKED files — no change without red-team approval)

- `android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java` (`publishNativeConnected`)
- `android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallBridge.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallBridge.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java` (onConnected hooks)
- `lib/call/native/native-connected-sync.ts`
- `lib/community-messenger/call-v4/call-v4-phase-bridge.ts` (`markCallV4NativeConnectedOps`)
- `components/layout/providers/CallV4Provider.tsx` (`startNativeConnectedSync` sync-only path)

## Verification

```bash
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
```

Device O3 QA (red-team approval only — do not repeat full matrix without cause):

```bash
# Full 4-scenario matrix
CAPACITOR_SERVER_URL=http://192.168.100.83:3000 node .qa-logs/o3-connected-device-qa.mjs

# Video outgoing standalone (isolated handoff bypass)
O3_VIDEO_OUTGOING_ONLY=1 CAPACITOR_SERVER_URL=http://192.168.100.83:3000 node .qa-logs/o3-connected-device-qa.mjs
```

## Next Track

**Track ④ Final Regression** — run `.qa-logs/native-call-final-regression.mjs` once after Track ③ commit bundle → Native Call full HARD LOCK end.

Track ③ Dead code cleanup: **LOCK** — `docs/dibay-call-track3-dead-code-cleanup-lock.md`
