-- 롤백: 20271124120000_admin_action_queue_count_list_parity.sql 적용 전 운영 본문 (pg_get_functiondef 2026-11-24)
-- 사용: 문제가 생기면 이 파일 전체를 운영에 실행 (CREATE OR REPLACE 4개 · 권한 그대로 유지됨).

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
           -- banner creative production needed (empty or pending placeholder)
           WHEN camp.product_kind = 'banner'
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
begin select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'start_at', x.start_at, 'end_at', x.end_at)), '[]'::jsonb) into v_rows from (select t.id, t.status::text, t.start_at, t.end_at from public.feed_ad_requests t where t.status::text = p->>'feed_ad_status' limit (p->>'feed_ad_scan_limit')::int) x; r := r || jsonb_build_object('feed_ad_rows', v_rows); exception when undefined_table then r := r || jsonb_build_object('feed_ad_rows', '[]'::jsonb); when others then r := r || jsonb_build_object('feed_ad_rows', null); end;
begin select count(*) into v from public.point_promotion_orders t where t.domain::text = p->>'trade_promo_domain' and t.order_status::text = p->>'trade_promo_status'; r := r || jsonb_build_object('trade_promo_pending', v); exception when undefined_table then r := r || jsonb_build_object('trade_promo_pending', 0); when others then r := r || jsonb_build_object('trade_promo_pending', null); end;
begin select count(*) into v from public.store_inquiries t where t.status::text = p->>'store_inquiry_status'; r := r || jsonb_build_object('store_inquiry_open', v); exception when undefined_table then r := r || jsonb_build_object('store_inquiry_open', 0); when others then r := r || jsonb_build_object('store_inquiry_open', null); end;
begin select count(*) into v from public.support_cases t where (p->'support_statuses' is null or jsonb_typeof(p->'support_statuses') = 'null' or t.status::text = any(array(select jsonb_array_elements_text(p->'support_statuses')))); r := r || jsonb_build_object('support_actionable', v); exception when undefined_table then r := r || jsonb_build_object('support_actionable', 0); when others then r := r || jsonb_build_object('support_actionable', null); end;
begin select count(*) into v from public.community_reports t where t.status::text = any(array(select jsonb_array_elements_text(p->'community_report_statuses'))); r := r || jsonb_build_object('community_reports', v); exception when undefined_table then r := r || jsonb_build_object('community_reports', 0); when others then r := r || jsonb_build_object('community_reports', null); end;
begin select count(*) into v from public.stores t where t.approval_status::text = any(array(select jsonb_array_elements_text(p->'store_approval_statuses'))); r := r || jsonb_build_object('store_applications', v); exception when undefined_table then r := r || jsonb_build_object('store_applications', 0); when others then r := r || jsonb_build_object('store_applications', null); end;
begin select count(*) into v from public.delivery_ad_operations_cases t where t.status::text = p->>'delivery_ad_ops_status'; r := r || jsonb_build_object('delivery_ad_ops', v); exception when undefined_table then r := r || jsonb_build_object('delivery_ad_ops', 0); when others then r := r || jsonb_build_object('delivery_ad_ops', null); end;
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
  select jsonb_build_object(
    'outbox_dead', (select count(*) from public.admin_notification_outbox where status = 'dead'),
    'outbox_pending', (select count(*) from public.admin_notification_outbox where status in ('pending', 'processing')),
    'push_dead', (select count(*) from public.admin_notification_push_deliveries where status = 'dead'),
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
       and not exists (
         select 1 from public.admin_notifications n
          where n.recipient_admin_id = c.assigned_admin_id
            and n.dedupe_key = 'support_customer_replied:' || m.id::text
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
