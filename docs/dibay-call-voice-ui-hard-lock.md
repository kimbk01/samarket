# DIBAY Call Voice UI HARD LOCK (Telegram Voice Chrome + R1 Ringback)

Status: **HARD LOCK** (2026-07-10)

## Lock Statement

**Telegram-style Native Voice UI** (B1+B2+B3a) + **R1 outgoing ringback route pin** are a **closed track** separate from **Phase V (voice → video upgrade)**.

Voice Native UI renders **NativeVoiceCallRuntime state only** via `NativeVoiceCallActivity` + `NativeVoiceCallUiPresenter`. UI calls Runtime / Agora intent APIs only (`accept`, `reject`, `end`, `setSpeakerEnabled`). **Video upgrade is UI chrome only (B3a toggle)** until Phase V is separately approved.

**Phase V is forbidden in this track** — no `NativeVoiceCallApi`, `NativeVoiceCallRuntime`, `NativeVoiceCallAgoraEngine`, signaling, or Web establishment changes under Voice UI rationale.

Design reference: `docs/dibay-native-call-ui-design.md` (Voice section).

## UI Invariants (Voice UI chrome)

| # | Invariant | Proof |
|---|---|---|
| 1 | **INCOMING** — existing accept/decline preserved | `incoming_panel` visible; accept/decline ids unchanged |
| 2 | **DIALING / CONNECTING / CONNECTED** — outgoing shell | `outgoing_shell`, 4-button chrome (speaker / video / mute / end) |
| 3 | **Speaker** — Agora route via existing API | `speaker_toggle`, `audio_route_applied speaker=` |
| 4 | **Video button** — UI chrome only (Phase V out of scope) | `videoActiveChrome` toggle; no Runtime upgrade |
| 5 | **Ringback (R1)** — no SPEAKER-first flash | APM SIGNALLING → EARPIECE; `native_outgoing_ringback_route_pin preferredDevice ok` |

## R1 Ringback (same commit bundle, separate concern from UI chrome)

| Item | File | Status |
|---|---|---|
| Route pin before ringback start | `android/app/src/main/java/com/dibay/app/NativeOutgoingRingbackOwner.java` | **Conditional PASS** (3/3 EARPIECE logcat) |
| Remaining gate | Connected Speaker ON/OFF QA 1× | **OPEN** |
| Rollback (R1 only) | `git restore android/app/src/main/java/com/dibay/app/NativeOutgoingRingbackOwner.java` | |

Log evidence: `.qa-logs/native-voice-r1-ringback-route.log`

## Scope

| In scope (this LOCK) | Out of scope (forbidden without separate Phase V approval) |
|---|---|
| `NativeVoiceCallActivity.java` | `NativeVoiceCallRuntime.java` |
| `NativeVoiceCallUiPresenter.java` | `NativeVoiceCallAgoraEngine.java` |
| `NativeVoiceCallApi.java` | `NativeVideoCall*` |
| `activity_native_voice_call.xml` | Push / FCM / Notification / Manifest |
| Voice UI colors/dimens/strings/drawables | CallV4 / Web call / JS Agora |
| `NativeOutgoingRingbackOwner.java` (R1 ringback pin only) | Phase V upgrade signaling / video publish |

## Locked Files (pre-commit working tree)

```
android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallActivity.java
android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallUiPresenter.java
android/app/src/main/java/com/dibay/app/NativeOutgoingRingbackOwner.java
android/app/src/main/res/layout/activity_native_voice_call.xml
android/app/src/main/res/values/colors.xml          (dibay_call_* voice tokens)
android/app/src/main/res/values/dimens.xml          (voice chrome)
android/app/src/main/res/values/strings.xml         (dibay_voice_* keys)
android/app/src/main/res/drawable/bg_call_control_*.xml
android/app/src/main/res/drawable/ic_call_*.xml
```

## Pre-Lock QA Gates

| Gate | Evidence | Result |
|---|---|---|
| Voice UI build | `./gradlew :app:assembleDebug` | **PASS** |
| Outgoing / incoming | Manual + prior QA | **PASS** |
| R1 ringback routing | `.qa-logs/native-voice-r1-ringback-route.log` | **PASS** |
| Connected Speaker ON/OFF | `.qa-logs/native-voice-r1-connected-speaker-qa.log` + device B logcat | **PASS (log)** |
| Commit | `lock(native-call): telegram voice ui and ringback route` | **DONE** |
| Push | Separate user approval | **BLOCKED** |

## Architecture (fixed)

```
NativeVoiceCallRuntime (Owner — O2/O3/O4 HARD LOCK)
        ↓ renderState / ensureVoiceUiVisible (UI hooks only)
NativeVoiceCallUiPresenter → Model
        ↓
NativeVoiceCallActivity (render-only)
        ↓ intent only
Runtime.accept | reject | end | AgoraEngine.setSpeakerEnabled

NativeOutgoingRingbackOwner (R1 — ringback route pin only, shared Voice/Video outgoing)
        ↓ pin EARPIECE before MediaPlayer.start()
```

**UI MUST NOT:** join/leave Agora, upgrade voice→video (Phase V), change Runtime state machine, or modify push/FCM.

## QA Policy (after HARD LOCK commit)

| Tier | When |
|---|---|
| **Fast QA** | Per Voice UI change — modified scope only |
| **Regression** | Track completion — once |
| **Full matrix / Runtime re-audit** | Forbidden without new evidence |

## Forbidden After Lock (without explicit user approval)

- Re-modifying Voice UI locked files for Phase V (upgrade signaling, Agora video publish, Runtime state)
- Mixing R1 rollback into Phase V work (or vice versa) in one commit
- Restoring Web `CallV4Screen` or JS Agora for native voice
- Re-opening O2/O3/O4/Guard/Agora under Voice UI rationale
- Touching Video UI LOCK files under Voice UI rationale

## Next Track (separate project — not started)

**Phase V — Voice → Video Upgrade**

1. Design audit only (no code until approval)
2. Web `requestUpgradeToVideo` SSOT comparison
3. Native API / Runtime / Agora impact analysis
4. Files / diff / rollback report
5. Implement after explicit approval

Machine-readable: `docs/artifacts/dibay-call-voice-ui-hard-lock-evidence.json`
