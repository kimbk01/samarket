# Native Incoming Accept Routing QA

Release 2 Final Gate uses **P0 only**. Banner/shade scenarios stay as **non-blocking reference** tests.

Aligned with Telegram UX on the same Samsung device: primary Accept path is **Native Incoming Activity in-app Accept**, not notification shade actions.

## Prerequisites

- Device A (`P4_DEVICE_A`): caller — dial from community messenger
- Device B (`P4_DEVICE_B`): callee — receives FCM / native incoming
- Debug APK installed on both; `.env.local` Supabase + `E2E_TEST_PASSWORD`
- Runtime files unchanged: `NativeVoiceCallRuntime.java`, `NativeVideoCallRuntime.java` (script exits 2 if diff)

## Tier definitions

### P0 — Gate blocking (Release 2 Final Gate)

| Scenario ID | Flow |
|---|---|
| `voice_fsi_button_accept` | Voice · background/FSI → `NativeVoiceCallActivity` Accept → `state_connected` |
| `voice_foreground_button_accept` | Voice · foreground → Activity Accept → Connected |
| `video_fsi_button_accept` | Video · background/FSI → Activity Accept → Connected |
| `video_foreground_button_accept` | Video · foreground → Activity Accept → Connected |

**PASS markers (P0):**

- `incoming_activity_shown` ≥ 1
- `accept_tapped` ≥ 1
- `state_connected` ≥ 1
- `activity_notification_accept` must **not** appear (in-app button path)

### Reference — Informational / non-blocking

| Scenario ID | Flow |
|---|---|
| `voice_banner_accept` | Notification shade / heads-up Accept (device & OS dependent) |
| `video_banner_accept` | Same for video |

Results are **recorded** in `report.json` (`referenceResults`) for future Android/OEM regression checks. **Gate PASS/FAIL ignores reference tier.**

Reference PASS (when shade action is tappable): `activity_notification_accept` → `accept_tapped` → `state_connected`.

## Commands

```bash
# Release 2 Final Gate — P0 only (exit 0 = gate PASS)
ROUTING_QA_GATE=p0 node .qa-logs/native-incoming-routing-accept-qa.mjs

# Full run — P0 + reference (exit code = P0 only)
node .qa-logs/native-incoming-routing-accept-qa.mjs

# Reference only (informational)
ROUTING_QA_GATE=reference node .qa-logs/native-incoming-routing-accept-qa.mjs

# Single scenario
ROUTING_QA_ONLY=voice_fsi_button_accept node .qa-logs/native-incoming-routing-accept-qa.mjs
```

## Output

- `report.json` — `p0AllPass`, `gatePass`, `p0Results`, `referenceResults`
- `logcat-b-<scenario>-<callId>.txt`

## Out of scope (not approved for product changes)

- Runtime / Agora / Owner / PushDelivery / Cleanup
- Notification Template / CallStyle / ConnectionService
- Suppress/grace policy changes to force shade Accept
