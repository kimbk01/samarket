-- 관리자 처리 대기 숫자 = 카드가 여는 목록 (감사·설계 2026-11-24 단계 2 · Owner 승인 「단계 2 승인」)
--
-- 근거: docs/audit/admin-notification-full-audit-2026-11-24.md · docs/audit/admin-notification-fix-design-2026-11-24.md §4
-- 계약: lib/admin/admin-action-queue-registry.ts 「listHref — Admin list that shows exactly the rows counted」
--
-- 바꾸는 함수 4개 (시그니처·반환형·권한·SECURITY 그대로):
--   1) admin_delivery_ad_campaign_index — 「제작 필요(needs_creative)」는 심사 단계 배너만.
--      예전: 임시 이미지 배너면 초안(DRAFT)·종료(ENDED)도 처리 목록에 나왔다 (운영 DRAFT QA 배너 1건).
--   2) admin_action_queue_counts — 운영 본문(pg_get_functiondef 2026-11-24) 기준으로 5칸만 교체:
--      delivery_ad_ops   : Case WAITING_ADMIN 전부 → 허브 view=actionable 과 같은 index 함수·같은 버킷
--      feed_ad_rows      : + 신청·연결 캠페인 삭제 제외 (원장 목록과 같게)
--      trade_promo_pending: + 삭제 주문 제외
--      store_applications: + 샘플 매장 제외 (입점 목록 scope=review)
--      community_reports : 신고 행 수 → 대상 묶음 수 (admin_community_report_groups_page 와 같은 단위·대상 종류)
--   3) admin_notification_delivery_health — dead 는 최근 7일만 (예전: 기간 제한 없이 헤더 「!」 영구)
--   4) admin_notification_replay_support_replies — 같은 메시지 알림이 어느 관리자에게든 있으면 건너뜀
--      (예전: 담당 변경 시 72시간 안 메시지를 새 담당자에게 다시 알림·푸시)
--
-- 저장소 정의와 운영 정의가 다르다(20271112200000 주석) → 운영 본문을 그대로 옮기고 해당 블록만 바꿨다.
-- 롤백: docs/audit/admin-queue-stage2-rollback-2026-11-24.sql (바꾸기 전 운영 본문 4개, CREATE OR REPLACE).
-- 호환: 새 함수는 예전 웹 조건값으로도 동작(pending asset 기본값). 예전 함수는 새 웹 조건값의 추가 키를 무시.

-- 1) ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delivery_ad_campaign_index(p_pending_asset text)
 RETURNS TABLE(product_kind text, id uuid, store_id uuid, owner_user_id uuid, lifecycle_status text, review_status text, review_notes text, title text, headline text, image_url text, campaign_source text, start_at timestamp with time zone, end_at timestamp with time zone, submitted_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, inventory_keys text[], store_name text, store_primary_slug text, store_sub_slug text, list_bucket text, sort_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH camp AS (
    SELECT 'store_sponsored'::text AS product_kind, c.id, c.store_id, c.owner_user_id,
           coalesce(c.lifecycle_status, 'DRAFT') AS lifecycle_status, c.review_status, c.review_notes,
           c.title, c.headline, c.image_url, coalesce(c.campaign_source, 'OWNER_PAID') AS campaign_source,
           c.start_at, c.end_at, c.submitted_at, c.created_at, c.updated_at,
           ARRAY(SELECT i.key FROM public.delivery_store_sponsored_campaign_inventories ci
                   JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
                  WHERE ci.campaign_id = c.id ORDER BY ci.priority, ci.created_at, i.key) AS inventory_keys,
           NULL::integer AS sort_order
      FROM public.store_paid_ad_campaigns c
    UNION ALL
    SELECT 'banner'::text, c.id, c.store_id, c.owner_user_id,
           coalesce(c.lifecycle_status, 'DRAFT'), c.review_status, c.review_notes,
           c.title, c.subtitle, c.image_url, coalesce(c.campaign_source, 'OWNER_PAID'),
           c.start_at, c.end_at, c.submitted_at, c.created_at, c.updated_at,
           ARRAY(SELECT i.key FROM public.delivery_banner_campaign_inventories ci
                   JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
                  WHERE ci.campaign_id = c.id ORDER BY ci.priority, ci.created_at, i.key),
           c.sort_order
      FROM public.store_banner_ad_campaigns c
  )
  SELECT camp.product_kind, camp.id, camp.store_id, camp.owner_user_id, camp.lifecycle_status,
         camp.review_status, camp.review_notes, camp.title, camp.headline, camp.image_url,
         camp.campaign_source, camp.start_at, camp.end_at, camp.submitted_at, camp.created_at,
         camp.updated_at, camp.inventory_keys, s.store_name,
         nullif(lower(btrim(sc.slug)), '') AS store_primary_slug,
         nullif(lower(btrim(st.slug)), '') AS store_sub_slug,
         CASE
           -- ADS-12: review lifecycle without any funding (legacy, unfunded) -> separate no-action bucket
           WHEN camp.lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED')
                AND NOT public.delivery_ad_campaign_funding_allows_active(
                  camp.product_kind, camp.id, camp.campaign_source) THEN 'review_unfunded'
           -- banner creative production needed (empty or pending placeholder) — 심사 단계만 (2026-11-24:
           -- 초안·종료 배너는 관리자 처리 대상이 아니다. 초안 = 버킷 없음(전체에만) · 종료 = ended)
           WHEN camp.product_kind = 'banner'
                AND camp.lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED')
                AND (nullif(btrim(coalesce(camp.image_url, '')), '') IS NULL
                     OR btrim(camp.image_url) = p_pending_asset) THEN 'needs_creative'
           WHEN camp.lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED') THEN 'review'
           WHEN camp.lifecycle_status IN ('APPROVED', 'SCHEDULED') THEN 'scheduled'
           WHEN camp.lifecycle_status = 'ACTIVE' THEN 'active'
           WHEN camp.lifecycle_status IN ('PAUSED_ADMIN', 'PAUSED_OWNER') THEN 'held'
           WHEN camp.lifecycle_status IN ('ENDED', 'TERMINATED', 'ARCHIVED', 'EXHAUSTED') THEN 'ended'
           WHEN camp.lifecycle_status = 'REJECTED' THEN 'rejected'
           ELSE NULL
         END AS list_bucket,
         camp.sort_order
    FROM camp
    LEFT JOIN public.stores s ON s.id = camp.store_id
    LEFT JOIN public.store_categories sc ON sc.id = s.store_category_id
    LEFT JOIN public.store_topics st ON st.id = s.store_topic_id;
$function$;

-- 2) ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_action_queue_counts(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$ declare r jsonb := '{}'::jsonb; v bigint; v_rows jsonb; begin
begin select count(*) into v from public.store_point_charge_requests t where t.request_status::text = any(array(select jsonb_array_elements_text(p->'store_charge_statuses'))); r := r || jsonb_build_object('store_charges', v); exception when undefined_table then r := r || jsonb_build_object('store_charges', 0); when others then r := r || jsonb_build_object('store_charges', null); end;
begin select count(*) into v from public.business_cash_charge_requests t where t.status::text = p->>'cash_charge_status'; r := r || jsonb_build_object('cash_charges', v); exception when undefined_table then r := r || jsonb_build_object('cash_charges', 0); when others then r := r || jsonb_build_object('cash_charges', null); end;
begin select count(*) into v from public.point_charge_requests t where t.request_status::text = any(array(select jsonb_array_elements_text(p->'user_charge_statuses'))); r := r || jsonb_build_object('user_charges', v); exception when undefined_table then r := r || jsonb_build_object('user_charges', 0); when others then r := r || jsonb_build_object('user_charges', null); end;
begin select count(*) into v from public.reports t where t.status::text = any(array(select jsonb_array_elements_text(p->'trade_report_statuses'))); r := r || jsonb_build_object('reports', v); exception when undefined_table then r := r || jsonb_build_object('reports', 0); when others then r := r || jsonb_build_object('reports', null); end;
begin select count(*) into v from public.store_reports t where t.status::text = p->>'store_report_status'; r := r || jsonb_build_object('store_reports', v); exception when undefined_table then r := r || jsonb_build_object('store_reports', 0); when others then r := r || jsonb_build_object('store_reports', null); end;
begin select count(*) into v from public.delivery_operation_alert_events t where t.event_status::text = any(array(select jsonb_array_elements_text(p->'delivery_alert_statuses'))); r := r || jsonb_build_object('delivery_alerts', v); exception when undefined_table then r := r || jsonb_build_object('delivery_alerts', 0); when others then r := r || jsonb_build_object('delivery_alerts', null); end;
-- 2026-11-24: 삭제된 신청·삭제된 연결 캠페인 제외 (광고 원장 신청 목록과 같게)
begin select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'start_at', x.start_at, 'end_at', x.end_at)), '[]'::jsonb) into v_rows from (select t.id, t.status::text, t.start_at, t.end_at from public.feed_ad_requests t left join public.feed_ad_campaigns fc on fc.id = t.campaign_id where t.status::text = p->>'feed_ad_status' and t.deleted_at is null and fc.deleted_at is null limit (p->>'feed_ad_scan_limit')::int) x; r := r || jsonb_build_object('feed_ad_rows', v_rows); exception when undefined_table then r := r || jsonb_build_object('feed_ad_rows', '[]'::jsonb); when others then r := r || jsonb_build_object('feed_ad_rows', null); end;
-- 2026-11-24: 삭제 주문 제외 (부스트 원장과 같게)
begin select count(*) into v from public.point_promotion_orders t where t.domain::text = p->>'trade_promo_domain' and t.order_status::text = p->>'trade_promo_status' and t.deleted_at is null; r := r || jsonb_build_object('trade_promo_pending', v); exception when undefined_table then r := r || jsonb_build_object('trade_promo_pending', 0); when others then r := r || jsonb_build_object('trade_promo_pending', null); end;
begin select count(*) into v from public.store_inquiries t where t.status::text = p->>'store_inquiry_status'; r := r || jsonb_build_object('store_inquiry_open', v); exception when undefined_table then r := r || jsonb_build_object('store_inquiry_open', 0); when others then r := r || jsonb_build_object('store_inquiry_open', null); end;
begin select count(*) into v from public.support_cases t where (p->'support_statuses' is null or jsonb_typeof(p->'support_statuses') = 'null' or t.status::text = any(array(select jsonb_array_elements_text(p->'support_statuses')))); r := r || jsonb_build_object('support_actionable', v); exception when undefined_table then r := r || jsonb_build_object('support_actionable', 0); when others then r := r || jsonb_build_object('support_actionable', null); end;
-- 2026-11-24: 신고 대상 묶음 수 (목록 admin_community_report_groups_page 와 같은 단위 · post/comment/user 만)
begin select count(distinct (t.target_type, coalesce(t.target_id, ''))) into v from public.community_reports t where t.status::text = any(array(select jsonb_array_elements_text(p->'community_report_statuses'))) and t.target_type in ('post', 'comment', 'user'); r := r || jsonb_build_object('community_reports', v); exception when undefined_table then r := r || jsonb_build_object('community_reports', 0); when others then r := r || jsonb_build_object('community_reports', null); end;
-- 2026-11-24: 샘플 매장 제외 (입점 목록 scope=review 와 같게)
begin select count(*) into v from public.stores t where t.approval_status::text = any(array(select jsonb_array_elements_text(p->'store_approval_statuses'))) and t.store_kind is distinct from 'sample'; r := r || jsonb_build_object('store_applications', v); exception when undefined_table then r := r || jsonb_build_object('store_applications', 0); when others then r := r || jsonb_build_object('store_applications', null); end;
-- 2026-11-24: 허브 view=actionable 과 같은 함수·같은 버킷 (종료·미결제·초안 제외)
begin select count(*) into v from public.admin_delivery_ad_campaign_index(coalesce(nullif(p->>'delivery_ad_pending_asset', ''), 'delivery-ads/pending/admin-production')) i where i.list_bucket in ('needs_creative', 'review'); r := r || jsonb_build_object('delivery_ad_ops', v); exception when undefined_table then r := r || jsonb_build_object('delivery_ad_ops', 0); when others then r := r || jsonb_build_object('delivery_ad_ops', null); end;
begin select count(*) into v from public.store_orders t where t.needs_admin_attention = true and not (t.order_status::text = any(array(select jsonb_array_elements_text(p->'order_excluded_statuses')))) and t.created_at >= (p->>'order_active_from')::timestamptz; r := r || jsonb_build_object('orders_attention', v); exception when undefined_table then r := r || jsonb_build_object('orders_attention', 0); when others then r := r || jsonb_build_object('orders_attention', null); end;
begin select count(*) into v from public.store_sale_fee_obligations t where t.adjustment_status::text = p->>'settlement_status'; r := r || jsonb_build_object('settlements_actionable', v); exception when undefined_table then r := r || jsonb_build_object('settlements_actionable', 0); when others then r := r || jsonb_build_object('settlements_actionable', null); end;
begin select count(*) into v from public.coin_withdrawal_requests t where t.status::text = p->>'coin_withdrawal_status'; r := r || jsonb_build_object('coin_withdrawals', v); exception when undefined_table then r := r || jsonb_build_object('coin_withdrawals', 0); when others then r := r || jsonb_build_object('coin_withdrawals', null); end;
begin select count(*) into v from public.platform_popup_owner_requests t where t.request_status::text = any(array(select jsonb_array_elements_text(p->'popup_statuses'))); r := r || jsonb_build_object('platform_popup_pending', v); exception when undefined_table then r := r || jsonb_build_object('platform_popup_pending', 0); when others then r := r || jsonb_build_object('platform_popup_pending', null); end;
begin select count(*) into v from public.delivery_ad_partner_memberships t where t.status::text = p->>'partner_status'; r := r || jsonb_build_object('partner_pending', v); exception when undefined_table then r := r || jsonb_build_object('partner_pending', 0); when others then r := r || jsonb_build_object('partner_pending', null); end;
begin select count(*) into v from public.community_messenger_reports t where t.status::text = any(array(select jsonb_array_elements_text(p->'messenger_report_statuses'))); r := r || jsonb_build_object('messenger_actionable', v); exception when undefined_table then r := r || jsonb_build_object('messenger_actionable', 0); when others then r := r || jsonb_build_object('messenger_actionable', null); end;
return r; end; $function$;

-- 3) ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_notification_delivery_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 2026-11-24: dead 는 최근 7일만 — 예전에는 한 번 생긴 dead 가 최고관리자 헤더 「!」를 영구로 만들었다
  select jsonb_build_object(
    'outbox_dead', (select count(*) from public.admin_notification_outbox where status = 'dead' and updated_at >= now() - interval '7 days'),
    'outbox_pending', (select count(*) from public.admin_notification_outbox where status in ('pending', 'processing')),
    'push_dead', (select count(*) from public.admin_notification_push_deliveries where status = 'dead' and updated_at >= now() - interval '7 days'),
    'push_unknown', (select count(*) from public.admin_notification_push_deliveries where status = 'unknown_outcome')
  );
$function$;

-- 4) ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_notification_replay_support_replies(p_lookback interval DEFAULT '72:00:00'::interval, p_limit integer DEFAULT 200)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select m.id as message_id, m.body, m.sender_user_id, c.id as case_id, c.public_case_no,
           c.assigned_admin_id
      from public.support_messages m
      join public.support_cases c on c.id = m.case_id
     where m.message_type = 'PUBLIC'
       and m.sender_type in ('MEMBER', 'OWNER')
       and m.deleted_at is null
       and m.created_at > now() - p_lookback
       and c.assigned_admin_id is not null
       and c.status not in ('RESOLVED', 'ARCHIVED')
       and internal.is_platform_admin(c.assigned_admin_id)
       -- 2026-11-24: 어느 관리자에게든 이미 알림이 있으면 재생하지 않는다 (담당 변경 시 과거 메시지 재알림 방지)
       and not exists (
         select 1 from public.admin_notifications n
          where n.dedupe_key = 'support_customer_replied:' || m.id::text
       )
       and not exists (
         select 1 from public.notification_events e
          where e.user_id = c.assigned_admin_id
            and e.dedupe_key = 'support_customer_replied:' || m.id::text
       )
       and not exists (
         select 1 from public.admin_notification_outbox o
          where o.source_key = 'support_customer_replied:' || m.id::text
       )
     order by m.created_at
     limit greatest(1, least(p_limit, 1000))
  loop
    if public.admin_notification_outbox_enqueue(
      'support_customer_replied:' || r.message_id::text,
      'support_customer_replied',
      jsonb_build_object(
        'recipientAdminIds', jsonb_build_array(r.assigned_admin_id),
        'kind', 'support_customer_replied',
        'title', '문의 ' || r.public_case_no,
        'body', left(r.body, 500),
        'linkUrl', '/admin/support/' || r.case_id::text,
        'workRef', jsonb_build_object('table', 'support_cases', 'id', r.case_id),
        'dedupeKey', 'support_customer_replied:' || r.message_id::text,
        'actorUserId', r.sender_user_id,
        'push', true
      ),
      null
    ) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;
