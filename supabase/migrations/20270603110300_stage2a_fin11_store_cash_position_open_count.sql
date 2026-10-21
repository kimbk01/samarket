-- 배달 오너 감사 2단계 2-A · FIN-11 (문서 G-1 §5-A)
-- 원인: 오너 재무 화면(/api/me/stores/[storeId]/finance) 미납 합계를 TS(aggregateOpenSaleFeeObligations)가 집계 —
--   AGENTS 「Admin·Owner 는 같은 SQL 조회 함수만」 위반. 웹은 store_cash_position RPC 로 교체한다.
-- 이 파일: 응답 필드 openCount 를 같은 SQL 에서 내기 위해 store_cash_position 에 'open_count' 키만 추가(기존 키·계산 불변).
-- 운영 원문 기준(읽기 전용 pg_get_functiondef, 2026-10-21 PHT):
--   public.store_cash_position(uuid) base md5(prosrc) = 698a65c9922963a44cd91c74c0d1c348
-- 데이터 변경 없음. 권한은 CREATE OR REPLACE 로 유지(service_role 만 EXECUTE).
-- 웹이 먼저 배포돼도 동작: open_count 가 없으면 라우트가 목록 행 수로 대체(totalsComplete 그대로 true — 합계는 SQL).
-- 함수 본문에는 비 ASCII 를 넣지 않는다.
-- 롤백: 위 base md5 운영 원문으로 CREATE OR REPLACE (open_count 집계·키 제거).

CREATE OR REPLACE FUNCTION public.store_cash_position(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance bigint := 0;
  v_outstanding bigint := 0;
  v_open_count bigint := 0;
  v_mode text := public.store_cash_order_gate_mode();
  v_net bigint;
BEGIN
  SELECT coalesce(balance_minor, 0) INTO v_balance FROM public.business_cash_accounts WHERE store_id = p_store_id;
  SELECT coalesce(sum(fee_outstanding_minor), 0), count(*) INTO v_outstanding, v_open_count
    FROM public.store_sale_fee_obligations WHERE store_id = p_store_id AND status = 'open';
  v_net := coalesce(v_balance, 0) - coalesce(v_outstanding, 0);
  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'balance_minor', coalesce(v_balance, 0),
    'outstanding_minor', coalesce(v_outstanding, 0),
    'open_count', coalesce(v_open_count, 0),
    'net_minor', v_net,
    'gate_mode', v_mode,
    'orderable', (v_mode = 'off' OR v_net > 0)
  );
END;
$function$;
