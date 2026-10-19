-- =====================================================================================
-- C-48 복구 — QA 홍보 주문 3건의 1970 종료일(end_at) 정정 + end_at >= start_at 제약
-- 상태: Owner 승인 필요 (운영 DB 실행 미승인). Supabase SQL Editor 에서 전체를 한 번에 실행.
--
-- 원인: lib/promotion/__tests__/community-paid-exposure-runtime.e2e.test.ts (및 같은 패턴의
--       ad-hoc QA 스크립트)가 서비스 롤로 운영 DB 에 end_at = new Date(0) 을 기록.
-- 범위: 아래 3건만. 주문 ID + idempotency_key + 현재 end_at(1970) + order_status 4중 조건.
-- 원장: 변경 없음 (QA admin_credit +10000 ↔ spend −10000 이 주문별로 상쇄, 환급 없음).
-- 감사: 정정 전·후 행 전체를 audit_logs(before_json/after_json)에 같은 트랜잭션으로 기록.
-- 실패: 어떤 검증이든 어긋나면 RAISE → 전체 ROLLBACK (부분 반영 없음).
-- =====================================================================================
begin;

-- 0) 대상 고정
create temp table c48_target (id uuid primary key, idempotency_key text not null) on commit drop;
insert into c48_target values
  ('b7ba4555-be63-4957-804f-bdcf10b8fbec', 'qa-a2-514324e0-c4ae-452e-baa4-db88fdb1ae63'),
  ('4e1bbb59-02b6-400c-a117-4bcb57f00048', 'qa-a2-a49cbea6-8543-4197-b057-5d757859be0a'),
  ('de06f845-c12a-43a1-8b34-e7ec75afa388', 'qa-top-pin-close-e8c94714-b1ed-4a8f-8a62-f2a62ebe8536');

-- 1) 사전 검증: 3건 정확히 일치 + 이 3건 외에 end_at < start_at 위반 행 없음
do $$
declare v_match int; v_other_bad int;
begin
  select count(*) into v_match
    from public.point_promotion_orders o join c48_target t on t.id = o.id and t.idempotency_key = o.idempotency_key
   where o.end_at = timestamptz '1970-01-01 00:00:00+00' and o.order_status = 'ended' and o.domain = 'community';
  if v_match <> 3 then raise exception 'C-48 precheck: expected 3 target rows, found %', v_match; end if;

  select count(*) into v_other_bad from public.point_promotion_orders o
   where o.end_at < o.start_at and o.id not in (select id from c48_target);
  if v_other_bad <> 0 then raise exception 'C-48 precheck: % other rows violate end_at >= start_at', v_other_bad; end if;
end $$;

-- 2) 대상 외 전체 행 지문(정정 후 동일해야 함)
create temp table c48_other_fp on commit drop as
select md5(coalesce(string_agg(to_jsonb(o)::text, '|' order by o.id), '')) fp, count(*) n
  from public.point_promotion_orders o where o.id not in (select id from c48_target);
create temp table c48_ledger_fp on commit drop as
select md5(coalesce(string_agg(to_jsonb(l)::text, '|' order by l.id), '')) fp, count(*) n from public.point_ledger l;

-- 3) 정정 전 스냅샷
create temp table c48_before on commit drop as
select o.* from public.point_promotion_orders o where o.id in (select id from c48_target);

-- 4) 정정: 실제 노출 종료 시각은 기록되지 않음(QA 가 수 초 내 종료) → 시각을 지어내지 않고 0초 노출로 기록
update public.point_promotion_orders o
   set end_at          = o.start_at,
       end_reason_code = 'qa_cleanup_c48',
       review_reason   = coalesce(o.review_reason, 'C-48: QA E2E 가 기록한 1970 종료일 정정 (end_at := start_at, 실제 종료 시각 미기록)')
  from c48_target t
 where o.id = t.id and o.idempotency_key = t.idempotency_key
   and o.end_at = timestamptz '1970-01-01 00:00:00+00' and o.order_status = 'ended';

-- 5) 감사 기록 (전·후 행 전체)
insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
select 'system', null, 'community_promotion_order', b.id::text, 'community_promotion_order.c48_end_at_correction',
       to_jsonb(b), to_jsonb(a)
  from c48_before b join public.point_promotion_orders a on a.id = b.id;

-- 6) 사후 검증: 3건만 바뀜 · 다른 주문/원장 지문 동일 · 감사 3건
do $$
declare v_fixed int; v_audit int; v_bad int;
begin
  select count(*) into v_fixed from public.point_promotion_orders
   where id in (select id from c48_target) and end_at = start_at and end_reason_code = 'qa_cleanup_c48';
  if v_fixed <> 3 then raise exception 'C-48 postcheck: fixed % rows (expected 3)', v_fixed; end if;

  if (select fp from c48_other_fp) is distinct from
     (select md5(coalesce(string_agg(to_jsonb(o)::text, '|' order by o.id), '')) from public.point_promotion_orders o
       where o.id not in (select id from c48_target)) then
    raise exception 'C-48 postcheck: other promotion orders changed';
  end if;
  if (select fp from c48_ledger_fp) is distinct from
     (select md5(coalesce(string_agg(to_jsonb(l)::text, '|' order by l.id), '')) from public.point_ledger l) then
    raise exception 'C-48 postcheck: point_ledger changed';
  end if;

  select count(*) into v_audit from public.audit_logs
   where action = 'community_promotion_order.c48_end_at_correction' and target_id in (select id::text from c48_target);
  if v_audit <> 3 then raise exception 'C-48 postcheck: audit rows % (expected 3)', v_audit; end if;

  select count(*) into v_bad from public.point_promotion_orders where end_at < start_at;
  if v_bad <> 0 then raise exception 'C-48 postcheck: % rows still violate end_at >= start_at', v_bad; end if;
end $$;

-- 7) 재발 방지 제약 (기존 데이터 호환 확인 후 VALIDATE)
alter table public.point_promotion_orders drop constraint if exists point_promotion_orders_end_after_start;
alter table public.point_promotion_orders
  add constraint point_promotion_orders_end_after_start check (end_at >= start_at) not valid;
alter table public.point_promotion_orders validate constraint point_promotion_orders_end_after_start;

commit;

-- 실행 후 확인 (읽기 전용)
-- select id, start_at, end_at, end_reason_code, order_status from public.point_promotion_orders
--  where id in ('b7ba4555-be63-4957-804f-bdcf10b8fbec','4e1bbb59-02b6-400c-a117-4bcb57f00048','de06f845-c12a-43a1-8b34-e7ec75afa388');
-- select count(*) from public.audit_logs where action = 'community_promotion_order.c48_end_at_correction';  -- 3

-- -------------------------------------------------------------------------------------
-- 되돌리기 (필요 시에만): 제약 제거 후 감사 before_json 으로 원복
-- begin;
-- alter table public.point_promotion_orders drop constraint if exists point_promotion_orders_end_after_start;
-- update public.point_promotion_orders o
--    set end_at = (a.before_json->>'end_at')::timestamptz,
--        end_reason_code = a.before_json->>'end_reason_code',
--        review_reason = a.before_json->>'review_reason'
--   from public.audit_logs a
--  where a.action = 'community_promotion_order.c48_end_at_correction' and a.target_id = o.id::text;
-- commit;
