-- D-11① (ads-reaudit3-defect-design-2026-11-07) — 관리자 글 숨김·삭제 + 진행 중 상위노출 종료를 한 트랜잭션으로.
--
-- 결함: community-post-admin-patch.ts 가 주문 종료(admin_promotion_end · 환급)를 먼저 하고 글을 CAS 로 갱신한다
--       → CAS 409 이면 주문만 끝난(환급까지 된) 채 글은 그대로 남는다.
-- 정본: 글 FOR UPDATE → (선택) updated_at 같은 판 확인 → 진행 중(active·paused) 상위노출이 있으면 p_fault 필수
--       → 주문마다 admin_promotion_end(운영 현재 정의 그대로 호출) → 글 상태 변경. 어느 하나라도 실패하면 전부 롤백.
--
-- 운영 확인(2026-11-07 SELECT):
--   · admin_promotion_end(uuid,uuid,text,text,text,boolean) — service_role 만 · fault operator|member|none · 사유 2자 이상
--     · 실패 시 {ok:false,error} 반환(예외 아님) → 이 함수가 예외로 바꿔 앞서 끝낸 주문까지 되돌린다.
--   · community_posts AFTER UPDATE OF status 트리거 trg_community_posts_zz_promotion_sync: 진행 중 주문이 남아 있을 때만 동기화
--     → 주문을 먼저 끝내므로 트리거가 「회원 숨김 = 정지」로 잘못 처리하지 않는다.
--   · community_posts 에 updated_at 자동 갱신 트리거 없음 → CAS 토큰을 직접 now() 로 전진 (TS 와 같음).
-- 약속 시그니처(p_post, p_admin, p_action, p_fault, p_reason) 뒤에 p_expected_updated_at timestamptz default null 을 더했다
--   (CAS 를 같은 트랜잭션에서 확인해야 결함이 닫힌다 · 넘기지 않으면 판 확인 생략).
-- 감사·작성자 알림·주문 종료 알림·포인트 회수는 이 함수가 하지 않는다 — 반환값(ended_orders·post)으로 웹이 커밋 후 처리.
--
-- 반환: {ok:true, ended_orders:[{order_id,user_id,refund_points,refund_ledger_id,before}], refund_points, before_status,
--        post:{id,status,updated_at,moderated_at}}
--       | {ok:false, error: forbidden|invalid_action|reason_required|not_found|conflict|no_change|
--                       promotion_fault_required(+promotions)|promotion_end_failed(+order_id,end_error)}
--
-- 롤백 SQL:
--   drop function if exists public.admin_community_post_moderate(uuid, uuid, text, text, text, timestamptz);

create or replace function public.admin_community_post_moderate(
  p_post uuid,
  p_admin uuid,
  p_action text,
  p_fault text,
  p_reason text,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_post public.community_posts%rowtype;
  v_next text;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_fault text := nullif(btrim(coalesce(p_fault, '')), '');
  v_code text;
  v_order public.point_promotion_orders%rowtype;
  v_orders jsonb := '[]'::jsonb;
  v_promos jsonb;
  v_res jsonb;
  v_total integer := 0;
  v_failed_order uuid;
  v_failed_code text;
  v_now timestamptz := now();
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_next := case p_action when 'hide' then 'hidden' when 'delete' then 'deleted' else null end;
  if v_next is null or p_post is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;
  if length(v_reason) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  v_code := case v_next when 'deleted' then 'post_deleted' else 'post_hidden' end;

  select * into v_post from public.community_posts where id = p_post for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_expected_updated_at is not null and v_post.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'error', 'conflict', 'updated_at', v_post.updated_at);
  end if;
  if v_post.status is not distinct from v_next then
    return jsonb_build_object('ok', false, 'error', 'no_change');
  end if;

  -- 진행 중 상위노출 (listRunningCommunityPromotionsForPost 와 같은 조건) — 잠그고 센다
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'orderStatus', o.order_status, 'endAt', o.end_at)
                            order by o.created_at), '[]'::jsonb)
    into v_promos
    from (select * from public.point_promotion_orders
           where domain = 'community' and target_id = p_post::text and order_status in ('active', 'paused')
           for update) o;
  if jsonb_array_length(v_promos) > 0 and coalesce(v_fault, '') not in ('operator', 'member') then
    return jsonb_build_object('ok', false, 'error', 'promotion_fault_required', 'promotions', v_promos);
  end if;

  begin
    for v_order in
      select * from public.point_promotion_orders
       where domain = 'community' and target_id = p_post::text and order_status in ('active', 'paused')
       order by created_at, id
    loop
      v_res := public.admin_promotion_end(v_order.id, p_admin, v_code, v_fault, v_reason, false);
      if coalesce((v_res ->> 'ok')::boolean, false) is not true then
        v_failed_order := v_order.id;
        v_failed_code := coalesce(v_res ->> 'error', 'unknown');
        raise exception 'admin_community_post_moderate_end_failed';
      end if;
      v_total := v_total + coalesce((v_res ->> 'refund_points')::integer, 0);
      v_orders := v_orders || jsonb_build_array(jsonb_build_object(
        'order_id', v_order.id,
        'user_id', v_order.user_id,
        'refund_points', coalesce((v_res ->> 'refund_points')::integer, 0),
        'refund_ledger_id', v_res -> 'refund_ledger_id',
        'before', to_jsonb(v_order)));
    end loop;

    update public.community_posts
       set status = v_next, moderated_by = p_admin, moderated_at = v_now,
           moderation_reason = v_reason, updated_at = v_now
     where id = p_post;
  exception when raise_exception then
    if sqlerrm = 'admin_community_post_moderate_end_failed' then
      -- 앞서 끝낸 주문(환급 포함)까지 이 블록에서 전부 되돌려졌다 · 글도 그대로
      return jsonb_build_object('ok', false, 'error', 'promotion_end_failed',
        'order_id', v_failed_order, 'end_error', v_failed_code);
    end if;
    raise;
  end;

  return jsonb_build_object('ok', true,
    'ended_orders', v_orders,
    'refund_points', v_total,
    'before_status', v_post.status,
    'post', jsonb_build_object('id', p_post, 'status', v_next, 'updated_at', v_now, 'moderated_at', v_now));
end;
$function$;

revoke all on function public.admin_community_post_moderate(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_community_post_moderate(uuid, uuid, text, text, text, timestamptz) to service_role;
