# DIBAY 통화 P0 안정화 — 수동 QA 체크리스트

**범위:** Android APK 우선 · iOS CallKit 보조 · 통화 내역 중복 발신 방지 · swipe away 복구

로그 수집:

```bash
adb logcat -s DIBAY_CALL
```

WebView console: `[DIBAY_CALL]` 필터

---

## P0 시나리오

| # | 시나리오 | PASS 기준 | 로그 |
|---|----------|-----------|------|
| 1 | active 통화 중 Android 최근앱에서 DIBAY swipe | ongoing notification 유지, 상대 통화 **임의 종료 없음** | `task_removed_keep_foreground_service` |
| 2 | ongoing notification tap | 동일 callId `/calls/{id}?source=native_resume` | `notification_resume_route`, `pending_route_saved` |
| 3 | ringing 중 swipe → 알림 수락 | 동일 callId 연결, 새 POST 없음 | `route_latch_claimed` |
| 4 | active 중 cold start | 기존 callId 화면 복구 | `active_session_resume_from_native` |
| 5 | 통화 내역 버튼 10연타 | POST `/calls` 1회 | `call_history_start_lock_acquired` 1회 |
| 6 | A redial 직후 B redial | B 차단, A callId 유지 | `call_history_start_blocked_active_call` 또는 `call_history_start_lock_reused` |
| 7 | 수신 ringing 중 통화 내역 발신 | 버튼 disabled | UI |
| 8 | 종료 후 | notification·ringtone·UI 제거 | `active_session_hard_clear`, `foreground_service_stopped` |
| 9 | ended callId deep link | 통화 화면 잔류 없음 | terminal latch |
| 10 | notification End action | FGS stop, 상대 end | `foreground_service_stopped`, `call_end_sent_to_peer` |
| 11 | (optional) onboarding notification step 직후 FSI 설정 안내 | skip 가능, accept 흐름 변경 없음 | — |

---

## 회귀 (기존 계약)

- FCM incoming → `incoming_received` · accept single-flight 유지
- `dibay_call_pending_route` terminal latch — stale route 재진입 차단
- Agora join duplicate blocked — 2회차 통화 정상 join
- iOS VoIP `dibay:voip-call-action` → accept gateway / hardClear (stub plugin)

---

## unit test

```bash
npx vitest run lib/call/__tests__/ lib/community-messenger/__tests__/incoming-call-*.test.ts
npx tsc --noEmit
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Log marker grep (after assemble):

```bash
strings android/app/build/outputs/apk/debug/app-debug.apk | grep -E 'task_removed_keep_foreground_service|notification_resume_route|active_session_hard_clear' || true
```

---

## 제출 형식

```
### 시나리오 N
기기A: ...
기기B: ...
[DIBAY_CALL] (시간순)
판정: PASS / FAIL
```
