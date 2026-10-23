# E-C2-A — 제품 12상태 표 (UI 구분 · DB status ≠ 12종)

- 작성: 2026-10-23 · Owner 조건부 승인 반영
- 정책: **기존 DB `status` 유지** · 구분은 `ended_reason`·viewer·UI · **기록 중복 금지** (#3≠#4 별도 행 금지) · #10 기록 금지 · #9는 연결 실패 증거 있을 때만(C2-C)

범례: **수집됨** = 현재 코드/실기기에서 확인 · **NOT_PROVEN** = 아직 분리 신호 없음(추정 금지)

| # | 제품 상태 | 진행/결과 | DB status (현행) | ended_reason (현행·예) | 네이티브 reason | 통화 기록 배지 | 채팅방 stub/표시 | 인앱 안내 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 발신 취소 | 결과 | `cancelled` | `canceled` / `caller_cancel` 등 | 수집됨(경로별) | 취소 | 취소 스텁 | 없음(NONE) | 유지 |
| 2 | 수신 거절 | 결과 | `rejected` | reject 계열 | 수집됨 | 거절함/거절됨 | 거절 | peer_declined | 유지 |
| 3 | 연결(수락) | **진행** | `active` (일시) | — | 수집됨 | **별도 종료 행 없음** | — | 없음 | #4와 **동일 통화 1기록** |
| 4 | 정상 종료 | 결과 | `ended` | `ended_by_caller` / `ended_by_callee` | 수집됨 | 발신/수신 | 종료 | silent(NORMAL_ENDED) | #3 수락 후 최종 1행 |
| 5 | 상대 통화 중 | 결과 | `cancelled` | `peer_busy` | N/A(세션 전 게이트) | 통화 중 | 로컬/발신자 | peer_busy | E-C1 |
| 6 | 본인 통화 중 | 결과 | `cancelled` | `caller_busy` | N/A | 다른 통화 중 | 발신자 | caller_busy | E-C1 |
| 7 | 무응답(발신) | 결과 | `missed` | `missed` | 수집됨 | 부재중/응답없음 | 부재 | **no_answer** (발신) | 발신자 안내 CLOSED |
| 8 | 부재중(수신) | 결과 | `missed` | `missed` | 수집됨 | 부재중 | 부재 | missed(수신 경로) | 유지 |
| 9 | 연결 불가 | 결과 | NOT_PROVEN 분리 | **증거 있을 때만** (C2-C) | NOT_PROVEN | (미분리) | (미분리) | (미분리) | **무응답과 추정 혼동 금지** |
| 10 | 재연결 중 | **진행** | live 유지 | — | reconnecting notice | **기록 생성 금지** | — | reconnecting 배너 | Owner 확정 |
| 11 | 네이티브 연결 실패 | 결과 | 종종 `ended`로 합쳐짐 | failed_* **미전송 다수** | NOT_PROVEN→C2-B | 실패(목표) | — | call_failed(목표) | **C2-B·네이티브 별도 승인** |
| 12 | 재연결 실패 | 결과 | `ended`에 합쳐짐 | NOT_PROVEN | NOT_PROVEN | (미분리) | — | — | C2-D |

## C2-A에서 고친 함정

| 이전 | 이후 |
|---|---|
| `mapCallV4RemoteTerminalReason` 알 수 없는 status → **`rejected`(거절)** | → 중립 **`ended`(종료 경로)** · 거절/실패 단정 금지 |

구 클라이언트: 기존 4 status + busy/no_answer wire **불변**. 알 수 없는 값만 거절 오분류 제거.
