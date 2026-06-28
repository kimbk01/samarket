# DIBAY Call Release 2 — Native Incoming Accept Activity Routing HARD LOCK

Status: **Gate PASS** · **Final Release Regression pending** (updated after post-deploy P0 run)

## Lock Statement

**Accept Activity Routing HARD LOCK** for Native Voice/Video incoming on Android. Accept from the **Native Incoming Activity in-app button** (Telegram-aligned UX) is the P0 product path. Notification Accept uses **Activity PendingIntent** → `Native*CallActivity` → `Runtime.accept()` — not BroadcastReceiver → Runtime for Accept.

**Native Runtime HARD LOCK** (`docs/dibay-call-native-runtime-hard-lock.md`) remains in force. This document adds Release 2 Accept routing + QA tier policy only.

## Release 2 Scope (LOCKED IN)

| Area | Release 2 change |
|---|---|
| Accept PendingIntent | `getActivity` + `ACTION_NOTIFICATION_ACCEPT` / `notificationAccept` extra |
| Activity | `maybeHandleNotificationAccept` → `performAccept("notification")` |
| Notification grace | RINGING-only suppress grace (notification layer; Runtime diff 0) |

## Explicitly Out of Scope (NOT changed this Release)

- Runtime / Agora / Owner / PushDelivery / Cleanup
- Notification Template / CallStyle / ConnectionService
- Banner shade Accept as P0 gate (see QA tiers below)

## QA Standard — Telegram-Aligned (P0 / Reference)

Harness: `.qa-logs/native-incoming-routing-accept-qa.mjs`  
Doc: `.qa-logs/native-incoming-routing-accept-qa/README.md`

### P0 — Gate blocking

| Scenario | Flow |
|---|---|
| `voice_fsi_button_accept` | Voice FSI → Activity Accept → Connected |
| `voice_foreground_button_accept` | Voice Foreground → Activity Accept → Connected |
| `video_fsi_button_accept` | Video FSI → Activity Accept → Connected |
| `video_foreground_button_accept` | Video Foreground → Activity Accept → Connected |

P0 PASS: `incoming_activity_shown` → `accept_tapped` → `state_connected`; **`activity_notification_accept` must be 0** (in-app button path).

### Reference — Informational / non-blocking

| Scenario | Flow |
|---|---|
| `voice_banner_accept` | Notification shade Accept (device/OS dependent) |
| `video_banner_accept` | Same for video |

Recorded in `referenceResults`; **does not affect `gatePass`**. Retained for future Android/OEM policy changes.

```bash
ROUTING_QA_GATE=p0 node .qa-logs/native-incoming-routing-accept-qa.mjs
```

## Release 2 Final Gate (P0) — PASS

| Item | Value |
|---|---|
| At | 2026-06-28T08:03:19Z |
| Devices | A=`8b37179f7d94` B=`RRGL4046NTW` |
| `gatePass` | **true** (4/4 P0) |
| Report | `.qa-logs/native-incoming-routing-accept-qa/report.json` |
| Log | `.qa-logs/native-incoming-routing-accept-qa/run-release2-gate-p0-retry.log` |

P0 callIds: `9e6465b2-…`, `196259c2-…`, `74c5b4d2-…`, `ba2f1385-…` (see report).

## Post-Deploy Final Release Regression (P0)

| Item | Value |
|---|---|
| Origin | `https://samarket.vercel.app` |
| APK | Rebuilt post `cap:sync:vercel` + A/B reinstall |
| Status | _Pending — filled on PASS_ |

## Forbidden After HARD LOCK

Without explicit red-team approval:

- Revert Accept PI to BroadcastReceiver for Accept action
- Change P0 gate to require shade/banner Accept or `activity_notification_accept`
- Introduce CallStyle / ConnectionService under banner/shade excuse
- Modify Runtime / Agora / Owner / PushDelivery / Cleanup for incoming Accept routing

## Evidence

Machine-readable: `docs/artifacts/dibay-call-release2-native-incoming-routing-hard-lock-evidence.json`
