# DIBAY Android Native Video — PiP · Notification Restore · Surface Reattach HARD LOCK

Status: **HARD LOCK** (2026-07-12)

## Lock Statement

**CONNECTED 상태 Android Native 영상통화**에서 Activity가 Recents 등으로 destroy 되어도 **Runtime·Agora 채널·오디오·카메라 capture는 유지**하고, **UI Surface만 안전하게 복구**하는 구조를 LOCK 한다.

이 LOCK은 기능 추가가 아니라 **회귀 방지 계약**이다. 아래 Step 1–2-C는 **UI·FGS notification·Agora canvas rebind** 계층에 한정하며, `NativeVideoCallRuntime` / join·leave SSOT / Push·FCM / Native Voice / Signaling 은 **별도 승인 없이 건드리지 않는다**.

SSOT 런타임 경로: `FCM → Native Runtime → Accept → Native Token → Native Agora SDK → Connected → End → Cleanup`  
(`.cursor/rules/dibay-call-native-runtime-ssot.mdc`)

---

## Architecture (fixed)

```text
CONNECTED + FGS alive
        │
        ├─ Activity alive ──► remote/local SurfaceView in containers
        │
        └─ Activity destroyed (Recents swipe)
                │
                ├─ Runtime session CONNECTED 유지
                ├─ Agora engine + channel + audio 유지
                ├─ local preview capture 유지 (leave 전 stopPreview 없음)
                │
                └─ FGS notification 본문 탭
                        │
                        ▼
              UI_MODE_CONNECTED_RESTORE
                        │
                        ├─ Step 2-B: remote Surface 1개 재생성 + setupRemoteVideo
                        └─ Step 2-C: local Surface 1개 재생성 + setupLocalVideo
```

**Surface reattach MUST NOT:** `leaveChannel`, `joinChannel`, engine recreate, `enableVideo` 재호출, `REMOTE_SETUP_UIDS` 전체 clear, camera on/off 강제 변경.

---

## Locked Steps Overview

| Step | Name | Primary files |
|------|------|---------------|
| **1** | PiP State Machine | `NativeVideoCallActivity.java` |
| **2-A** | Notification Restore | `NativeVideoCallService.java` |
| **2-B** | Remote Surface Reattach | `NativeVideoCallAgoraEngine.java`, `NativeVideoCallActivity.java` |
| **2-C** | Local Preview Reattach | `NativeVideoCallAgoraEngine.java`, `NativeVideoCallActivity.java` |

---

## Step 1 — PiP State Machine

### 수정 파일

- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java`

### 수정 이유

`enterPictureInPictureMode()` **동기 반환값**과 **실제 PiP callback 진입**이 분리되지 않아, 요청 성공/실패·timeout·lifecycle 관측이 불가능했다. CONNECTED에서 back/home PiP 진입 안정화를 위해 **상태 머신 + 관측 로그**만 추가했다.

### 절대 건드리면 안 되는 코드

| 금지 | 이유 |
|------|------|
| `NativeVideoCallPipPresenter.java` | 별도 PiP presenter LOCK / lifecycle |
| `NativeVideoCallRuntime.java` join/leave/cleanup | Runtime SSOT |
| `NativeVideoCallAgoraEngine.java` renderer 경로 | Surface reattach Step 2-B/C와 분리 |
| `NativeVideoCallService.java` FGS 정책 | Step 2-A LOCK |
| `AndroidManifest.xml` PiP `configChanges` / `supportsPictureInPicture` | 기존 lifecycle LOCK |
| timeout 시 **재시도·Dock 추가 호출·Activity finish** | 진단 전용 timeout 유지 |
| `SYSTEM_ALERT_WINDOW` / `TYPE_APPLICATION_OVERLAY` | 별도 승인 트랙 |

### 구현 계약 (고정)

- 상태: `PIP_IDLE` → `PIP_REQUESTED` → `PIP_ACTIVE` (callback 진입 시)
- Android 13+ `OnBackInvokedCallback` (`back_invoked`) + legacy `onBackPressed` (`back`)
- **성공 SSOT:** `onPictureInPictureModeChanged(true)` → `native_video_pip_callback_entered`
- timeout (`PIP_REQUEST_TIMEOUT_MS`) = **진단 전용**, PASS/FAIL 판정에 사용 금지

### PASS 조건

| # | 조건 | 로그 / 관측 |
|---|------|-------------|
| 1 | CONNECTED 상태 | `state_connected` |
| 2 | PiP 요청 | `native_video_pip_request` |
| 3 | API 수락 | `native_video_pip_request_accepted` |
| 4 | callback 진입 | `native_video_pip_callback_entered` |
| 5 | PiP 30초 유지 | remote 영상 + audio 유지, freeze 없음 |
| 6 | fullscreen 복귀 | `native_video_pip_callback_exited` |
| 7 | 종료·cleanup | 기존 O4 chain |

### 회귀 테스트 항목

- 수신 CONNECTED 3회 + 발신 CONNECTED 3회: back / home 각각 PiP 진입
- ADB `KEYCODE_BACK` → `source=back_invoked` (Android 13+)
- MIUI 등 `user_leave` only 기기: PiP 진입만 확인 (source 문자열 회귀 아님)
- PiP 중 audio 유지, remote freeze 없음, black screen 없음
- PiP 확대 복귀 시 Activity 중복 생성 없음
- `native_video_minimize_pip` 위치: callback_entered 이후
- timeout 발생해도 **즉시 finish/crash 없음**

---

## Step 2-A — Notification Restore

### 수정 파일

- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallService.java`

### 수정 이유

CONNECTED FGS notification에 **본문 탭 복귀 intent**와 **종료 action**이 없어, Recents로 Activity 제거 후 통화는 유지되나 UI 복귀 경로가 없었다.

### 절대 건드리면 안 되는 코드

| 금지 | 이유 |
|------|------|
| Notification **channel 생성·importance** 임의 변경 | 기존 FGS·수신 알림 회귀 |
| **CallStyle** / custom layout (Step 2-B UX 트랙) | 본 LOCK 범위 밖 |
| `NativeVideoCallRuntime` session/state 전이 | Runtime SSOT |
| RINGING/CONNECTING notification에 restore intent | CONNECTED 전용 gate |
| WebView / MainActivity handoff | Native runtime SSOT 위반 |

### 구현 계약 (고정)

- `ACTION_CONNECTED` + `hasConnectedSession(callId)` 일 때만:
  - `setContentIntent(returnToCallIntent)` — 본문 탭
  - `addAction(종료, hangUpIntent)` → `NativeVideoCallActionReceiver.ACTION_END`
- `returnToCallIntent` extras:
  - `EXTRA_UI_MODE = UI_MODE_CONNECTED_RESTORE` (`connected_restore`)
  - `FLAG_ACTIVITY_NEW_TASK | SINGLE_TOP | CLEAR_TOP`
- 별도 "복귀" 버튼 없음 — **notification 본문 탭**이 복귀 SSOT

### PASS 조건

| # | 조건 | 관측 |
|---|------|------|
| 1 | CONNECTED FGS 표시 | ongoing notification |
| 2 | 본문 탭 | `NativeVideoCallActivity` 재진입, `native_video_restore_surface_shown` |
| 3 | 동일 callId | 새 callId 없음 |
| 4 | 종료 action | `ACTION_END` → 정상 cleanup |
| 5 | CONNECTING/RINGING | content restore intent **없음** |

### 회귀 테스트 항목

- CONNECTED → Recents 제거 → notification 본문 탭 → Activity 1개 복귀
- CONNECTED → notification "종료" → O4 cleanup
- CONNECTING/RINGING notification 탭 시 restore mode 미적용
- 수신·발신 양쪽 기기 (Xiaomi `8b37179f7d94`, Samsung `RFCY40PY2CA`)

---

## Step 2-B — Remote Surface Reattach

### 수정 파일

- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java` (restore gate — remote 분기)

### 수정 이유

Activity destroy 시 `remoteContainer`가 비면 Agora가 **무효한 VideoCanvas**를 유지한다. `onRemoteRenderSurfaceReady`는 `PENDING_REMOTE_UIDS` empty + `REMOTE_SETUP_UIDS` dedupe로 **재setup 불가**. CONNECTED_RESTORE에서 remote Surface만 1회 재생성해야 한다.

### 절대 건드리면 안 되는 코드

| 금지 | 이유 |
|------|------|
| `leaveChannel` / `joinChannel` / engine recreate | 통화 유지 계약 파괴 |
| `REMOTE_SETUP_UIDS.clear()` (전체) | 다중 remote·dedupe 계약 파괴 |
| 최초 join / 일반 CONNECTED / PiP 경로에서 `reattachRemoteSurfaceIfNeeded` 호출 | restore 전용 1곳 |
| `NativeVideoCallRuntime.java` | Runtime SSOT |
| remote uid 2개 이상일 때 임의 uid 선택 | `SKIPPED_AMBIGUOUS_REMOTE_UID` 유지 |

### 구현 계약 (고정)

**Engine — `reattachRemoteSurfaceIfNeeded(callId)`**

- gate: valid callId, main thread, `activeCallId` 일치, engine 존재, `reattachInFlightCallId` 중복 방지
- `REMOTE_SETUP_UIDS` snapshot → **정확히 1 uid**일 때만 `remove(uid)` 후 `setupRemoteVideo(uid, sid)` 1회
- guard clear: `finally`, `joinInternal`, `leave`, `releaseZombieEngine`

**Activity — `maybeReattachSurfacesAfterConnectedRestore()` (remote 먼저)**

- gate: `UI_MODE_CONNECTED_RESTORE`, session `CONNECTED`, `activeCallId` 일치, `remoteContainer.getChildCount()==0`
- 호출: `onCreate` / `onNewIntent` 의 `applyState` 완료 직후

### PASS 조건

| # | 조건 | 로그 |
|---|------|------|
| 1 | restore request | `native_video_remote_reattach_request` |
| 2 | setup 시작 | `native_video_remote_reattach_setup_started` |
| 3 | Agora setup | `setup_remote_video` |
| 4 | surface attach | `remote_surface_attached` |
| 5 | success | `native_video_remote_reattach_surface_attached` |
| 6 | 육안 | 상대 영상 정상, audio 유지, freeze 없음 |

### 회귀 테스트 항목

- CONNECTED → Recents 제거 → notification 탭 → remote 영상 복구
- 동일 callId, `setupRemoteVideo` **1회만**
- PiP 확대 복귀: `existing_remote_child` skip, reattach_request 없음
- 최초 연결·일반 CONNECTED·CONNECTING/RINGING: reattach 미실행
- remote uid 0개/2개+: skip (no_remote_uid / ambiguous)

---

## Step 2-C — Local Preview Reattach

### 수정 파일

- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java` (restore gate — local 분기)

### 수정 이유

Activity destroy 시 `localContainer`가 비면 **local VideoCanvas 연결이 끊기지만** Runtime/Agora **camera capture는 유지**된다 (`stopPreview`는 `leave()`/`tearDownEngine`에서만). CONNECTED_RESTORE에서 local Surface만 1회 재생성·재바인딩해야 한다.

### 절대 건드리면 안 되는 코드

| 금지 | 이유 |
|------|------|
| restore 경로 `startPreview()` 호출 | Policy A — capture 이미 running |
| restore 경로 `stopPreview()` / camera on-off 변경 | 사용자 의사·privacy 위반 |
| `leaveChannel` / `join` / engine recreate / `enableVideo` 재호출 | 통화 유지 계약 |
| `local_camera_preview_started` 로그를 reattach에 재사용 | join 시 capture 시작 의미와 혼동 |
| camera-off / audio-only 상태에서 local surface 강제 생성 | privacy gate |
| PiP 확대 복귀 시 local re-setup | existing child 있음 |

### Preview 정책 (감사 결과 — LOCK)

| 항목 | 위치 | 결론 |
|------|------|------|
| `startPreview` | `joinInternal` only | join 시 1회 |
| `stopPreview` | `tearDownEngine` (`leave`) only | Activity `onDestroy` **미호출** |
| restore | `setupLocalVideo` + `attachLocalView` only | **Policy A** |

### 구현 계약 (고정)

**Engine — `reattachLocalPreviewIfNeeded(callId, cameraEnabled)`**

- gate: valid callId, `cameraEnabled==true`, main thread, `activeCallId` 일치, engine+context 존재, `localReattachInFlightCallId` 중복 방지
- `SurfaceView` 1개 → `setupLocalVideo(VideoCanvas)` → `attachLocalView` → `hasLocalSurfaceChild` 확인
- guard clear: `finally`, `joinInternal`, `leave`, `releaseZombieEngine`

**Activity gate (remote 이후, 독립 skip/fail)**

- `localContainer.getChildCount()==0`, `cameraEnabled==true`, 동일 CONNECTED_RESTORE gate

### PASS 조건

| # | 조건 | 로그 |
|---|------|------|
| 1 | restore request | `native_video_local_reattach_request` |
| 2 | setup 시작 | `native_video_local_reattach_setup_started` |
| 3 | surface attach | `native_video_local_reattach_surface_attached` |
| 4 | container | `localContainer` childCount > 0 |
| 5 | 육안 | 내 카메라 작은 화면 정상, 검은 화면 없음, audio 유지 |
| 6 | 부재 | 복귀 후 `local_camera_preview_started` **0건** (정상) |

### 회귀 테스트 항목

- CONNECTED → Recents 제거 → notification 탭 → **local + remote** 모두 복구 (실기 PASS 2026-07-12)
- camera-off → Recents → 복귀 → `native_video_local_reattach_skipped reason=camera_disabled`, camera 자동 on 없음
- PiP 확대 복귀 → `existing_local_child` skip, `setupLocalVideo` 중복 없음
- `startPreview` restore 경로 **0회**
- 최초 발신/수신 연결, 일반 CONNECTED, CONNECTING/RINGING, ENDING/ENDED: local reattach 미실행

---

## Combined Restore PASS (Step 2-A + 2-B + 2-C)

한 번의 Recents → notification 복귀 사이클:

```text
native_video_restore_surface_shown
native_video_remote_reattach_request → setup_started → remote_surface_attached → surface_attached
native_video_local_reattach_request → setup_started → surface_attached
```

육안: 상대 영상 + 내 preview + audio 유지, Activity 중복 없음, 동일 callId.

---

## Locked Files (full list)

```
android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java
  - Step 1: PiP state machine, back callback, pip observability
  - Step 2-B/C: maybeReattachSurfacesAfterConnectedRestore, attachLocalView/attachRemoteView sync

android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallService.java
  - Step 2-A: CONNECTED contentIntent + end action

android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java
  - Step 2-B: reattachRemoteSurfaceIfNeeded
  - Step 2-C: reattachLocalPreviewIfNeeded
```

### Explicitly OUT of this LOCK (do not modify under this track)

```
NativeVideoCallRuntime.java
NativeVideoCallActionReceiver.java  (hangUp intent target only — logic unchanged)
NativeVideoCallPipPresenter.java
AndroidManifest.xml
Native Voice 전체
Push/FCM/Signaling/API
MainActivity / WebView / CallV4*
```

---

## Logcat Filter

```bash
adb logcat -v time | rg "native_video_pip_|native_video_restore|native_video_remote_reattach|native_video_local_reattach|remote_surface_attached|state_connected|DIBAY_NATIVE_VIDEO"
```

---

## Device Proof (2026-07-12)

| Item | Value |
|------|-------|
| Devices | A=`8b37179f7d94` (Xiaomi), B=`RFCY40PY2CA` (Samsung) |
| Step 1 PiP | PASS (back / home, callback_entered) |
| Step 2-A Notification restore | PASS (본문 탭 복귀) |
| Step 2-B Remote reattach | PASS |
| Step 2-C Local reattach | PASS (육안 "잘된다" / "퍼팩트") |
| Git commit at lock | **uncommitted** — commit/push 별도 승인 |

---

## Forbidden After Lock

- Runtime/O4/FGS lifecycle reopen under "restore UX" excuse
- reattach 경로에 `leave`/`join`/engine recreate 추가
- restore 시 `startPreview` 무조건 호출
- `REMOTE_SETUP_UIDS.clear()` 전체 초기화로 reattach 단순화
- PiP/restore 수정으로 Native Voice·Push·Signaling 침범
- Step 2-B UX (CallStyle·흰 화면)를 본 LOCK 파일에 무단 혼입

---

## Next Track (별도 승인 — UI 계층만)

기능보다 **품질·패리티** 우선. **Runtime 건드리지 않고** UI/notification 계층에서만:

| Priority | Track | Scope hint |
|----------|-------|------------|
| 1 | PiP 전환 흰 화면 (애니메이션 품질) | Activity transition / surface visibility |
| 2 | Notification UX (CallStyle 등) | `NativeVideoCallService` presentation only |
| 3 | iOS ↔ Android UX 패리티 | UI copy·layout·transition |

이 세 트랙은 **본 LOCK의 restore·reattach 계약을 변경하지 않는 전제**로 진행한다.

---

## Related Documents

| Document | Relation |
|----------|----------|
| `docs/dibay-call-native-runtime-hard-lock.md` | Umbrella runtime LOCK |
| `docs/dibay-call-video-dock-hard-lock.md` | Activity-bound dock (PiP fallback) |
| `docs/dibay-call-native-video-runtime-qa.md` | Lifecycle QA markers |
| `docs/audit-android-video-pip-v2.md` | PiP 감사 (Phase A) |
| `.cursor/rules/dibay-call-native-runtime-ssot.mdc` | Cursor SSOT |

---

## If a Bug Appears

1. **로그로 Step 식별** — PiP(1) vs notification(2-A) vs remote(2-B) vs local(2-C)
2. **restore gate 조건**부터 확인 — `UI_MODE_CONNECTED_RESTORE`, session CONNECTED, container empty
3. **금지 목록 위반 여부** — leave/join/startPreview/engine recreate 추가 여부
4. Runtime/O4로 확장 **금지** — UI surface·notification 계층에서 최소 수정 후 본 LOCK 갱신
