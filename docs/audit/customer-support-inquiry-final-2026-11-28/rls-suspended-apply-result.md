# RLS 정지 운영자 제외 운영 적용 결과 · 2026-11-28

Owner 「RLS 마이그레이션 적용 진행」 (2026-11-28) · 운영 `ckdosyydvgzqwpbwuhon` · `20271128210000_support_rls_suspended.sql` (MCP `apply_migration` 이름 `support_rls_suspended`) · 적용 12:2x PHT.

| 단계 | 결과 |
|---|---|
| 적용 전 | 함수 정의 백업 = `rls-suspended-backup-before-apply.sql` (20271128200000 판과 같음) · 활성 어드민 5명 중 정지 0명 · `profiles.status` = text |
| 적용 뒤 정의 | 정지 조건 포함(`lower(btrim(status)) = 'suspended'`, 최고관리자 제외) · authenticated 실행 권한 true · anon false · 정책 4개 그대로 |
| 어드민 판정 | 활성 어드민 5명 모두 true (정지 0명 — 적용 전과 같음) |
| 정지 시험 (트랜잭션 안에서 상태만 바꾸고 rollback) | 운영자(admin) 정지 → false · 최고관리자 정지 → true(잠김 방지) |
| rollback 확인 | 정지 어드민 0명 · 상태 값 그대로(verified_user 4 · sns_pending 1) |
| 역할 시험 | support 어드민(admin) = 문의 38 · 글 102 읽힘 |

되돌리기: `rls-suspended-backup-before-apply.sql` 실행.
