# 단계 C 적용 결과 (운영 DB · 2026-11-04 08:11 PHT)

| 항목 | 적용 전 | 적용 후 |
|---|---|---|
| 마이그레이션 `admin_push_stage_c` (C-1·C-2·C-5·C-6) | — | success |
| 「푸시만」 초안 | 37 | 0 (37건 → push_and_in_app) · 발송된 push_only 4건 그대로 |
| `marketing_opt_in` 초안 | 2 | 0 (2건 → all) |
| 대기 회차 | 63 (기록 있음 32) | 31 (기록 있음 0) — 32건: 즉시 13 = sent · 테스트 19 = sent 8 / partially_failed 11 (발송 기록으로 재집계) |
| 예전 고유키 `…campaign_id_user_id_key` | 있음 | 없음 (회차 없는 예전 10행용 부분 고유 인덱스 대체) |
| 발송 기록 `notification_event_id` 인덱스 | 없음 | 있음 |
| 회차 새 열 3개 | 없음 | 있음 |
| 초안 아닌 캠페인 변경 | — | 0건 |

작업자 잘못: C-3 첫 실행에서 두 UPDATE 를 한 문장(CTE)에 넣어, 같은 행(2건)에 대한 target_type 변경이 반영되지 않았다(c3_target=0). 바로 별도 UPDATE 로 2건 적용 · 결과 위 표.
