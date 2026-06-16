# DIBAY 통화 런타임 QA — APK↔APK `[DIBAY_CALL]` 로그

**상태:** 코드/빌드 PASS · **런타임 검증 대기** (2대 실기기 필수)

## 로그 수집

```bash
# Android logcat (양쪽 기기 각각)
adb logcat -s DIBAY_CALL

# Chrome WebView (개발 빌드, USB 디버깅)
adb logcat chromium:V *:S
# 또는 chrome://inspect → WebView console 에서 [DIBAY_CALL] 필터
```

JS·Native 모두 prefix **`[DIBAY_CALL]`** 로 통일.

---

## 시나리오 A — 권한 거부 후 발신

| 단계 | 기대 로그 |
|------|-----------|
| 발신 버튼 | `permission_check_start` |
| OS 거부 | `permission_check_result` (denied) |
| 차단 | `outgoing_blocked_permission` |
| **없어야 함** | `call_start` / `createCall` / `web_accept_*` |

---

## 시나리오 B — 수신 accept 정상

순서 (대략):

1. `accept_click`
2. `permission_check_start` → `permission_check_result`
3. `native_accept_start` → `call_service_start` → `native_accept_success`
4. `web_accept_start` → `web_accept_success`
5. `route_latch_claimed`
6. `agora_join_start` → `agora_join_success`
7. `call_heartbeat_ping` (10초 주기, active 중)

---

## 시나리오 C — 잠금화면/알림 수신

| 항목 | 기대 |
|------|------|
| `IncomingCallActivity` | **1회** (`incoming_activity_created`) |
| 중복 방지 | `duplicate_activity_blocked` 또는 `route_latch_rejected` 는 **의도적 중복 차단 시만** |
| Call 화면 | **1개** |

---

## 시나리오 D — 통화 중 swipe away

| 기대 로그 | 비고 |
|-----------|------|
| `app_swipe_detected` | FGS `onTaskRemoved` |
| `call_end_sent_to_peer` | native PATCH end |
| 상대방 | 통화 **즉시** 종료 |

---

## 시나리오 E — 연속 통화 2회

1회차 종료 후 `route_latch_cleared` 확인.

2회차에서 **오발생 금지:**

- `route_latch_rejected` (정상 accept 경로에서)
- `agora_join_duplicate_blocked` (새 callId)

2회차 정상: accept → route latch → join → success.

---

## 구조 검증 체크리스트 (코드)

| # | 항목 | 로그/동작 |
|---|------|-----------|
| 1 | FGS single-flight | 중복 `startForegroundService` → `call_service_already_running` |
| 2 | Route latch 해제 | end/reject/missed/cleanup → `route_latch_cleared` |
| 3 | Agora join single-flight | 중복 join → `agora_join_duplicate_blocked` |
| 4 | Heartbeat watchdog | 35초 무응답 → `call_heartbeat_timeout` + end (force-stop 보완) |
| 5 | APK QA | 위 A–E logcat 제출 |

---

## 제출 형식

각 시나리오별:

```
### 시나리오 X
기기A (발신/수신): ...
기기B: ...
[DIBAY_CALL] 로그 라인 (시간순)
판정: PASS / FAIL (이유)
```

실기기 2대 없이 CI 에서는 **5번 완료 불가** — 수동 QA 후 이 문서 또는 PR 코멘트에 붙여넣기.
