# L13 옛 알림 정리 실행 결과 · 2026-11-28

Owner 「정리 실행」 → 영향(발송 기록 34행 연결 NULL) 보고 → Owner 「포함해 정리」 (2026-11-28). 대상 운영 `ckdosyydvgzqwpbwuhon`.

| 단계 | 결과 |
|---|---|
| 실행 전 조회 | `notification_events` 옛 어드민 종류 45행(support_case_created 27 · support_case_assigned 12 · support_customer_replied 6) · 안 읽음 0 · 가리키는 `notification_deliveries` 34행 (외래키 ON DELETE SET NULL) · 캠페인 표 2개 0행 |
| 백업 | 45행 전 열 + 발송 기록 34행의 (id, notification_event_id) → `data-cleanup-l13-backup.json` (**저장소에 올리지 않음** — 회원 id·시험 문의 본문 포함, 작업자 PC 에만 있음) |
| 실행 | 한 트랜잭션: 개수 확인(45 · 안 읽음 0 · 연결 34, 다르면 예외로 전체 rollback) → 삭제 → commit |
| 실행 뒤 조회 | 옛 어드민 종류 0행 · 고객용 종류 그대로(support_admin_replied 31 · support_case_resolved 36 · support_case_reopened 4) · 발송 기록 34행 모두 남아 있고 34행 모두 `notification_event_id` = NULL |
| 화면 영향 | 없음 — 45행 모두 읽음 상태였다(알림함·배지 숫자 불변, 코드 판단) |

되돌리기: 백업 JSON 의 events 를 insert 한 뒤 deliveries 34행의 `notification_event_id` 를 백업 값으로 update.
