# E-C2 상세 설계 — 통화 12상태 구분

- 작성: 2026-10-23 ~21:35 PHT · **Owner 조건부 승인 2026-10-23 ~21:35+ PHT**
- 상위: `stage-e-scope-report.md` · 계획 §1 P2
- 선행 CLOSED: E-C1 · 발신자 안내(`c30d0a971`)
- **확정:** 12=제품/UI · DB status 12종 금지 · C2-A만 이번 구현 · #10 기록 금지 · #3≠#4 중복 기록 금지 · #9는 증거 있을 때만
- 표: `stage-e-c2-a-product-state-table.md`
- **제외:** E-C3/SIDE-08 · E-F1 · SIDE · VoIP/FCM/CallKit · C2-B/C/D(별도 승인)

---

## 1. 문제 (확정)

| 사실 | 근거 |
|---|---|
| DB session status 실사용은 사실상 **4종** | cancelled · missed · ended · rejected (+ E-C1 busy는 cancelled+ended_reason) |
| Owner 정책 **12상태** 중 합쳐진 것 | 연결불가≈무응답 · 재연결≈연결 · 네이티브 연결실패≈정상종료 · 재연결실패≈종료 |
| 알 수 없는 status → 「거절」 매핑 함정 | `mapCallV4RemoteTerminalReason` fallback `rejected` |
| presentation은 이미 viewer canonical 다수 | `call-log-display-type` · `resolveCallEventCanonical` (busy/unanswered/rejected 방향 등) |

---

## 2. 제품 목표 (E-C2)

1. **제품 표 1장**으로 12상태(또는 Owner가 확정한 N상태)의  
   서버 `status` / `ended_reason` · 네이티브 reason · 기록 배지 · 방 stub · 인앱 안내 를 1:1로 고정.
2. **합쳐진 4쌍을 분리**할 수 있는 최소 wire(우선 `ended_reason` · 스키마 status 추가는 최후).
3. 구 클라이언트·기존 4 status **호환** (새 reason을 모르는 클라 = 안전한 fallback 라벨, 「거절」오분류 금지).
4. A행렬·E-C1·발신자 안내 **무회귀**.

---

## 3. 현재 canonical ↔ 목표 매핑 (초안 · 승인 대상)

| # | 제품 상태(초안 이름) | 현재 합쳐짐 | 제안 wire | 기록 배지(초안) | 비고 |
|---|---|---|---|---|---|
| 1 | 발신 취소 | cancelled | `cancelled` + `canceled`/`caller_cancel` | 취소 | 현행 |
| 2 | 수신 거절 | rejected | `rejected` | 거절함/거절됨 | 현행 viewer 분기 |
| 3 | 연결(수락) | active→ended | `ended` + answered | 수신/발신 | 현행 |
| 4 | 정상 종료 | ended | `ended` + `ended_by_*` | 동일 | 현행 |
| 5 | 상대 통화 중 | (E-C1) | cancelled + `peer_busy` | 다른 통화 중 | CLOSED |
| 6 | 본인 통화 중 | (E-C1) | cancelled + `caller_busy` | 다른 통화 중 | CLOSED |
| 7 | 무응답(발신) | missed | missed + caller `no_answer` 안내 | 부재중/응답없음 | 안내 CLOSED · 배지 정합 |
| 8 | 부재중(수신) | missed | missed (callee) | 부재중 | 현행 |
| 9 | 연결 불가 | **=무응답** | **신규** `ended_reason=unreachable` 또는 failed_* | 연결 불가 | 분리 대상 |
| 10 | 재연결 중 | **=연결 UI** | 세션 status 유지 · notice `reconnecting`만? | (진행 중) | 기록 행 여부 Owner |
| 11 | 네이티브 연결 실패 | **=정상종료** | **필수** native→web `ended_reason=failed_*` 전송 | 실패 | 네이티브 변경 가능 |
| 12 | 재연결 실패 | **=종료** | `ended` + `reconnect_failed` | 실패/종료 | 분리 대상 |

**열린 결정(Owner):**  
- 12가 「제품 라벨 12종」인지 「DB status 12종」인지. **권장: DB status는 기존 4~5 유지 + `ended_reason`으로 12 라벨.**  
- #10 재연결을 **통화 기록 행으로 남길지**(권장: 남기지 않음 · 인앱 진행 배너만).

---

## 4. 권장 구현 단계 (승인 후)

| Phase | 범위 | 네이티브 빌드 |
|---|---|---|
| **C2-A** | 함정 제거: unknown → 중립 **`ended`**(거절·실패 단정 금지) · 제품 표 · 단위 테스트 · **main은 별도 승인** | 웹만 |
| **C2-B** | #11 네이티브 연결 실패 reason 전달 · 기록 `failed` | **네이티브** |
| **C2-C** | #9 연결 불가 vs #7 무응답 분리(신호/타임아웃 기준) | 웹(+필요 시 네이티브) |
| **C2-D** | #12 재연결 실패 reason | 웹/네이티브 |

한 커밋 = 한 Phase. C2-A만 먼저 승인·배포 가능.

---

## 5. 불변

- busy 게이트·E-C1 기록 · 발신자 `no_answer` 안내
- CallKit/VoIP A1 fence
- SIDE-08/E-C3 표시 형태

---

## 6. 실기기 완료 기준 (승인 표 기준)

승인된 각 상태 전이 1회 이상 · 통화 탭 배지 = 표 · 방 stub 중복 없음 · A행렬 무회귀 · Production SHA 고정.

---

## 7. Owner 승인 게이트

1. **12 = ended_reason 라벨** (status 스키마 확장 없음) 수용?  
2. Phase **C2-A → B → C → D** 순서 수용?  
3. #10 재연결은 **기록 미작성** 수용?  
4. 제품 표 #1~12 이름·카피 수정 요청?

**승인 후** C2-A부터 구현.
