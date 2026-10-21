-- FIN-10 · 운영 스키마 스냅샷 (읽기 전용 SELECT 1건 · 카탈로그만 · 데이터 행/개인정보 없음).
-- 결과(snapshot 컬럼 JSON)를 docs/audit/delivery-owner-2026-10-20/fin10-prod-schema-snapshot.json 으로 저장 후
--   npm run verify:prod-schema-drift
select json_build_object(
  'captured_at', now(),
  'columns', (
    select json_object_agg(t.table_name, t.cols order by t.table_name)
    from (
      select c.table_name::text as table_name,
             json_agg(c.column_name::text order by c.column_name::text) as cols
      from information_schema.columns c
      where c.table_schema = 'public'
      group by c.table_name
    ) t
  ),
  'functions', (
    select json_agg(distinct p.proname::text order by p.proname::text)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  )
) as snapshot;
