-- Owner 2026-11-12 「둘 다 적용」(모임 남은 항목 감사 docs/audit/moim-open-items-audit-2026-11-12.md §3).
-- M1b(20271112200000) 적용 전에 저장한 변경 전 정의 10건(함수 9·뷰 1). 옛 모임 테이블이 삭제돼 되돌리기에 쓸 수 없다.
-- 내용은 docs/audit/moim-m1b-backup-definitions-2026-11-12.sql 로 내보내 저장소에 보관 (10/10 md5 일치 확인).
-- 의존 객체 0 (pg_depend 조회 2026-11-12).
drop table if exists public._moim_m1b_backup_20261112;
