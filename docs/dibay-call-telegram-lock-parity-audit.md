# DIBAY Call — Telegram 잠금/잠자기 수신 Parity 감사 (트랙 2 — 보류)

**상태:** **DEFERRED** — V3→V4 회귀 감사 완료 전 진행 안 함  
**최우선 SSOT:** [`dibay-call-v3-v4-regression-audit.md`](./dibay-call-v3-v4-regression-audit.md)

**관련 (트랙 1 — CODE PASS):** [`dibay-call-lock-receive-qa.md`](./dibay-call-lock-receive-qa.md)

> 회귀가 확인되면 “Telegram과 같게 만들기 위해 V3 경로를 제거한 것이 맞는지”를 **회귀 감사 후** 재검토한다.

---

## 확인된 사실 (추측 아님)

| 항목 | Telegram | DIBAY |
|------|----------|-------|
| 동일 기기 | SM-A176B / Android 16 | 동일 |
| 잠금/잠자기 수신 | **정상** | **FSI AppOps deny** · 잠금 FSI Activity 미표시 |
| Telecom self-managed | **미확인** — 감사 전제 아님 | **아님** (`ConnectionService` / `PhoneAccount` 미사용) |

> **Telegram이 self-managed이기 때문에 정상이라는 근거는 없다.** self-managed 전환은 **후보일 뿐**이며, 감사 결과 전 구현·문서에서 전제하지 않는다.

**원칙:** 추측으로 구조 변경 금지. 동일 기기·동일 조건 **실측 비교** 결과가 DIBAY 통화 구조의 **최종 SSOT**가 된다.

---

## Phase 2-1 (필수) — 실측 비교 감사

동일 기기에서 Telegram vs DIBAY Android 통화 수신 구조를 수집·대조한다.

### 비교 항목

| # | 항목 | 수집 |
|---|------|------|
| 1 | Notification Channel | `dumpsys notification` · 채널 id/importance/blocked |
| 2 | Notification.CallStyle | 수신 중 `dumpsys notification --noredact` |
| 3 | Foreground Service | `dumpsys activity services` · FGS 타입·시작 경로 |
| 4 | Full-Screen Intent | notification `fullScreenIntent` · Activity stack |
| 5 | AppOps | `appops get … USE_FULL_SCREEN_INTENT` 등 |
| 6 | dumpsys notification | 게시 중 알림 전체 스냅샷 |
| 7 | dumpsys activity | 잠금 수신 시 top/resumed Activity |
| 8 | dumpsys package | 권한·컴포넌트·서비스 선언 |
| 9 | dumpsys telecom | PhoneAccount · Connection · self-managed 여부 |
| 10 | Role | `dumpsys role` (call 관련 role) |
| 11 | ConnectionService 등록 | manifest + `dumpsys package` |
| 12 | PhoneAccount 등록 | `dumpsys telecom` |

### 수집 스크립트 (기기 `-s RRGL4046NTW`)

```bash
ADB="adb -s RRGL4046NTW"
DIBAY=com.dibay.app
# Telegram 패키지 — 기기 설치본 확인 후 교체
TG=$(adb -s RRGL4046NTW shell pm list packages | grep -i telegram | head -1 | tr -d '\r' | cut -d: -f2)

for PKG in "$DIBAY" "$TG"; do
  echo "======== $PKG ========"
  $ADB shell appops get "$PKG" USE_FULL_SCREEN_INTENT
  $ADB shell dumpsys package "$PKG" | grep -E 'permission|ConnectionService|InCallService|FOREGROUND_SERVICE|FULL_SCREEN|PhoneAccount|BIND_TELECOM'
done

$ADB shell dumpsys role | grep -iE 'call|dialer|telecom'
$ADB shell dumpsys telecom | head -120
$ADB shell dumpsys notification --noredact | grep -iE 'dibay|telegram|CallStyle|fullScreen|ongoing|incoming' | head -80
```

**수신 중 스냅샷:** 잠금 상태에서 수신 1회씩 트리거 후 `dumpsys notification` · `dumpsys activity activities` 즉시 캡처 (별도 QA 세션).

### Phase 2-1 산출물

- [`dibay-call-telegram-parity-audit-sm-a176b.json`](./artifacts/dibay-call-telegram-parity-audit-sm-a176b.json) (실측 raw 요약)
- 대조 표 (아래 §실측 결과 — 감사 완료 시 채움)

---

## Phase 2-2 — 차이 확정

Phase 2-1 raw만으로 아래 중 **실제 차이**를 표시한다. 해당 없으면 `동일` / `미사용` 명시.

| 후보 축 | 질문 |
|---------|------|
| CallStyle | Telegram은 CallStyle·action 버튼으로 잠금 UI? DIBAY fallback과 동일 계열인가? |
| FGS | Telegram은 수신 시 FGS 유지? DIBAY `ForegroundServiceStartNotAllowedException`과 대비? |
| Notification Channel | importance · bypass DND · channel block 차이? |
| Telecom | ConnectionService / PhoneAccount / self-managed **등록 여부** (Telegram도 없을 수 있음) |
| FSI / AppOps | 동일 deny인데 Telegram만 동작하면 **FSI 외 경로** 확정 |
| 기타 정책 | 배터리 최적화 · OEM sleeping apps · role holder |

**금지:** Phase 2-2 전에 “Telegram = self-managed” 또는 “DIBAY = self-managed 전환 필요” 결론.

---

## Phase 2-3 — 방향 결정 (감사 후 1개)

Phase 2-2 차이 확정 **이후** 아래 중 **하나**만 선택:

| 옵션 | 조건 |
|------|------|
| **현재 구조 유지** | 차이가 설정·AppOps 유도로 해소 가능 |
| **CallStyle / FGS 보강** | 실측상 Telegram이 notification/FGS 경로이고 DIBAY만 부족 |
| **Telecom self-managed 전환** | 실측상 Telegram이 Telecom 경로이고 notification-only로 parity 불가 |

구현 PR은 Phase 2-3 단일 권고 승인 후.

---

## Parity LOCK (트랙 2)

동일 SM-A176B · 동일 잠금/잠자기 조건:

- [ ] DIBAY 수신 UI **1개** (수락·거절·cleanup)
- [ ] UI 0개/2개 없음
- [ ] Telegram과 **동등** 체감 (실측 경로 기준)

트랙 1 LOCK B만으로 트랙 2 PASS 아님.

---

## 실측 결과 (Phase 2-1 — 1차 수집 완료, 수신 중 스냅샷 대기)

**캡처:** 2026-06-26 · RRGL4046NTW · idle + 채널/컴포넌트 (수신 ringing 중 `dumpsys notification` · `activity` · `telecom` **미수집**)

Raw: [`artifacts/dibay-call-telegram-parity-audit-sm-a176b.json`](./artifacts/dibay-call-telegram-parity-audit-sm-a176b.json)

| 항목 | Telegram (`org.telegram.messenger`) | DIBAY (`com.dibay.app`) |
|------|--------------------------------------|-------------------------|
| `USE_FULL_SCREEN_INTENT` AppOps (uid mode) | **allow** | **deny** |
| `USE_FULL_SCREEN_INTENT` manifest | granted | granted |
| `MANAGE_OWN_CALLS` | granted | granted |
| `CALL_PHONE` | granted | 미선언 |
| ConnectionService (manifest) | **`TelegramConnectionService` 등록** | **없음** |
| PhoneAccount (`dumpsys telecom`, idle) | 미등록 | 미등록 |
| 수신 채널 (importance) | `incoming_calls40` (4) | `dibay_calls_incoming_v7` (4) |
| Role (dialer 등) | DIBAY/Telegram holder 아님 | 동일 |
| 배터리 화이트리스트 | 없음 | 없음 |

**Phase 2-1 잔여:** 잠금/잠자기 **수신 1회**마다 즉시 `dumpsys notification --noredact` · `dumpsys activity activities` · `dumpsys telecom` 캡처.

---

## Phase 2-2 — 차이 확정 (사실만, 인과 추측 금지)

### 확정된 구조/정책 차이 (idle 실측)

| 축 | Telegram | DIBAY | 비고 |
|----|----------|-------|------|
| **FSI / AppOps** | uid mode **allow** | uid mode **deny** | 동일 기기에서 **불일치** |
| **Telecom ConnectionService** | manifest **있음** | **없음** | Telegram이 수신 시 이 경로를 쓰는지는 **수신 스냅샷 전 미확정** |
| **PhoneAccount (idle)** | 없음 | 없음 | 수신 시 동적 등록 여부 미확인 |
| **Notification channel** | `incoming_calls40` imp=4 | `dibay_calls_incoming_v7` imp=4 | importance 동급 |
| **CALL_PHONE** | granted | 없음 | Telecom PSTN 아님 VoIP 가정 시 직접 인과 미확정 |

### 아직 확정 안 됨 (수신 QA 필요)

- Telegram 잠금 UI가 **Telecom / FSI / CallStyle / FGS** 중 어느 경로인지
- ConnectionService 존재가 잠금 수신 **성공 원인**인지 ( **가정 금지** )
- DIBAY `category=call` ongoing 알림이 FSI deny에서 잠금에 노출되는지
- `ForegroundServiceStartNotAllowedException` 발생 시점 vs Telegram FGS

---

## Phase 2-3 — 방향 결정

**상태: 보류** — Phase 2-1 수신 스냅샷 + Phase 2-2 인과 확정 후 단일 선택.

| 후보 | 전제 |
|------|------|
| 현재 구조 유지 | 차이가 AppOps 설정·채널 수준으로 해소 가능할 때만 |
| CallStyle / FGS 보강 | 실측상 Telegram이 notification/FGS 경로일 때 |
| Telecom self-managed 전환 | 실측상 Telegram이 Telecom 경로이고 notification-only로 parity 불가일 때만 |

> **self-managed 전환은 후보일 뿐.** “Telegram이 ConnectionService를 쓰므로 DIBAY도 전환” 식의 추론 **금지**.

---

## 제출 형식

```
### Phase 2-1
기기: SM-A176B
Telegram pkg: ...
DIBAY pkg: com.dibay.app
(항목별 raw 요약)

### Phase 2-2
확정 차이: CallStyle | FGS | Channel | Telecom | FSI/AppOps | 기타 | (복수 가능)

### Phase 2-3
권고: 유지 | CallStyle/FGS 보강 | self-managed 전환
근거: (실측 1줄)
트랙 2: OPEN | PASS | FAIL
```
