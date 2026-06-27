# DIBAY Call Video UI HARD LOCK

Status: **HARD LOCK** (2026-06-28)

## Lock Statement

Video Native UI HARD LOCK. Outgoing dialing, incoming, connecting, connected, and product end controls render **NativeVideoCallRuntime state only** via `NativeVideoCallActivity` + `NativeVideoCallUiPresenter`. UI calls Runtime intent APIs only (`accept`, `reject`, `end`, camera toggle via existing AgoraEngine API). No Web `CallV4Screen`, no JS Agora establishment, no O2/O3/O4/Guard/Web changes in this track.

## UI Invariants (4 only — no extra QA scope)

| # | Invariant | Proof |
|---|---|---|
| 1 | **Outgoing** — single Native Activity surface | `native_dialing_surface_shown`, `native_video_call_root` |
| 2 | **Incoming** — single Native Activity surface | `incoming_activity_shown`, accept UI on `NativeVideoCallActivity` |
| 3 | **Web CallV4Screen** — **0** on native-owned video | forbidden markers all **0** |
| 4 | **Controls above SurfaceView** — end/camera tappable when connected | `end_tapped` via `native_video_call_end` (controls on root overlay layer) |

## Scope

| In scope (LOCKED) | Out of scope (HARD LOCK — do not reopen) |
|---|---|
| `NativeVideoCallActivity.java` | O2 establishment |
| `NativeVideoCallUiPresenter.java` | O3 connected sync |
| `activity_native_video_call.xml` | O4 end ownership |
| Video UI strings in `strings.xml` (`dibay_video_*`) | Guard / `NativeCallEngineOwnership` |
| Runtime **UI hooks only** in `NativeVideoCallRuntime` | `NativeVideoCallAgoraEngine` |
| | Web/JS Agora / `CallV4Screen` |
| | Voice UI LOCK files |
| | PiP / Dock (next track) |

Design reference: `docs/dibay-native-call-ui-design.md` (Video section — **implemented & locked**).

## Locked Files

```
android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java
android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallUiPresenter.java
android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java  (UI hooks only)
android/app/src/main/res/layout/activity_native_video_call.xml
android/app/src/main/res/values/strings.xml  (dibay_video_* keys)
```

## Locked Device Proof (pre-commit, same APK baseline)

| Gate | Report | Result |
|---|---|---|
| Video UI Fast QA (5 scenarios) | `.qa-logs/video-ui-device-qa/report.json` | **PASS** |
| O3 regression (once) | `.qa-logs/o3-connected-device-qa/report.json` | **PASS** |

Machine-readable bundle: `docs/artifacts/dibay-call-video-ui-hard-lock-evidence.json`

## Deploy Baseline at Lock

| Item | Value |
|---|---|
| Git commit | `37fbf017` (`feat(call): Native Video UI HARD LOCK with render-only Activity`) |
| Remote | `origin/main` (push pending approval) |
| Vercel | `https://samarket.vercel.app` |
| APK | rebuild + A/B reinstall after push |

### Video UI scenarios (Fast QA only)

| Scenario | callId | Key proof |
|---|---|---|
| Outgoing dialing | `4352433d-6d26-4219-8606-d2b7423a51b0` | `native_dialing_surface_shown`, single surface, forbidden **0** |
| Incoming | `0b0e7e32-ca4c-46a3-bfca-ac0dcc2b61f1` | `incoming_activity_shown`, accept UI |
| Connecting | same | `accept_tapped` / join start |
| Connected | same | `state_connected` |
| End | same | `end_tapped`, cleanup chain |

### Forbidden Web establishment (0 required)

`route_to_screen`, `screen_mounted`, `agora_join_success`, `CallV4Screen` — **0** on Video UI Fast QA.

### Single visible surface

`NativeCallVisibleSurfaceOwner` + `NativeVideoCallActivity` (`singleTask`, task affinity `com.dibay.app.native.video`). No parallel Web call screen for native-owned video.

## QA Policy (fixed after this lock)

| Tier | When |
|---|---|
| **Fast QA** | Per UI change — modified scope only |
| **Regression QA** | Track completion — **once** (O3 done) |
| **Full matrix / O2·O3·O4 re-audit** | **Forbidden** without new evidence |

Do not re-run identical device matrix, Voice UI QA, Guard audit, or Runtime audit for the same commit/APK.

## Architecture (fixed)

```
NativeVideoCallRuntime (Owner — O2/O3/O4 HARD LOCK)
        ↓ renderState / ensureVideoUiVisible (UI hooks only)
NativeVideoCallUiPresenter → Model
        ↓
NativeVideoCallActivity (render-only)
        ↓ intent only
Runtime.accept | reject | end | AgoraEngine.setCameraEnabled
```

**UI MUST NOT:** join/leave Agora, start/stop FGS, dispatch terminals, or call `cleanup()` directly.

**If a bug appears:** confirm UI layer first. Do not expand root cause into Runtime/O2/O3/O4 without explicit approval.

## Forbidden After Lock (without explicit user approval)

- Re-modifying Video UI locked files for non-UI reasons
- Mixing PiP / Dock into Video LOCK files
- Restoring Web `CallV4Screen` or JS Agora for native video
- Re-opening O2/O3/O4/Guard/Agora/Web under Video UI rationale
- Re-opening Voice UI LOCK
- Extra full-matrix / engine QA “just in case”

## Next Track

**PiP** — only after this HARD LOCK commit is pushed, Vercel synced, and APK reinstalled on A/B. Do not return to call-engine tracks unless new evidence requires it.
