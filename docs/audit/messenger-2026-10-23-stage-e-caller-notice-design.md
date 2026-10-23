# E — 발신자 안내(무응답) 상세 설계

- 작성: 2026-10-23 ~20:55 PHT · **구현 전 Owner 승인 필요**
- 상위: `stage-e-scope-report.md` · 계획 §1 P2 · `call-v4-actions.ts` CALL-04
- Owner 순서: E-C1 **CLOSED** → **본 단계(발신자 안내)** → E-C2 → E-C3
- **제외:** SIDE-01~07 · SIDE-08(표시 형태·중앙 팝업·기기 통일 — 향후/E-C3) · E-F1 · E-C2 12상태 전면 · 스키마 변경 · VoIP/FCM/CallKit 정책 변경

---

## 1. 문제 (확정 사실)

| 사실 | 근거 |
|---|---|
| 무응답(링 타임아웃) 시 **발신자 인앱 안내가 없다** | 계획 §1 P2 · `call-v4-actions.ts` `finalizeOutgoingMissedTimeout` |
| 발신자 터미널 reason 은 의도적으로 **`no_answer`** | CALL-04 주석: callee `missed` 와 분리 |
| `no_answer` → `classifyCallTerminalReason` → **`NONE`** → notice **null(침묵)** | `call-in-app-notice-contract.ts` · 테스트 CALL-04/CALL-02 |
| 수신자(피어) 쪽 `missed` 안내·부재중 알림 계약은 **별개** | `missed` event · `cm_ui_missed_call_notification`「부재중 알림」 |
| 통화 **기록**에는 무응답/부재 라벨이 이미 있음 | `cm_call_status_no_answer` 등 · E-C1과 무관하게 세션/로그는 missed 경로로 남음 |
| 현재 안내 UI는 **배너**만 (`BANNER`) | E-C3·SIDE-08 = 중앙 팝업·기기 통일 **본 단계 범위 밖** |

**제품 갭:** 발신자가 상대 무응답으로 통화가 끝날 때 「왜 끝났는지」인앱 피드백이 없음(화면만 닫힘).

---

## 2. 제품 목표 (본 단계만)

1. **발신자**가 링 타임아웃(무응답)으로 종료될 때 **인앱 안내 1회**.
2. 문구는 **수신자 「부재중」과 구분** — 발신자 시점이므로 「상대가 받지 않음 / 응답 없음」.
3. **수신자 missed 푸시·알림·CallKit·VoIP 경로 불변.**
4. **DB 스키마·status CHECK·ended_reason taxonomy 대규모 확장 없음** (wire에 이미 쓰는 `no_answer` 활용).
5. 표시 **형태**(상단 배너 vs 중앙 팝업)·기기별 통일은 **SIDE-08 / E-C3** — 본 단계는 **기존 배너 계약에 이벤트만 추가**.

---

## 3. 권장 설계

### 3.1 한 줄

> `finalizeCallV4Terminal(..., "no_answer")` 가 이미 타는 경로에서,  
> `no_answer` 를 **침묵(NONE)이 아니라** 신규 notice event **`no_answer`** 로 매핑해  
> 발신자에게만 배너 1회 표시한다.  
> callee `missed` event·카피·푸시는 그대로 둔다.

### 3.2 왜 새 event인가 (`missed` 재사용 금지)

| 대안 | 판정 |
|---|---|
| (A) `no_answer` → 기존 `missed` event | **금지.** 카피「부재중 알림」은 **수신자** 시점. 발신자에게 부재중이라고 하면 의미 역전. |
| (B) `no_answer` → `peer_declined` | **금지.** 거절과 무응답 혼동. |
| (C) **권장: event `no_answer` 신설** | CALL-04 분리 의도 유지 · 카피 독립 · classify에 `NO_ANSWER` 또는 MISSED와 다른 class |

### 3.3 Terminal class / 매핑

| RAW reason | CallTerminalClass (안) | Notice event | 표시 |
|---|---|---|---|
| `no_answer` | **`NO_ANSWER`** (신규) 또는 기존 NONE 해제 후 전용 | **`no_answer`** | 배너 · ~4.2s |
| `missed` / `missed_call` / … | `MISSED` (현행) | `missed` | 현행(수신자 경로) |
| `cancelled` / `canceled` | `NONE` | 없음 | 발신자 취소 — 안내 없음 유지 |

`caller_busy` / `peer_busy` / `rejected` 매핑 **불변** (E-C1 PASS 유지).

### 3.4 카피 (초안 · i18n 신규 key)

| key | ko | en |
|---|---|---|
| `cm_ui_call_no_answer` | 상대방이 응답하지 않았습니다. | The other person did not answer. |

- fallback = 위 문장 (key 노출 금지).
- 기록 탭 `cm_call_status_no_answer`(「부재중」)와 **문구를 억지로 통일하지 않음** — 목록은 짧은 배지, 안내는 문장.

### 3.5 코드 터치 (예상 · 웹/Cap)

| 영역 | 변경 |
|---|---|
| `call-in-app-notice-contract.ts` | event `no_answer` · class 매핑 · spec BANNER |
| `call-in-app-notice-store.ts` | FALLBACKS |
| catalog ko/en | `cm_ui_call_no_answer` |
| `call-v4-actions` | **로직 분기 최소** — 이미 `finalize(..., "no_answer")` → `showCallInAppNoticeFromTerminalReason` 가 null 이던 것만 살아남 |
| 테스트 | CALL-04 테스트 **의도 변경**: silent → `no_answer` event · callee `missed` 분리 유지 |
| iOS `NativeCallInAppNotice.swift` | **패리티 권장**(동일 reason→event). Cap WebView만으로 발신 종료 안내가 뜨면 네이티브 오버레이는 2순위. **네이티브 빌드 필요 여부**는 구현 시 Cap 경로만으로 PASS 가능하면 **웹만** |

### 3.6 불변

- 서버 missed PATCH · 수신 VoIP 생략(A1) · CallKit · busy 게이트 · E-C1 busyKind
- 발신자 취소(`cancelled`) 시 안내 추가 **안 함**
- SIDE-08 위치/중앙 팝업 **이번 커밋에 넣지 않음**

---

## 4. 실기기 완료 기준 (승인 후)

| # | 시나리오 | PASS |
|---|---|---|
| 1 | S→X(또는 I) 음성 · 수신 미수락 · 링 타임아웃 | 발신 기기 안내 = **「상대방이 응답하지 않았습니다.」** (또는 승인 카피) 1회 |
| 2 | 동일 통화 수신자 | 「부재중」수신 정책 **회귀 없음**(기존과 동일) |
| 3 | 수신자 거절 | 발신자 **거절** 안내 유지 · no_answer **아님** |
| 4 | 발신자 벨 중 취소 | 안내 **없음** 유지 |
| 5 | busy (peer/caller) | E-C1 카피 **회귀 없음** |
| 6 | 통화 기록 | 무응답 행 1건 유지(기존) |

증거: a11y/XML 또는 스크린샷 · callId · Production SHA.

---

## 5. 위험 · 롤백

| 위험 | 완화 |
|---|---|
| CALL-04 테스트/주석과 제품 의도 충돌로 보임 | 설계·커밋 메시지에「침묵 해제 = Owner 발신자 안내」명시 · callee missed 분리 유지 |
| 배너가 헤더에 가림 (SIDE-08) | **알려진 잔여** · 본 단계 FAIL 아님 · E-C3에서 중앙화 |
| 네이티브·웹 문구 불일치 | Cap 경로 우선 · 네이티브 패리티는 같은 카피 상수 |

롤백: notice 매핑/`no_answer` event 커밋 revert → 재배포(웹).

---

## 6. Owner 승인 게이트

구현·커밋·main·Production 전 확인:

1. 권장안 **(C) event `no_answer` 신설** · 카피 초안 수용 여부  
2. 표시는 **기존 배너**로 진행 (중앙 팝업은 SIDE-08/E-C3)  
3. **웹만** 우선 (네이티브 패리티는 Cap으로 안내 PASS면 후속)  

**승인 후** 구현 → 단독 커밋 → push → 실기기 §4.

---

## 7. 다음 단계 (본 단계 CLOSED 후)

1. **E-C2** 12상태 표 설계  
2. **E-C3** + **SIDE-08** 중앙 공통 팝업·기기 통일  
