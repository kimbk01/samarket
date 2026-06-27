# DIBAY Call Video Dock HARD LOCK

Status: **HARD LOCK** (2026-06-28)

## Lock Statement

Video **Activity-bound Dock** HARD LOCK. `NativeVideoCallDockPresenter` + dock attach/detach in `NativeVideoCallActivity` render CONNECTED Runtime snapshot only. Dock passes Resume (full Activity UI) and End (`NativeVideoCallRuntime.end`) intents only. No `SYSTEM_ALERT_WINDOW`, no system overlay, no Runtime/O2/O3/O4/Guard/PiP/MainActivity changes in this track.

## Dock Invariants (Fast QA — 5 gates)

| # | Gate | Proof |
|---|---|---|
| 1 | **CONNECTED → Dock** | `native_video_dock_shown`, `native_call_dock_root` |
| 2 | **Dock → Resume → Activity** | `native_video_dock_resume`, `native_video_dock_hidden`, full connected UI |
| 3 | **Dock → End → O4 chain** | `end_tapped source=dock`, cleanup chain |
| 4 | **End → Dock removed** | `native_video_dock_hidden`, `detachDockView`, no dock in hierarchy |
| 5 | **Forbidden = 0** | no Web establishment / duplicate surface markers |

## Scope

| In scope (LOCKED) | Out of scope (do not reopen without approval) |
|---|---|
| `NativeVideoCallDockPresenter.java` | O2 / O3 / O4 |
| `NativeVideoCallActivity.java` (dock attach/detach only) | Guard / `NativeCallEngineOwnership` |
| `layout_native_call_dock.xml` | `NativeVideoCallAgoraEngine` |
| `dibay_call_dock_resume` in `strings.xml` | PiP LOCK files |
| | Voice Dock |
| | `SYSTEM_ALERT_WINDOW` / system overlay Dock |
| | MainActivity / Web CallV4 |

Design reference: `docs/dibay-native-call-ui-design.md` §10 Dock (Activity-bound phase).

## Locked Files

```
android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallDockPresenter.java
android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java  (dock lifecycle glue)
android/app/src/main/res/layout/layout_native_call_dock.xml
android/app/src/main/res/values/strings.xml  (dibay_call_dock_resume)
```

## Locked Device Proof

| Gate | Report | Result |
|---|---|---|
| Dock Fast QA (5 checks) | `.qa-logs/native-call-dock-qa/report.json` | **PASS** |

Machine-readable: `docs/artifacts/dibay-call-video-dock-hard-lock-evidence.json`

## Deploy Baseline at Lock

| Item | Value |
|---|---|
| Git commit | `3a53b57a` (`feat(call): add Video Activity-bound Dock HARD LOCK`) |
| Remote | `origin/main` |
| Vercel | `https://samarket.vercel.app` |
| APK | rebuild + A/B reinstall after push |

### Pass run (2026-06-28)

| Field | Value |
|---|---|
| callId | `beddd6cf-a6dc-4ac1-8741-6c0081f3d469` |
| devices | A=`8b37179f7d94` B=`RRGL4046NTW` |
| connectedToDock | PASS |
| dockResume | PASS |
| dockEnd | PASS |
| dockRemoved | PASS |
| forbidden | all **0** |
| O4 | `runtime_cleanup_start` → `cleanup_done` |

### Forbidden (0 required)

`route_to_screen`, `CallV4Screen`, `screen_mounted`, `agora_join_success`, `visible_surface_owner_claimed` — **0**.

## Architecture (fixed)

```
NativeVideoCallRuntime (Owner — HARD LOCK)
        ↓ getSession (read-only snapshot)
NativeVideoCallDockPresenter → Model
        ↓ Activity-bound view (no overlay)
NativeVideoCallActivity dock mode
        ↓ intent only
Resume → hideDock / full UI  |  End → Runtime.end()
```

**Dock MUST NOT:** join/leave Agora, cleanup, FGS, terminal dispatch, visible-surface ownership, system overlay.

**If a bug appears:** Activity / Presenter / layout first. Do not expand into Runtime/O2/O3/O4 without explicit approval.

## QA Policy (after this lock)

| Tier | When |
|---|---|
| **Fast QA** | Dock scope change only — `.qa-logs/native-call-dock-qa.mjs` |
| **Regression** | Track completion — **once** (not repeated here) |
| **O2/O3/O4 matrix** | **Forbidden** without new evidence |

## Forbidden After Lock

- System overlay Dock / `SYSTEM_ALERT_WINDOW` in same files without new track approval
- Voice Dock mixed into Video Dock LOCK files
- PiP / Video UI LOCK file changes for Dock rationale
- Runtime/O2/O3/O4/Guard reopen under Dock UI excuse
- MainActivity Web dock fallback wired to native-owned calls

## Next Track

System overlay Dock (if ever) = **separate approval track**. Native call presentation stack: Voice UI LOCK → Video UI LOCK → PiP LOCK → **Dock LOCK** (Activity-bound).
