# DIBAY iOS Native Video 통화 QA (수신 + PiP)

Status: iOS Native Video **수신(Incoming) + PiP** 실기 QA 완료(§6 PASS). **iOS `nativeVideoRuntime=true` rollout** (Android assets와 동일).
대상 코드: STEP 2(수신 P0) + STEP 3(PiP) + P4 cleanup fix (`4aafc362` 이후 rollout).
작성일: 2026-07-12

---

## 0. 역할 분담

- **bk (통화 담당):** 아래 시나리오대로 **통화 걸고/받고 버튼만 누름**. 각 단계에서 "화면 기대"가 맞는지 눈으로 확인.
- **엔지니어 (로그 담당):** 아래 마커가 로그에 찍히는지 확인하고 PASS/FAIL 표시. (bk는 로그 안 봐도 됨.)

---

## 1. 준비

1. **`ios/App/App/dibay-call-lane.json`** — `nativeVideoRuntime: true` (repo 기본값, Android parity).
2. **실기 2대** (A=발신자 웹/기존, B=수신자 = iOS Native 테스트 iPhone). **B는 수신만** 검증(발신 Native Video 미구현).
3. B 기기에서 앱 카메라·마이크 권한을 미리 허용해 둠(권한 거부 시나리오는 별도 케이스).

### 로그 보는 법 (엔지니어)

Xcode → Window → Devices and Simulators → B 기기 → Open Console, 필터에 아래 입력:

```
[DIBAY_NATIVE_VIDEO]
```

- 성공/실패 마커는 모두 이 prefix 로 나옴.
- iOS는 Android 패리티 alias 도 같이 찍음(예: `owner_claimed_native_video`, `state_connected`).

---

## 2. 필수 성공 마커 (수신 → connected → 종료 1사이클)

한 번의 정상 통화에서 아래가 모두 찍혀야 PASS:

**수신 → 연결**

- `incoming_fcm_received`
- `owner_claimed_native_video`
- `legacy_web_handoff_blocked`
- `ios_native_video_answer_started`
- `ios_native_video_permission_granted`
- `ios_native_video_accept_started`
- `ios_native_video_token_started` → `ios_native_video_token_ok`
- `agora_native_video_join_start` → `agora_native_video_join_success`
- `local_camera_publish_success`
- `remote_video_rendered`
- `ios_native_video_connected` / `state_connected`
- `ios_native_video_js_connected_synced` (JS 동기화)

**종료 → 정리**

- `ios_native_video_cleanup_started` → `ios_native_video_cleanup_done`
- `ios_native_video_local_terminal_publish` (Web idle 동기화)
- `owner_released`

---

## 3. 금지 마커 (하나라도 뜨면 FAIL)

- `web_call_v4_native_accept_received`
- `deliverExistingAnswerHandoff` (flag ON 상태에서 뜨면 안 됨)
- `/community-messenger/calls-v4/` 가 연결 전제 조건으로 열림
- 같은 callId 에 수신 UI 2개
- 종료 후에도 Agora/CallKit 세션 잔류

---

## 4. 수신 시나리오 (bk가 통화)

| # | bk가 할 일 | 화면 기대 | 확인 마커 (엔지니어) | P/F |
|---|-----------|----------|---------------------|-----|
| 1 | A→B 영상통화 발신, B에서 **수락**, 45초 유지 | B에 Native 영상 화면(상대 영상 큰 화면 + 내 프리뷰 우상단), 통화시간 카운트 | §2 성공 마커 전부 + 45초간 재join 없음 | |
| 2 | B에서 **종료(빨간 버튼)** | 즉시 통화 종료, 화면 정리 | `cleanup_done` + `owner_released`, 녹색 웹 화면 잔류 **없음** | |
| 3 | 연결 후 A(발신자)가 먼저 끊기 | B 화면 자동 종료 | `ios_native_video_remote_terminal` → `cleanup_done`, Web idle | |
| 4 | 연결 후 B 앱을 밀어서 종료/앱 킬 | 통화 정리됨 | 잔류 세션 없음 | |
| 5 | 종료 후 30초 대기 | 통화 UI/알림 없음, 재수신 가능 | 잔류·재join 없음 | |
| 6 | B에서 **거절(수락 안 함)** | 벨 멈춤, 통화 안 열림 | reject 후 `cleanup_done` | |
| 7 | 같은 통화가 중복으로 울릴 때 | 하나만 표시 | 중복 무해(`begin_accept_duplicate` 등) | |

---

## 5. 실패 케이스 (각각 고유 마커 + Web idle + 재다이얼 가능)

| # | bk가 할 일 | 기대 마커 | P/F |
|---|-----------|-----------|-----|
| F1 | B 카메라/마이크 권한 **거부** 후 수신·수락 | `video_accept_fail_permission` + 통화 정리 | |
| F2 | (네트워크 차단 등) 연결 실패 유도 | `video_accept_fail_token` 또는 `video_accept_fail_join` | |
| F3 | 수락 후 상대가 응답 없이 방치(약 12초) | `video_accept_fail_join_hang` (자동 종료) | |

> F1~F3 모두 종료 후 **다시 전화 걸면 정상 수신**되어야 함(잔류 없음).

---

## 6. PiP 시나리오 (bk가 통화)

| # | bk가 할 일 | 화면 기대 | 확인 마커 | P/F |
|---|-----------|----------|-----------|-----|
| P1 | 연결된 상태에서 **「축소」 버튼** 탭 | 작은 PiP 창으로 축소, **상대 영상이 PiP 안에서 계속 보임** (메인 검은 화면은 통화 화면 내 축소 UX로 정상) | `native_video_pip_entered` + `native_video_pip_remote_reparented target=pip` | PASS |
| P2a | PiP 상태로 **통화 화면 내** 축소 유지 | 영상·소리 지속 | 육안 | PASS |
| P2b | PiP 상태로 홈 → **다른 앱 위** 30초 | 시스템 PiP 오버레이 | — | **미구현** (별도 Phase) |
| P3 | PiP **확대(↗) 아이콘** 싱글 탭 (더블탭 크기조절 아님) | 풀스크린 복귀, 상대 영상 정상 | `native_video_pip_restore` + `native_video_pip_exited` + `..._reparented target=fullscreen` | PASS |
| P4 | PiP 상태에서 상대(A)가 먼저 끊기 | PiP 자동 종료 + 통화 정리 | graceful exit + `cleanup_done`, 잔류 0 | PASS (P4 deadlock fix 후) |
| P5 | 화면 회전/깜빡임 관찰 (P1~P3 중) | 축소·복귀 시 상대 영상 **프리즈/깜빡임 없음** | 육안 | PASS |

> **P2 구분:** P2a = 현재 구현(인라인 축소). P2b = iOS 홈/타앱 위 시스템 PiP — 범위 밖·미구현.

---

## 7. 오디오 회귀 (Voice 영향 없음 확인)

| # | 확인 | P/F |
|---|------|-----|
| A1 | 수신 영상통화 오디오 정상(스피커) | |
| A2 | 이어폰/블루투스 연결 시 라우팅 정상 | |
| A3 | 같은 기기로 **음성(Voice) 통화** 걸어 스피커/이어폰 라우팅 정상(회귀 없음) | |

---

## 8. 최종 사인오프

| 항목 | 결과 |
|------|------|
| §4 수신 시나리오 1–7 | PASS / FAIL |
| §5 실패 케이스 F1–F3 | PASS / FAIL |
| §6 PiP P1–P5 | **PASS** (P2b 미구현 별도 기록) |
| §7 오디오 회귀 A1–A3 | (실기 미기록) |
| §3 금지 마커 0건 | 확인 |
| iOS `nativeVideoRuntime=true` (rollout) | **완료** (`false` 시 Web `/calls-v4` handoff — 실기 혼동 주의) |

**§6 PASS (2026-07-12, `nativeVideoRuntime=true` 로 실기 확인).** `false` 빌드는 Native가 아닌 Web Agora(`ConnectedVideoView`, `Agora-SDK` 로그) — QA 무효 아님, 플래그 OFF 동작.

**rollout 후 실기 1회:** 수신 시 `[DIBAY_NATIVE_VIDEO]` + `legacy_web_handoff_blocked` 확인 (Web `connected_video_shell` 없어야 함).

**FAIL 발생 시:** 해당 시나리오 번호 + 로그 마커를 그대로 전달 → 원인 대조 후 수정.

---

## 부록: 마커 빠른 참조

- **정상 흐름:** `incoming_fcm_received` → `owner_claimed_native_video` → `legacy_web_handoff_blocked` → `ios_native_video_answer_started` → `ios_native_video_permission_granted` → `ios_native_video_accept_started` → `ios_native_video_token_ok` → `agora_native_video_join_success` → `local_camera_publish_success` → `remote_video_rendered` → `state_connected` → (종료) `cleanup_done` → `owner_released`
- **실패:** `video_accept_fail_permission` / `_patch` / `_token` / `_join` / `_join_hang` / `_begin` / `_stale`
- **PiP:** `native_video_pip_entered` / `_exited` / `_restore` / `_remote_reparented` / `_blocked` / `_enter_failed`
- **발신 dangling 차단(참고):** `ios_callkit_call_started_skipped`
