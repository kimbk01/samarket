# 고객센터 전체 수정 — 운영 DB 되돌림 트랜잭션 검증 (2026-11-28 16:49 PHT)

- 대상: 운영 Supabase `ckdosyydvgzqwpbwuhon` · 마이그레이션 `supabase/migrations/20271129100000_support_full_fix.sql`(PR #690 판, 안전망 포함)
- 방법: `BEGIN;` → 마이그레이션 본문 전체 → 시나리오 24개(결과를 임시 표에 담아 읽음) → `ROLLBACK;` — **저장 없음**
- 시험 계정: 회원 `edc8c2f0-…`(진행 중 문의 없음) · 어드민 `11111111-…`(super_admin 시드)

## 결과 — 24개 모두 설계대로

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | 새 접수(요청 id R1) | 새 문의 SC-100042 · WAITING_ADMIN · 어드민 미읽음 1 · 세션 열림 |
| 2 | 같은 R1 재전송 | 같은 문의·같은 글 · `created=true` · `replayed=true` (새 글 없음) |
| 3 | 같은 분야 다른 요청 id 접수 | 같은 문의에 붙음 · `created=false` · 어드민 미읽음 2 |
| 4 | 붙인 뒤 상태 | 글 2 · 열린 세션 1 |
| 5–6 | 어드민 답변 + 같은 요청 id 재전송 | 답변 1건 · 재전송 `replayed=true` |
| 7 | 답변 뒤 | WAITING_USER · 고객 미읽음 1 · 어드민 글 1 |
| 8 | 고객 「확인했어요」(본 시각 CAS) | RESOLVED · 숫자 0 |
| 9 | 확인했어요 뒤 고객 알림 안전망 행 | 0건 (알림 대상 아님 — 맞음) |
| 10–11 | 재오픈 · 다시 재오픈 | OPEN(`last_message_at` = 재오픈 시각) · 두 번째 `changed=false` |
| 12–13 | 우선순위 HIGH · 같은 값 | 바뀜 · 두 번째 `changed=false` |
| 14–15 | 담당 지정 · 기대 담당자 틀린 지정 | 지정됨 · `case_updated` (CAS) |
| 16–17 | 어드민 종료 · 다시 종료 | RESOLVED · 두 번째 `changed=false` |
| 18–19 | 보관 · 보관 해제 | ARCHIVED · RESOLVED(종료 시각 그대로) |
| 20 | 고객 알림 안전망 행 | 재오픈 1 · 종료 1 (보관 해제·확인했어요·다시 누름은 없음) · 키 = `support_case_resolved:<id>:2026-11-28T08:49:32.477276+00:00` 형식 = 앱 키와 같은 jsonb 문자열 |
| 21 | 마지막 상태 | 열린 세션 0 · 사건 순서 created→status→reopened→priority→assigned→status×3 |
| 22 | 종료 뒤 같은 분야 접수 | 새 문의 SC-100043 (진행 중 아님 → 붙지 않음) |
| 23 | `admin_notifications` 실시간 등록 | 등록됨 |
| 24 | 옛 웹(7개 인자) 호출 | 새 함수가 받아 저장 · `client_request_id` = null · 글 열 같음 |

## 되돌림 확인 (읽기 전용 · 직후)
- 시험 문의 0 · 새 함수 0 · 새 열 0 · 실시간 등록 없음 · 안전망 행 0 — 운영은 검증 전과 같다.

## 작업자 부작용 (먼저 보고)
- 문의 번호 시퀀스(`support_case_public_no_seq`)는 트랜잭션과 함께 되돌려지지 않는다 → **SC-100042·SC-100043 두 번호가 건너뛰어졌다**(다음 실제 문의 = SC-100044). 동작 영향 없음(번호는 이어질 필요 없음). 되돌리려면 운영 시퀀스 쓰기가 필요해 하지 않았다.

## 예외 경로 (따로 되돌림 트랜잭션 2번 · 16:5x PHT)
| 시나리오 | 결과 |
|---|---|
| 종료 문의(RESOLVED `c01ffd4d…`)에 고객 공개 글 | `ERROR P0001: support_case_closed` — 거부 |
| 같은 요청 id 를 다른 보낸 사람(어드민)이 다시 씀 | `ERROR P0001: support_request_id_conflict` — 거부 |
- 직후 읽기 전용 확인: 그 문의 RESOLVED 그대로 · 새 열 없음 · `support_append_message` 는 옛 7개 인자 그대로 · 시험 글 0.

## 재오픈 키 변경 뒤 다시 검증 (6차 재감사 · 17:29 PHT · 되돌림)
- 바뀐 `support_transition_case` 만 올려 실제 종료 문의(`c01ffd4d…`)로 실행:
  재오픈 → `changed=true` · `event_id` = 방금 남긴 재오픈 사건 id · 안전망 키 `support_case_reopened:<id>:<사건 id>` /
  어드민 종료 → 안전망 키 `support_case_resolved:<id>:2026-11-28T09:29:57.897974+00:00` · 두 행 모두 attempts 1(첫 시도 뒤로).
- 직후 읽기 전용: 문의 RESOLVED 그대로 · 새 함수 없음 · 안전망 행 0 · 그 사건 없음.

## 코드로 확인한 것
- 동시 요청 경합(두 연결이 같은 키로 동시에 접수·재오픈)은 도구가 한 연결만 쓰므로 실행으로 재현하지 않았다 — 잠금 순서(재오픈: 문의 행 → 키 잠금 · 접수: 키 잠금 → 진행 중 행만)는 독립 감사 3회로 교착 없음을 확인했다.
