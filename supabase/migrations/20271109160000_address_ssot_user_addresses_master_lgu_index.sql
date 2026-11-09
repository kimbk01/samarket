-- 주소 SSOT 5단계 (2026-11-09): 대표 주소 시/군 LGU 조회 인덱스.
-- 사용처: 알림 캠페인 지역 대상(lib/admin/notification-campaigns/campaign-target-scan.ts)
--   where is_active and is_default_master and canonical_lgu_id = $1 order by user_id
-- 기존 인덱스 user_addresses_one_master(user_id) where (is_active and is_default_master) 와 같은 조건의 부분 인덱스.
-- 데이터 변경 없음 · 인덱스만 추가(되돌리기: drop index if exists public.user_addresses_master_lgu_idx).
create index if not exists user_addresses_master_lgu_idx
  on public.user_addresses using btree (canonical_lgu_id, user_id)
  where (is_active and is_default_master);
