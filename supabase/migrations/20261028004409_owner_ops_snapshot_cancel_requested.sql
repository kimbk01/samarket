-- 알림 재감사 D-Q1 (Owner 결정·승인 2026-10-28): 오너 「주문」 처리 대기 = 접수대기 + 환불 + 취소요청.
-- FAB(store-operation-c-projection)는 취소요청을 세는데 오너 관리자 하단·사이드바·긴급 숫자의 원천인
-- get_owner_store_ops_snapshot_counts 에 cancel_requested 집계가 없어 같은 매장 숫자가 달랐다.
-- 기존 필드는 그대로 두고 cancel_requested_count 만 추가한다.

BEGIN;

DO $do$
DECLARE
  d text;
  agg_marker constant text := $m$)::int AS refund_requested_count,$m$;
  agg_add constant text := $a$)::int AS refund_requested_count,
      coalesce(sum(CASE WHEN order_status = 'cancel_requested' THEN 1 ELSE 0 END), 0)::int AS cancel_requested_count,$a$;
  out_marker constant text := $m$'refund_requested_count', o.refund_requested_count,$m$;
  out_add constant text := $a$'refund_requested_count', o.refund_requested_count,
    'cancel_requested_count', o.cancel_requested_count,$a$;
BEGIN
  d := pg_get_functiondef('public.get_owner_store_ops_snapshot_counts(uuid)'::regprocedure);
  IF position('cancel_requested_count' in d) > 0 THEN
    RETURN;
  END IF;
  IF position(agg_marker in d) = 0 OR position(out_marker in d) = 0 THEN
    RAISE EXCEPTION 'dq1_snapshot_counts_marker_missing';
  END IF;
  d := replace(d, agg_marker, agg_add);
  d := replace(d, out_marker, out_add);
  EXECUTE d;
END
$do$;

COMMIT;
