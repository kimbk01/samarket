-- 배달 통계 일별 버킷을 Asia/Manila 날짜로 (운영 기준 시간대).
-- 운영 함수 정의를 그대로 유지하고 일별 버킷 식 3곳만 교체한다 (시그니처·반환 형태·SECURITY DEFINER·권한 불변).
-- 시간대별 차트(orders_by_hour_utc)는 UTC 시를 반환하고 클라이언트가 마닐라로 한 번 변환한다 — 변경 없음.
-- 데이터 변경 없음.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz)'::regprocedure
  ) into v_def;

  v_new := replace(v_def,
    $s$date_trunc('day', so.created_at at time zone 'UTC')$s$,
    $s$date_trunc('day', so.created_at at time zone 'Asia/Manila')$s$);
  v_new := replace(v_new,
    $s$date_trunc('day', so.refunded_at at time zone 'UTC')$s$,
    $s$date_trunc('day', so.refunded_at at time zone 'Asia/Manila')$s$);
  v_new := replace(v_new,
    $s$date_trunc('day', ss.created_at at time zone 'UTC')$s$,
    $s$date_trunc('day', ss.created_at at time zone 'Asia/Manila')$s$);

  if v_new = v_def and position('Asia/Manila' in v_def) = 0 then
    raise exception 'admin_delivery_operations_dashboard: day bucket expressions not found';
  end if;

  execute v_new;
end
$$;
