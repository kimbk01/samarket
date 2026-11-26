-- 광고 DB 묶음 B-DB (Owner 「B-DB 진행」 2026-11-27) — 회원 피드 배너
-- 설계: docs/audit/ad-db-bundle-design-2026-11-27.md B-DB (운영 정의 읽기 전용 확인 2026-11-27)
--
-- FB-06 연장: `member_feed_ad_renew` 는 금액만 대조하고 신청 행의 기간·금액·상품을 **덮어썼다**
--        → 새 함수 `member_feed_ad_renew_v2`(기간도 대조 · 같은 키 확인 뒤) + 새 표 `feed_ad_request_renewals`
--          · 신청 행은 처음 값 유지(종료일·상태만). 옛 5인자 함수는 옛 코드 호환용으로 남긴다(다음 정리 때 삭제).
-- R-24 회원 취소: 상태 변경과 보류 해제가 TS 에서 따로 → `member_cancel_feed_ad_request` 한 트랜잭션.
-- FB-12 검토 7일 자동 반려: `system_expire_feed_ad_requests` — 반려와 같은 보류 해제 + 반려 한 트랜잭션(실행자 system).
-- FB-03 연결 글 상태: 거래 글·커뮤니티 글의 숨김·삭제를 배너에 반영 — 상위노출과 같은 규칙
--        (숨김 = 멈춤(기간 멈춤) · 다시 공개 = 재개(멈춘 시간만큼 연장) · 삭제·판매완료 = 종료, 환급 없음).
--        멈춤 표시 = paused_by 'system' + public_reason 'destination_unavailable' (paused_by 제약: admin·member·system).
--        기존 글 상태 트리거 2개(`posts_trade_promotion_sync`·`community_posts_promotion_sync`)에 바꿀 문장만 1번씩 끼운다.
-- 옛 코드 호환: 기존 함수 서명·반환 그대로 — 이 마이그레이션만 적용돼도 지금 코드가 그대로 동작한다.
-- 되돌리기: docs/audit/ad-db-b-rollback-2026-11-27.sql

-- ── FB-06 연장 기록 표 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feed_ad_request_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.feed_ad_requests(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  days integer NOT NULL CHECK (days BETWEEN 1 AND 90),
  points integer NOT NULL CHECK (points >= 1),
  ledger_id uuid,
  idempotency_key text NOT NULL,
  end_at_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_ad_request_renewals_campaign_key_uniq UNIQUE (campaign_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS feed_ad_request_renewals_request_idx
  ON public.feed_ad_request_renewals (request_id, created_at);
ALTER TABLE public.feed_ad_request_renewals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_ad_request_renewals FROM anon, authenticated;
COMMENT ON TABLE public.feed_ad_request_renewals IS
  '회원 배너 연장 기록 (B-DB FB-06) — 신청 행은 처음 금액·기간·상품 유지, 연장은 여기 한 줄씩.';

-- ── FB-06 연장 v2 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_feed_ad_renew_v2(
  p_user uuid, p_campaign uuid, p_product text, p_key text, p_expected_cost integer, p_expected_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_camp public.feed_ad_campaigns%rowtype;
  v_req public.feed_ad_requests%rowtype;
  v_prod public.feed_ad_products%rowtype;
  v_key text := left(btrim(coalesce(p_key, '')), 128);
  v_related text;
  v_paid integer;
  v_status text;
  v_new_end timestamptz;
  v_spend jsonb;
  v_end timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user is null or p_campaign is null or v_key = '' or coalesce(btrim(p_product), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- ① 캠페인 잠금 — 같은 캠페인 연장은 차례로만
  select * into v_camp from public.feed_ad_campaigns where id = p_campaign for update;
  if not found or v_camp.source <> 'MEMBER_REQUESTED' or v_camp.request_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_req from public.feed_ad_requests where id = v_camp.request_id for update;
  if not found or v_req.user_id is distinct from p_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- ② 같은 키 재전송은 금액·기간 대조보다 먼저 — 처음 결과(지금 종료일)만 돌려준다
  v_related := left('renew:' || p_campaign::text || ':' || v_key, 200);
  select abs(l.amount)::integer into v_paid
    from public.point_ledger l
   where l.user_id = p_user and l.related_type = 'feed_ad_request' and l.related_id = v_related
   order by l.created_at asc
   limit 1;
  if found then
    if exists (
      select 1 from public.point_ledger l
       where l.user_id = p_user and l.related_type = 'feed_ad_request'
         and l.related_id = left('renew-refund:' || p_campaign::text || ':' || v_key, 200)
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_renewable');
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true, 'campaign_id', p_campaign,
      'end_at', v_camp.end_at, 'point_cost', v_paid);
  end if;

  -- ③ 새 연장 — 관리자 정지·종료는 회원 연장으로 우회할 수 없다
  v_status := lower(coalesce(v_camp.status, ''));
  if v_status = 'paused' and lower(coalesce(v_camp.paused_by, '')) = 'admin' then
    return jsonb_build_object('ok', false, 'error', 'admin_paused');
  end if;
  if v_status = 'ended' then
    return jsonb_build_object('ok', false, 'error', 'admin_ended');
  end if;
  if v_req.status in ('pending_review', 'rejected', 'cancelled') or v_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_renewable');
  end if;

  select * into v_prod from public.feed_ad_products where id = btrim(p_product) for share;
  if not found or v_prod.is_active is not true
     or v_prod.duration_days < 1 or v_prod.duration_days > 90 or v_prod.point_cost < 1 then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;
  if v_prod.domain is distinct from v_camp.domain then
    return jsonb_build_object('ok', false, 'error', 'domain_mismatch');
  end if;
  -- FB-06: 금액과 **기간**을 함께 대조 (화면이 본 값과 다르면 차감 없음)
  if p_expected_cost is null or p_expected_cost <> v_prod.point_cost
     or p_expected_days is null or p_expected_days <> v_prod.duration_days then
    return jsonb_build_object('ok', false, 'error', 'price_changed',
      'point_cost', v_prod.point_cost, 'duration_days', v_prod.duration_days);
  end if;

  v_new_end := greatest(now(), coalesce(v_camp.end_at, now())) + make_interval(days => v_prod.duration_days);

  begin
    v_spend := public.spend_user_points(
      p_user, v_prod.point_cost, 'ad_purchase', 'feed_ad_request', v_related,
      format('피드 배너 연장 — %s일 (%sP)', v_prod.duration_days, v_prod.point_cost), 'user');
    if coalesce((v_spend ->> 'ok')::boolean, false) is not true then
      if v_spend ->> 'error' = 'insufficient_balance' then
        return jsonb_build_object('ok', false, 'error', 'insufficient_balance');
      end if;
      raise exception 'member_feed_ad_renew_spend_failed:%', coalesce(v_spend ->> 'error', 'unknown');
    end if;
    if coalesce((v_spend ->> 'duplicate')::boolean, false) then
      raise exception 'member_feed_ad_renew_duplicate_spend';
    end if;

    update public.feed_ad_campaigns
       set end_at = v_new_end, status = 'active', updated_at = now()
     where id = p_campaign
     returning end_at into v_end;

    -- FB-06: 신청 행은 처음 금액·기간·상품 유지 — 종료일·상태만
    update public.feed_ad_requests
       set status = 'active', end_at = v_new_end, updated_at = now()
     where id = v_req.id and user_id = p_user;

    insert into public.feed_ad_request_renewals (
      request_id, campaign_id, user_id, product_id, days, points, ledger_id, idempotency_key, end_at_after
    ) values (
      v_req.id, p_campaign, p_user, v_prod.id, v_prod.duration_days, v_prod.point_cost,
      (select l.id from public.point_ledger l
        where l.user_id = p_user and l.related_type = 'feed_ad_request' and l.related_id = v_related
        order by l.created_at asc limit 1),
      v_key, v_end
    );
  exception when raise_exception then
    if sqlerrm = 'feed_ad_pool_capacity_full' then
      return jsonb_build_object('ok', false, 'error', 'capacity_full');
    end if;
    raise;
  end;

  return jsonb_build_object('ok', true, 'idempotent', false, 'campaign_id', p_campaign,
    'end_at', v_end, 'point_cost', v_prod.point_cost, 'duration_days', v_prod.duration_days);
end;
$function$;

-- ── 보류 해제 공용 (반려 함수와 같은 원장·상태 처리) ───────────────
CREATE OR REPLACE FUNCTION public._feed_ad_release_holds(p_request_id uuid, p_description text, p_actor_type text, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_hold record;
  v_released integer := 0;
  v_now timestamptz := now();
begin
  for v_hold in
    select * from public.feed_ad_point_holds
     where request_id = p_request_id and status = 'held'
     order by created_at, id
     for update
  loop
    if v_hold.user_id is not null and coalesce(v_hold.amount, 0) > 0 then
      perform 1 from public.profiles where id = v_hold.user_id for update;
      if not exists (
        select 1 from public.point_ledger
         where user_id = v_hold.user_id and entry_type = 'ad_hold_release'
           and related_type = 'feed_ad_request' and related_id = 'release:' || v_hold.id::text
      ) then
        insert into public.point_ledger
          (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
        values
          (v_hold.user_id, 'ad_hold_release', v_hold.amount,
           public.sum_user_point_ledger(v_hold.user_id) + v_hold.amount,
           'feed_ad_request', 'release:' || v_hold.id::text,
           left(p_description, 500), p_actor_type, p_actor);
        v_released := v_released + v_hold.amount;
      end if;
      perform public.project_user_point_balance_from_ledger(v_hold.user_id);
    end if;
    update public.feed_ad_point_holds set status = 'released', updated_at = v_now where id = v_hold.id;
  end loop;
  return v_released;
end;
$function$;

-- ── R-24 회원 취소 (한 트랜잭션) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_cancel_feed_ad_request(
  p_user uuid, p_request uuid, p_claim_stale_seconds integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_req public.feed_ad_requests%rowtype;
  v_released integer;
  v_now timestamptz := now();
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user is null or p_request is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_req from public.feed_ad_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.user_id is distinct from p_user then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status is distinct from 'pending_review' then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_req.status);
  end if;
  -- 승인이 시작된 신청은 받지 않는다 — 단 claim 이 오래돼(승인이 중간에 죽음) 남은 경우는 받는다
  if v_req.reviewed_by is not null
     and coalesce(v_req.reviewed_at, v_now) > v_now - make_interval(secs => greatest(60, coalesce(p_claim_stale_seconds, 600))) then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'reason', 'review_in_progress');
  end if;
  -- 포인트가 이미 확정(captured)됐으면 회원 취소로 풀 수 없다 — 어드민 처리 대상
  if exists (select 1 from public.feed_ad_point_holds where request_id = p_request and status = 'captured') then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'reason', 'captured');
  end if;

  v_released := public._feed_ad_release_holds(p_request, '피드 광고 취소 — 보류 해제', 'user', p_user);

  update public.feed_ad_requests
     set status = 'cancelled', review_reason = 'member_cancelled',
         reviewed_by = null, reviewed_at = v_now, updated_at = v_now
   where id = p_request;

  return jsonb_build_object('ok', true, 'status', 'cancelled', 'released_points', v_released);
end;
$function$;

-- ── FB-12 검토 7일 자동 반려 ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_expire_feed_ad_requests(p_days integer DEFAULT 7, p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_req record;
  v_released integer;
  v_items jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  for v_req in
    select * from public.feed_ad_requests
     where status = 'pending_review'
       and created_at < v_now - make_interval(days => greatest(1, coalesce(p_days, 7)))
       -- 승인이 진행 중(10분 안의 claim)인 신청은 건드리지 않는다
       and (reviewed_by is null or reviewed_at < v_now - interval '10 minutes')
     order by created_at
     limit greatest(1, least(coalesce(p_limit, 100), 500))
     for update skip locked
  loop
    -- 확정(captured) 보류가 있으면 건너뛴다(어드민 처리 대상)
    continue when exists (select 1 from public.feed_ad_point_holds where request_id = v_req.id and status = 'captured');
    v_released := public._feed_ad_release_holds(v_req.id, '피드 광고 검토 기간 만료 — 보류 해제', 'system', null);
    update public.feed_ad_requests
       set status = 'rejected', review_reason = 'review_timeout',
           reviewed_by = null, reviewed_at = v_now, updated_at = v_now
     where id = v_req.id;
    insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
    values ('system', null, 'feed_ad_request', v_req.id::text, 'feed_ad_request.review_timeout',
      jsonb_build_object('status', 'pending_review', 'created_at', v_req.created_at),
      jsonb_build_object('status', 'rejected', 'review_reason', 'review_timeout', 'released_points', v_released));
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'request_id', v_req.id, 'user_id', v_req.user_id, 'released_points', v_released, 'domain', v_req.domain));
  end loop;
  return jsonb_build_object('ok', true, 'items', v_items);
end;
$function$;

-- ── FB-03 연결 글 상태 → 배너 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.feed_ad_sync_destination(p_dest_type text, p_post_id uuid, p_post_gone boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_terminal boolean := coalesce(p_post_gone, false);
  v_pause boolean := false;
  v_t text;
  v_p text;
  v_post record;
  v_row record;
  v_gap integer;
  v_new_end timestamptz;
  v_n integer := 0;
begin
  if p_post_id is null then
    return 0;
  end if;
  if p_dest_type = 'trade_listing' then
    -- 상위노출과 같은 판정(삭제·판매완료 = terminal · 숨김·검토 = pause)
    select v.terminal, v.pause into v_t, v_p from public.trade_promotion_listing_verdict(p_post_id, coalesce(p_post_gone, false)) v;
    v_terminal := v_terminal or v_t is not null;
    v_pause := v_p is not null;
  elsif p_dest_type = 'community_post' then
    if not v_terminal then
      select status, is_hidden, is_deleted into v_post from public.community_posts where id = p_post_id;
      if not found or coalesce(v_post.is_deleted, false) or lower(coalesce(v_post.status, '')) = 'deleted' then
        v_terminal := true;
      elsif coalesce(v_post.is_hidden, false)
            or lower(coalesce(v_post.status, 'active')) not in ('', 'active', 'published') then
        v_pause := true;
      end if;
    end if;
  else
    return 0;
  end if;

  for v_row in
    select * from public.feed_ad_campaigns
     where destination_type = p_dest_type and destination_id = p_post_id::text
       and source = 'MEMBER_REQUESTED' and status in ('active', 'scheduled', 'paused')
     for update
  loop
    if v_terminal then
      -- 삭제·판매완료 = 종료(환급 없음 · 상위노출과 같은 규칙)
      v_gap := case when v_row.status = 'paused' and v_row.paused_at is not null
                    then greatest(0, floor(extract(epoch from (now() - v_row.paused_at))))::integer else 0 end;
      update public.feed_ad_campaigns
         set status = 'ended', end_at = greatest(coalesce(start_at, now()), least(coalesce(end_at, now()), now())),
             paused_at = null, paused_by = null,
             paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
             public_reason = 'destination_unavailable', updated_at = now()
       where id = v_row.id;
      if v_row.request_id is not null then
        update public.feed_ad_requests
           set status = 'ended', updated_at = now()
         where id = v_row.request_id and status in ('active', 'approved');
      end if;
      insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
      values ('system', null, 'feed_ad_request', coalesce(v_row.request_id, v_row.id)::text, 'feed_ad_request.end',
        jsonb_build_object('status', v_row.status, 'end_at', v_row.end_at),
        jsonb_build_object('status', 'ended', 'reason', 'destination_unavailable', 'refund_points', 0, 'campaign_id', v_row.id));
      v_n := v_n + 1;
    elsif v_pause then
      if v_row.status in ('active', 'scheduled') then
        update public.feed_ad_campaigns
           set status = 'paused', paused_by = 'system', paused_at = now(),
               public_reason = 'destination_unavailable', updated_at = now()
         where id = v_row.id;
        insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
        values ('system', null, 'feed_ad_request', coalesce(v_row.request_id, v_row.id)::text, 'feed_ad_request.pause',
          jsonb_build_object('status', v_row.status),
          jsonb_build_object('status', 'paused', 'paused_by', 'system', 'reason', 'destination_unavailable', 'campaign_id', v_row.id));
        v_n := v_n + 1;
      end if;
    elsif v_row.status = 'paused' and v_row.paused_by = 'system' and v_row.public_reason = 'destination_unavailable' then
      -- 다시 공개 = 재개 · 멈춘 시간만큼 종료일 연장 (관리자 재개와 같은 계산)
      v_gap := greatest(0, floor(extract(epoch from (now() - coalesce(v_row.paused_at, now())))))::integer;
      v_new_end := case when v_row.end_at is not null then v_row.end_at + make_interval(secs => v_gap) else null end;
      begin
        update public.feed_ad_campaigns
           set status = 'active', paused_at = null, paused_by = null,
               paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
               end_at = v_new_end, public_reason = null, updated_at = now()
         where id = v_row.id;
      exception when others then
        -- 자리 없음 등으로 재개 못 하면 멈춘 채 둔다(글 상태 변경은 계속 진행)
        if sqlerrm = 'feed_ad_pool_capacity_full' then
          continue;
        end if;
        raise;
      end;
      if v_row.request_id is not null and v_new_end is not null then
        update public.feed_ad_requests set end_at = v_new_end, updated_at = now()
         where id = v_row.request_id and status in ('active', 'approved');
      end if;
      insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
      values ('system', null, 'feed_ad_request', coalesce(v_row.request_id, v_row.id)::text, 'feed_ad_request.resume',
        jsonb_build_object('status', 'paused', 'end_at', v_row.end_at),
        jsonb_build_object('status', 'active', 'end_at', v_new_end, 'extended_seconds', v_gap, 'campaign_id', v_row.id));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$function$;

-- 권한: 서비스 롤만 (기존 광고 함수와 같음)
REVOKE ALL ON FUNCTION public.member_feed_ad_renew_v2(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._feed_ad_release_holds(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_cancel_feed_ad_request(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.system_expire_feed_ad_requests(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feed_ad_sync_destination(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_feed_ad_renew_v2(uuid, uuid, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.member_cancel_feed_ad_request(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.system_expire_feed_ad_requests(integer, integer) TO service_role;

-- ── FB-03 글 상태 트리거 2개에 배너 연동 끼우기 (바꿀 문장 정확히 1번) ──
CREATE OR REPLACE FUNCTION public._ads_adb_b_replace_once(p_name text, p_old text, p_new text, p_marker text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_name;
  v_def := pg_get_functiondef(v_oid);
  IF position(p_marker IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1) <> 1 THEN
    RAISE EXCEPTION '%: 바꿀 문장이 정확히 1번 있어야 함', p_name;
  END IF;
  EXECUTE replace(v_def, p_old, p_new);
END $$;

-- 거래 글 삭제
SELECT public._ads_adb_b_replace_once(
  'posts_trade_promotion_sync',
  $old$      perform public.trade_promotion_sync_listing(old.id, true);
    end if;
    return null;
  end if;$old$,
  $new$      perform public.trade_promotion_sync_listing(old.id, true);
    end if;
    -- FB-03 삭제 (B-DB 2026-11-27): 이 글에 연결된 회원 배너 종료
    if exists (select 1 from public.feed_ad_campaigns c
                where c.destination_type = 'trade_listing' and c.destination_id = old.id::text
                  and c.source = 'MEMBER_REQUESTED' and c.status in ('active', 'scheduled', 'paused')) then
      perform public.feed_ad_sync_destination('trade_listing', old.id, true);
    end if;
    return null;
  end if;$new$,
  'FB-03 삭제 (B-DB 2026-11-27)'
);

-- 거래 글 상태 변경
SELECT public._ads_adb_b_replace_once(
  'posts_trade_promotion_sync',
  $old$  return null;
end;
$function$$old$,
  $new$  -- FB-03 상태 (B-DB 2026-11-27): 이 글에 연결된 회원 배너 멈춤·재개·종료
  if (new.status is distinct from old.status
      or new.seller_listing_state is distinct from old.seller_listing_state
      or new.owner_state is distinct from old.owner_state
      or new.moderation_state is distinct from old.moderation_state
      or new.is_deleted is distinct from old.is_deleted)
     and exists (select 1 from public.feed_ad_campaigns c
                  where c.destination_type = 'trade_listing' and c.destination_id = new.id::text
                    and c.source = 'MEMBER_REQUESTED' and c.status in ('active', 'scheduled', 'paused')) then
    perform public.feed_ad_sync_destination('trade_listing', new.id, false);
  end if;
  return null;
end;
$function$$new$,
  'FB-03 상태 (B-DB 2026-11-27)'
);

-- 커뮤니티 글 삭제
SELECT public._ads_adb_b_replace_once(
  'community_posts_promotion_sync',
  $old$      perform public.community_promotion_sync_post(old.id, true);
    end if;
    return null;
  end if;$old$,
  $new$      perform public.community_promotion_sync_post(old.id, true);
    end if;
    -- FB-03 삭제 (B-DB 2026-11-27): 이 글에 연결된 회원 배너 종료
    if exists (select 1 from public.feed_ad_campaigns c
                where c.destination_type = 'community_post' and c.destination_id = old.id::text
                  and c.source = 'MEMBER_REQUESTED' and c.status in ('active', 'scheduled', 'paused')) then
      perform public.feed_ad_sync_destination('community_post', old.id, true);
    end if;
    return null;
  end if;$new$,
  'FB-03 삭제 (B-DB 2026-11-27)'
);

-- 커뮤니티 글 상태 변경
SELECT public._ads_adb_b_replace_once(
  'community_posts_promotion_sync',
  $old$  return null;
end;
$function$$old$,
  $new$  -- FB-03 상태 (B-DB 2026-11-27): 이 글에 연결된 회원 배너 멈춤·재개·종료
  if (new.status is distinct from old.status
      or new.is_hidden is distinct from old.is_hidden
      or new.is_deleted is distinct from old.is_deleted)
     and exists (select 1 from public.feed_ad_campaigns c
                  where c.destination_type = 'community_post' and c.destination_id = new.id::text
                    and c.source = 'MEMBER_REQUESTED' and c.status in ('active', 'scheduled', 'paused')) then
    perform public.feed_ad_sync_destination('community_post', new.id, false);
  end if;
  return null;
end;
$function$$new$,
  'FB-03 상태 (B-DB 2026-11-27)'
);

DROP FUNCTION public._ads_adb_b_replace_once(text, text, text, text);
