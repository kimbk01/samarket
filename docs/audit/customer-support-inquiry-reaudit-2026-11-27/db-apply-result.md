# 고객 문의 DB 함수 운영 적용 결과 (2026-11-27 · Owner 「적용 진행」)

| 항목 | 결과 |
|---|---|
| 적용 전 정의 | `support_append_message` md5 `a8f0db3d…` · `admin_notification_replay_support_replies` md5 `2e79be46…` = 저장소 기준 정의와 같음(되돌리기 = `db-function-backup-before-apply.sql` 이 가리키는 원 정의) |
| 적용 | `support_append_message_closed_guard` 21:36:42 PHT · `support_replay_unassigned` 21:36:58 PHT (MCP apply_migration) |
| 적용 후 정의 | md5 `52f8ecbc…`(종료 거부·메모 분기 있음) · `8bcfeef0…`(OPEN·WAITING_ADMIN 조건·전원 발송 있음) |
| 권한 | 둘 다 `postgres=X, service_role=X` (적용 전과 같음) |
| D13 동작 (롤백 시험) | SC-100035 에 어드민 메모 → `last_message_at` 그대로 · `updated_at` 갱신 · 상태 그대로 = **PASS** |
| D4 동작 (롤백 시험) | 종료 문의 SC-100036 에 고객 공개 글 → `P0001 support_case_closed` 거부 = **PASS** |
| 재생 함수 동작 (롤백 시험) | 실행 결과 0건(밀린 글 없음) · 고객지원 outbox 0행 = **PASS** |
| 시험 흔적 | `verify-d%` 글 0건 · SC-100036 종료 그대로 |
| 마이그레이션 기록 | 운영 `schema_migrations` 버전 = 적용 시각(`20261127133642`·`20261127133658`), 저장소 파일 이름(`20271127230000`·`20271127240000`)과 번호 다름 — 이 저장소의 기존 MCP 적용 방식과 같은 차이(기록만) |
| 화면·실기기 | NOT_PROVEN |

## 추가 적용 — T1 (2026-11-27 23:3x PHT · Owner 「적용 진행」)
| 항목 | 결과 |
|---|---|
| 적용 전 정의 | `support_append_message` md5 `52f8ecbc…` = `20271127230000` (되돌리기 기준) |
| 적용 | `support_append_message_lock_time` (저장소 `20271127250000`) |
| 적용 후 | md5 `546543e0…` · 권한 `postgres=X, service_role=X` (같음) |
| 롤백 시험 | 종료 문의를 트랜잭션 안에서만 OPEN 으로 바꾸고 어드민 답변 → 고객 글: 글 2건 · 반환값 = 저장값 · 글 시각 > 트랜잭션 시작(잠금 뒤 시각) · 고객 글 시각 > 답변 시각 · 문의 마지막 글 시각 = 가장 늦은 글 · 상태 WAITING_ADMIN = **PASS** (모두 롤백) |
| 작업자 실수(기록) | 첫 시험을 `(함수()).*` 로 써서 함수가 열마다 다시 불려 시각이 갈라져 보였다 — 함수 결함 아님, `select * from 함수()` 로 다시 시험. 롤백이라 남은 것 없음 |
| 시험 흔적 | `verify-%` 글 0 · SC-100036 RESOLVED 그대로 · 진행 중 문의 0 |
