-- 운영 public._moim_m1b_backup_20261112 내용 내보내기 (2026-11-12, 테이블 삭제 전 보관용 · 실행용 아님)
-- M1b(옛 모임 DB 삭제) 때 고쳐 쓴 기존 객체의 변경 전 정의 9 함수 + 1 뷰. 옛 모임 테이블이 삭제돼 이 정의로는 되돌릴 수 없다 — 기록만.

-- ===== function admin_action_queue_counts(jsonb) · saved_at 2026-11-11 21:35:30.445877+00 · md5 1cdb04dd9f8bc2f98369a5a254700e38
CREATE OR REPLACE FUNCTION public.admin_action_queue_counts(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$ declare r jsonb := '{}'::jsonb; v bigint; v_rows jsonb; begin begin select count(*) into v from public.store_point_charge_requests t where t.request_status::text = any(array(select jsonb_array_elements_text(p->'store_charge_statuses'))); r := r || jsonb_build_object('store_charges', v); exception when undefined_table then r := r || jsonb_build_object('store_charges', 0); when others then r := r || jsonb_build_object('store_charges', null); end; begin select count(*) into v from public.business_cash_charge_requests t where t.status::text = p->>'cash_charge_status'; r := r || jsonb_build_object('cash_charges', v); exception when undefined_table then r := r || jsonb_build_object('cash_charges', 0); when others then r := r || jsonb_build_object('cash_charges', null); end; begin select count(*) into v from public.point_charge_requests t where t.request_status::text = any(array(select jsonb_array_elements_text(p->'user_charge_statuses'))); r := r || jsonb_build_object('user_charges', v); exception when undefined_table then r := r || jsonb_build_object('user_charges', 0); when others then r := r || jsonb_build_object('user_charges', null); end; begin select count(*) into v from public.reports t where t.status::text = any(array(select jsonb_array_elements_text(p->'trade_report_statuses'))); r := r || jsonb_build_object('reports', v); exception when undefined_table then r := r || jsonb_build_object('reports', 0); when others then r := r || jsonb_build_object('reports', null); end; begin select count(*) into v from public.store_reports t where t.status::text = p->>'store_report_status'; r := r || jsonb_build_object('store_reports', v); exception when undefined_table then r := r || jsonb_build_object('store_reports', 0); when others then r := r || jsonb_build_object('store_reports', null); end; begin select count(*) into v from public.delivery_operation_alert_events t where t.event_status::text = any(array(select jsonb_array_elements_text(p->'delivery_alert_statuses'))); r := r || jsonb_build_object('delivery_alerts', v); exception when undefined_table then r := r || jsonb_build_object('delivery_alerts', 0); when others then r := r || jsonb_build_object('delivery_alerts', null); end; begin select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'start_at', x.start_at, 'end_at', x.end_at)), '[]'::jsonb) into v_rows from (select t.id, t.status::text, t.start_at, t.end_at from public.feed_ad_requests t where t.status::text = p->>'feed_ad_status' limit (p->>'feed_ad_scan_limit')::int) x; r := r || jsonb_build_object('feed_ad_rows', v_rows); exception when undefined_table then r := r || jsonb_build_object('feed_ad_rows', '[]'::jsonb); when others then r := r || jsonb_build_object('feed_ad_rows', null); end; begin select count(*) into v from public.point_promotion_orders t where t.domain::text = p->>'trade_promo_domain' and t.order_status::text = p->>'trade_promo_status'; r := r || jsonb_build_object('trade_promo_pending', v); exception when undefined_table then r := r || jsonb_build_object('trade_promo_pending', 0); when others then r := r || jsonb_build_object('trade_promo_pending', null); end; begin select count(*) into v from public.store_inquiries t where t.status::text = p->>'store_inquiry_status'; r := r || jsonb_build_object('store_inquiry_open', v); exception when undefined_table then r := r || jsonb_build_object('store_inquiry_open', 0); when others then r := r || jsonb_build_object('store_inquiry_open', null); end; begin select count(*) into v from public.support_cases t where (p->'support_statuses' is null or jsonb_typeof(p->'support_statuses') = 'null' or t.status::text = any(array(select jsonb_array_elements_text(p->'support_statuses')))); r := r || jsonb_build_object('support_actionable', v); exception when undefined_table then r := r || jsonb_build_object('support_actionable', 0); when others then r := r || jsonb_build_object('support_actionable', null); end; begin select count(*) into v from public.community_reports t where t.status::text = any(array(select jsonb_array_elements_text(p->'community_report_statuses'))); r := r || jsonb_build_object('community_reports', v); exception when undefined_table then r := r || jsonb_build_object('community_reports', 0); when others then r := r || jsonb_build_object('community_reports', null); end; begin select count(*) into v from public.stores t where t.approval_status::text = any(array(select jsonb_array_elements_text(p->'store_approval_statuses'))); r := r || jsonb_build_object('store_applications', v); exception when undefined_table then r := r || jsonb_build_object('store_applications', 0); when others then r := r || jsonb_build_object('store_applications', null); end; begin select count(*) into v from public.delivery_ad_operations_cases t where t.status::text = p->>'delivery_ad_ops_status'; r := r || jsonb_build_object('delivery_ad_ops', v); exception when undefined_table then r := r || jsonb_build_object('delivery_ad_ops', 0); when others then r := r || jsonb_build_object('delivery_ad_ops', null); end; begin select count(*) into v from public.meeting_reports t where (p->'meeting_report_statuses' is null or jsonb_typeof(p->'meeting_report_statuses') = 'null' or t.status::text = any(array(select jsonb_array_elements_text(p->'meeting_report_statuses')))); r := r || jsonb_build_object('meeting_reports', v); exception when undefined_table then r := r || jsonb_build_object('meeting_reports', 0); when others then r := r || jsonb_build_object('meeting_reports', null); end; begin select count(*) into v from public.store_orders t where t.needs_admin_attention = true and not (t.order_status::text = any(array(select jsonb_array_elements_text(p->'order_excluded_statuses')))) and t.created_at >= (p->>'order_active_from')::timestamptz; r := r || jsonb_build_object('orders_attention', v); exception when undefined_table then r := r || jsonb_build_object('orders_attention', 0); when others then r := r || jsonb_build_object('orders_attention', null); end; begin select count(*) into v from public.store_sale_fee_obligations t where t.adjustment_status::text = p->>'settlement_status'; r := r || jsonb_build_object('settlements_actionable', v); exception when undefined_table then r := r || jsonb_build_object('settlements_actionable', 0); when others then r := r || jsonb_build_object('settlements_actionable', null); end; begin select count(*) into v from public.coin_withdrawal_requests t where t.status::text = p->>'coin_withdrawal_status'; r := r || jsonb_build_object('coin_withdrawals', v); exception when undefined_table then r := r || jsonb_build_object('coin_withdrawals', 0); when others then r := r || jsonb_build_object('coin_withdrawals', null); end; begin select count(*) into v from public.platform_popup_owner_requests t where t.request_status::text = any(array(select jsonb_array_elements_text(p->'popup_statuses'))); r := r || jsonb_build_object('platform_popup_pending', v); exception when undefined_table then r := r || jsonb_build_object('platform_popup_pending', 0); when others then r := r || jsonb_build_object('platform_popup_pending', null); end; begin select count(*) into v from public.delivery_ad_partner_memberships t where t.status::text = p->>'partner_status'; r := r || jsonb_build_object('partner_pending', v); exception when undefined_table then r := r || jsonb_build_object('partner_pending', 0); when others then r := r || jsonb_build_object('partner_pending', null); end; begin select count(*) into v from public.community_messenger_reports t where t.status::text = any(array(select jsonb_array_elements_text(p->'messenger_report_statuses'))); r := r || jsonb_build_object('messenger_actionable', v); exception when undefined_table then r := r || jsonb_build_object('messenger_actionable', 0); when others then r := r || jsonb_build_object('messenger_actionable', null); end; return r; end; $function$


-- ===== function admin_community_is_audit_target(text) · saved_at 2026-11-11 21:35:30.445877+00 · md5 6305a4fd38f4d86253693e720adcd109
CREATE OR REPLACE FUNCTION public.admin_community_is_audit_target(p_target_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(p_target_type, '') in (
           'community_post', 'community_comment', 'community_report', 'meeting_report',
           'community_sanction', 'sanction', 'community_topic', 'community_section',
           'community_settings', 'meeting', 'point_promotion_order', 'community_promotion_order',
           'user_points', 'point_charge_request', 'community_notice'
         )
      or coalesce(p_target_type, '') like 'community\_import%';
$function$


-- ===== function admin_community_period_stats(timestamp with time zone,timestamp with time zone) · saved_at 2026-11-11 21:35:30.445877+00 · md5 29ec8f376757be984ea4e6c832bc3d92
CREATE OR REPLACE FUNCTION public.admin_community_period_stats(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    return jsonb_build_object('ok', false, 'error', 'invalid_range');
  end if;
  if p_to - p_from > interval '400 days' then
    return jsonb_build_object('ok', false, 'error', 'range_too_long');
  end if;
  with principal as (select user_id from public.community_import_principal),
  posts as (
    select p.id, p.user_id, coalesce(p.origin_kind, 'member') as origin_kind, p.status, p.topic_id, coalesce(p.published_at, p.created_at) as at
      from public.community_posts p
     where coalesce(p.published_at, p.created_at) >= p_from and coalesce(p.published_at, p.created_at) < p_to
  ),
  comments as (
    select c.id, c.user_id, c.parent_id, c.created_at as at, p.topic_id
      from public.community_comments c left join public.community_posts p on p.id = c.post_id
     where c.created_at >= p_from and c.created_at < p_to
  ),
  acts as (select user_id, at from posts where user_id is not null union all select user_id, at from comments where user_id is not null),
  member_acts as (select a.user_id, a.at from acts a where not exists (select 1 from principal x where x.user_id = a.user_id)),
  first_acts as (
    select y.user_id, min(y.at) as first_at from (
        select p.user_id, coalesce(p.published_at, p.created_at) as at from public.community_posts p where p.user_id in (select user_id from member_acts)
        union all
        select c.user_id, c.created_at from public.community_comments c where c.user_id in (select user_id from member_acts)
      ) y group by y.user_id
  ),
  reports_in as (select r.status, r.created_at as at from public.community_reports r where r.created_at >= p_from and r.created_at < p_to),
  reports_done as (select r.status from public.community_reports r where r.processed_at >= p_from and r.processed_at < p_to),
  meeting_in as (select 1 from public.meeting_reports m where m.created_at >= p_from and m.created_at < p_to),
  meeting_done as (select m.status from public.meeting_reports m where m.reviewed_at >= p_from and m.reviewed_at < p_to),
  audit as (
    select a.action, a.target_type, a.created_at as at from public.audit_logs a
     where a.created_at >= p_from and a.created_at < p_to and a.actor_type = 'admin' and public.admin_community_is_audit_target(a.target_type)
  ),
  ledger as (
    select l.related_type, l.entry_type, l.amount, l.created_at as at from public.point_ledger l
     where l.created_at >= p_from and l.created_at < p_to
       and (l.related_type in ('community_reward', 'community_reclaim', 'admin_manual')
         or (l.related_type = 'promotion_order' and exists (select 1 from public.point_promotion_orders o where o.id::text = l.related_id and o.domain = 'community')))
  ),
  charges_ok as (select q.payment_amount, q.point_amount from public.point_charge_requests q where q.request_status = 'approved' and q.approved_at >= p_from and q.approved_at < p_to),
  charges_rej as (select 1 from public.point_charge_requests q where q.request_status = 'rejected' and q.processed_at >= p_from and q.processed_at < p_to),
  promo_new as (select o.point_cost from public.point_promotion_orders o where o.domain = 'community' and o.created_at >= p_from and o.created_at < p_to),
  promo_end as (
    select 1 from public.point_promotion_orders o
     where o.domain = 'community' and o.end_at >= greatest(p_from, timestamptz '2000-01-01') and o.end_at < least(p_to, now())
  ),
  days as (
    select d::date as day from generate_series((p_from at time zone 'Asia/Manila')::date, ((p_to - interval '1 microsecond') at time zone 'Asia/Manila')::date, interval '1 day') d
  ),
  topic_rows as (
    select t.topic_id, sum(t.posts) as posts, sum(t.comments) as comments from (
        select topic_id, count(*) as posts, 0::bigint as comments from posts group by topic_id
        union all
        select topic_id, 0::bigint, count(*) from comments group by topic_id
      ) t group by t.topic_id
  )
  select jsonb_build_object(
    'ok', true, 'from', p_from, 'to', p_to,
    'posts', jsonb_build_object('total', (select count(*) from posts), 'member', (select count(*) from posts where origin_kind = 'member'),
      'imported', (select count(*) from posts where origin_kind = 'imported'), 'admin', (select count(*) from posts where origin_kind = 'admin'),
      'active_now', (select count(*) from posts where status = 'active'), 'hidden_now', (select count(*) from posts where status = 'hidden'),
      'deleted_now', (select count(*) from posts where status = 'deleted')),
    'comments', jsonb_build_object('total', (select count(*) from comments), 'top_level', (select count(*) from comments where parent_id is null),
      'replies', (select count(*) from comments where parent_id is not null)),
    'authors', jsonb_build_object('active', (select count(distinct user_id) from member_acts),
      'new', (select count(*) from first_acts where first_at >= p_from and first_at < p_to)),
    'reports', jsonb_build_object('received', (select count(*) from reports_in), 'processed', (select count(*) from reports_done),
      'resolved', (select count(*) from reports_done where status = 'resolved'), 'dismissed', (select count(*) from reports_done where status = 'dismissed'),
      'meeting_received', (select count(*) from meeting_in), 'meeting_processed', (select count(*) from meeting_done)),
    'admin_actions', jsonb_build_object('total', (select count(*) from audit),
      'by_action', coalesce((select jsonb_object_agg(action, n) from (select action, count(*) as n from audit group by action) z), '{}'::jsonb),
      'by_target_type', coalesce((select jsonb_object_agg(target_type, n) from (select target_type, count(*) as n from audit group by target_type) z), '{}'::jsonb)),
    'engagement', jsonb_build_object(
      'post_views', (select count(*) from public.community_post_views v where v.viewed_at >= p_from and v.viewed_at < p_to),
      'post_likes', (select count(*) from public.community_post_likes k where k.created_at >= p_from and k.created_at < p_to),
      'comment_likes', (select count(*) from public.community_comment_likes k where k.created_at >= p_from and k.created_at < p_to)),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('topic_id', tr.topic_id, 'name', tp.name, 'slug', tp.slug, 'posts', tr.posts, 'comments', tr.comments)
             order by tr.posts desc, tr.comments desc) from topic_rows tr left join public.community_topics tp on tp.id = tr.topic_id), '[]'::jsonb),
    'points', coalesce((select jsonb_agg(jsonb_build_object('related_type', related_type, 'entry_type', entry_type, 'count', n, 'amount', amt) order by related_type, entry_type)
        from (select related_type, entry_type, count(*) as n, coalesce(sum(amount), 0) as amt from ledger group by related_type, entry_type) z), '[]'::jsonb),
    'charges', jsonb_build_object('approved_count', (select count(*) from charges_ok), 'approved_payment_amount', (select coalesce(sum(payment_amount), 0) from charges_ok),
      'approved_point_amount', (select coalesce(sum(point_amount), 0) from charges_ok), 'rejected_count', (select count(*) from charges_rej)),
    'promotions', jsonb_build_object('new_count', (select count(*) from promo_new), 'new_point_cost', (select coalesce(sum(point_cost), 0) from promo_new),
      'ended_count', (select count(*) from promo_end)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
               'date', to_char(d.day, 'YYYY-MM-DD'),
               'posts', (select count(*) from posts p where (p.at at time zone 'Asia/Manila')::date = d.day),
               'posts_member', (select count(*) from posts p where p.origin_kind = 'member' and (p.at at time zone 'Asia/Manila')::date = d.day),
               'posts_imported', (select count(*) from posts p where p.origin_kind = 'imported' and (p.at at time zone 'Asia/Manila')::date = d.day),
               'comments', (select count(*) from comments c where (c.at at time zone 'Asia/Manila')::date = d.day),
               'active_authors', (select count(distinct m.user_id) from member_acts m where (m.at at time zone 'Asia/Manila')::date = d.day),
               'reports', (select count(*) from reports_in r where (r.at at time zone 'Asia/Manila')::date = d.day),
               'admin_actions', (select count(*) from audit a where (a.at at time zone 'Asia/Manila')::date = d.day),
               'points_rewarded', (select coalesce(sum(l.amount), 0) from ledger l where l.related_type = 'community_reward' and (l.at at time zone 'Asia/Manila')::date = d.day),
               'points_reclaimed', (select coalesce(sum(l.amount), 0) from ledger l where l.related_type = 'community_reclaim' and (l.at at time zone 'Asia/Manila')::date = d.day)
             ) order by d.day) from days d), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$


-- ===== function community_import_publish(jsonb) · saved_at 2026-11-11 21:35:30.445877+00 · md5 e17c42cf51b27f5010eff66bb20de8ce
CREATE OR REPLACE FUNCTION public.community_import_publish(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mode text := coalesce(p->>'mode', 'create');
  v_site text := p->>'source_site';
  v_board text := p->>'source_board';
  v_key text := p->>'source_article_key';
  v_post jsonb := p->'post';
  v_link public.community_import_post_links%rowtype;
  v_post_id uuid;
  v_images jsonb;
begin
  if v_site is null or v_board is null or v_key is null or v_post is null then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  if coalesce(v_post->>'title', '') = '' or coalesce(v_post->>'content', '') = '' then
    raise exception 'empty_content' using errcode = 'P0001';
  end if;

  -- Feed `images` column is derived from image_rows (same order) so both stores can never diverge.
  select coalesce(jsonb_agg(x.image_url order by coalesce(x.sort_order, 0)), '[]'::jsonb) into v_images
  from jsonb_to_recordset(coalesce(p->'image_rows', '[]'::jsonb)) as x(image_url text, storage_path text, sort_order int)
  where coalesce(x.image_url, '') <> '';

  select * into v_link from public.community_import_post_links
  where source_site = v_site and source_board = v_board and source_article_key = v_key
  for update;

  if v_mode = 'create' then
    if found then
      raise exception 'already_published:%', v_link.post_id using errcode = 'P0001';
    end if;
    -- Same original already on the community under another key: a legacy import (no provenance row)
    -- or the same article collected through a second board. Never create a second public post.
    if coalesce(v_post->>'public_attribution_url', '') <> '' then
      select id into v_post_id from public.community_posts
      where origin_kind = 'imported' and status <> 'deleted'
        and public_attribution_url = v_post->>'public_attribution_url'
      limit 1;
      if found then
        raise exception 'published_under_other_key:%', v_post_id using errcode = 'P0001';
      end if;
    end if;
    insert into public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, category,
      images, is_question, is_meetup, meetup_place, meetup_date, status, is_sample_data, origin_kind,
      display_author_name, display_author_avatar_url, display_date, public_attribution_name, public_attribution_url,
      content_blocks
    ) values (
      (v_post->>'user_id')::uuid, (v_post->>'section_id')::uuid, v_post->>'section_slug',
      (v_post->>'topic_id')::uuid, v_post->>'topic_slug', v_post->>'title', v_post->>'content', v_post->>'summary',
      v_post->>'region_label', v_post->>'category', v_images, false, false, null, null,
      'active', false, 'imported', v_post->>'display_author_name', null, nullif(v_post->>'display_date', '')::timestamptz,
      v_post->>'public_attribution_name', v_post->>'public_attribution_url',
      case when jsonb_typeof(v_post->'content_blocks') = 'array' then v_post->'content_blocks' else null end
    ) returning id into v_post_id;

    insert into public.community_import_post_links
      (source_site, source_board, source_article_key, post_id, canonical_url, content_hash, content_policy, published_by)
    values
      (v_site, v_board, v_key, v_post_id, coalesce(p->>'canonical_url', ''), coalesce(p->>'content_hash', ''),
       coalesce(p->>'content_policy', 'summary_link'), nullif(p->>'actor_id', '')::uuid);
  elsif v_mode = 'update' then
    if not found then
      raise exception 'not_published' using errcode = 'P0001';
    end if;
    v_post_id := v_link.post_id;
    update public.community_posts set
      topic_id = (v_post->>'topic_id')::uuid,
      topic_slug = v_post->>'topic_slug',
      title = v_post->>'title',
      content = v_post->>'content',
      summary = v_post->>'summary',
      category = v_post->>'category',
      images = v_images,
      display_author_name = v_post->>'display_author_name',
      display_date = nullif(v_post->>'display_date', '')::timestamptz,
      public_attribution_name = v_post->>'public_attribution_name',
      public_attribution_url = v_post->>'public_attribution_url',
      content_blocks = case when jsonb_typeof(v_post->'content_blocks') = 'array' then v_post->'content_blocks' else null end,
      updated_at = now()
    where id = v_post_id and origin_kind = 'imported';
    if not found then
      raise exception 'post_missing:%', v_post_id using errcode = 'P0001';
    end if;
    -- Replace this one imported post's image rows. Scope: the single post_id taken from the locked
    -- provenance link (unique per post) and confirmed origin_kind='imported' above. Runs inside this
    -- function's transaction, so any later failure restores the previous rows.
    delete from public.community_post_images where post_id = v_post_id;
    update public.community_import_post_links set
      canonical_url = coalesce(p->>'canonical_url', canonical_url),
      content_hash = coalesce(p->>'content_hash', content_hash),
      content_policy = coalesce(p->>'content_policy', content_policy),
      updated_at = now()
    where id = v_link.id;
  else
    raise exception 'invalid_mode:%', v_mode using errcode = 'P0001';
  end if;

  insert into public.community_post_images (post_id, image_url, storage_path, sort_order)
  select v_post_id, x.image_url, coalesce(x.storage_path, ''), coalesce(x.sort_order, 0)
  from jsonb_to_recordset(coalesce(p->'image_rows', '[]'::jsonb)) as x(image_url text, storage_path text, sort_order int)
  where coalesce(x.image_url, '') <> '';

  if p ? 'draft' then
    insert into public.community_operator_import_drafts
      (source_site, source_board, source_article_key, canonical_url, original_json, edit_json, status, published_post_id, updated_by, updated_at)
    values
      (v_site, v_board, v_key, coalesce(p->>'canonical_url', ''), p->'draft'->'original', p->'draft'->'edit', 'published',
       v_post_id, nullif(p->>'actor_id', '')::uuid, now())
    on conflict (source_site, source_board, source_article_key) do update set
      canonical_url = excluded.canonical_url,
      original_json = excluded.original_json,
      edit_json = excluded.edit_json,
      status = 'published',
      published_post_id = v_post_id,
      updated_by = excluded.updated_by,
      updated_at = now();
  end if;

  update public.community_operator_import_inbox
  set status = 'published', published_post_id = v_post_id, last_error = null, updated_at = now()
  where source_site = v_site and source_board = v_board and source_article_key = v_key;

  return jsonb_build_object('post_id', v_post_id, 'mode', v_mode);
end;
$function$


-- ===== function community_post_image_unreferenced(text[]) · saved_at 2026-11-11 21:35:30.445877+00 · md5 ece83d80ed8a6e836f819cac62e824a4
CREATE OR REPLACE FUNCTION public.community_post_image_unreferenced(p_names text[])
 RETURNS TABLE(name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cand as (
    select n as name,
           regexp_replace(regexp_replace(n, '^.*/', ''), '\.[A-Za-z0-9]+$', '') as stem
    from unnest(coalesce(p_names, '{}'::text[])) as n
  ),
  refs as materialized (
      select image_url::text as t from public.ads
      union all select mobile_image_url::text as t from public.ads
      union all select body::text as t from public.app_notices
      union all select hero_image_url::text as t from public.app_notices
      union all select body::text as t from public.chat_messages
      union all select metadata::text as t from public.chat_messages
      union all select content::text as t from public.comments
      union all select body::text as t from public.community_chat_messages
      union all select metadata::text as t from public.community_chat_messages
      union all select thumbnail_url::text as t from public.community_chat_rooms
      union all select content::text as t from public.community_comments
      union all select content::text as t from public.community_messenger_messages
      union all select metadata::text as t from public.community_messenger_messages
      union all select avatar_url::text as t from public.community_messenger_room_profiles
      union all select avatar_url::text as t from public.community_messenger_rooms
      union all select thumbnail_url::text as t from public.community_operator_import_inbox
      union all select image_url::text as t from public.community_post_images
      union all select content::text as t from public.community_post_revisions
      union all select content_blocks::text as t from public.community_post_revisions
      union all select content::text as t from public.community_posts
      union all select content_blocks::text as t from public.community_posts
      union all select display_author_avatar_url::text as t from public.community_posts
      union all select images::text as t from public.community_posts
      union all select thumbnail_url::text as t from public.community_posts
      union all select image_url::text as t from public.dibay_item_images
      union all select thumbnail_url::text as t from public.dibay_items
      union all select image_url::text as t from public.feed_ad_creatives
      union all select image_url::text as t from public.feed_ad_request_creatives
      union all select body::text as t from public.group_messages
      union all select metadata::text as t from public.group_messages
      union all select image_url::text as t from public.meeting_album_items
      union all select content::text as t from public.meeting_feed_comments
      union all select image_url::text as t from public.meeting_feed_images
      union all select content::text as t from public.meeting_feed_posts
      union all select file_url::text as t from public.meeting_open_chat_attachments
      union all select open_profile_image_url::text as t from public.meeting_open_chat_members
      union all select content::text as t from public.meeting_open_chat_messages
      union all select thumbnail_url::text as t from public.meeting_open_chat_rooms
      union all select cover_image_url::text as t from public.meetings
      union all select body_backup::text as t from public.moderation_audit_messages
      union all select metadata_backup::text as t from public.moderation_audit_messages
      union all select display_payload::text as t from public.notification_events
      union all select image_url::text as t from public.notifications
      union all select body::text as t from public.notifications
      union all select thumbnail_url::text as t from public.open_chat_rooms
      union all select content::text as t from public.philife_comments
      union all select content::text as t from public.philife_posts
      union all select images::text as t from public.philife_posts
      union all select thumbnail_url::text as t from public.philife_posts
      union all select attachment_urls::text as t from public.platform_admin_inquiries
      union all select content::text as t from public.post_comments
      union all select url::text as t from public.post_images
      union all select content::text as t from public.posts
      union all select images::text as t from public.posts
      union all select thumbnail_url::text as t from public.posts
      union all select content::text as t from public.product_chat_messages
      union all select image_url::text as t from public.product_chat_messages
      union all select avatar_url::text as t from public.profiles
      union all select images_json::text as t from public.store_notices
      union all select image_urls::text as t from public.store_reviews
      union all select content::text as t from public.store_reviews
      union all select body::text as t from public.support_messages
      union all select image_urls::text as t from public.trade_showcase_items
  )
  select c.name
  from cand c
  where length(c.stem) >= 32
    and not exists (select 1 from refs r where r.t is not null and position(c.stem in r.t) > 0);
$function$


-- ===== function ensure_community_post_for_post_ads(uuid,uuid) · saved_at 2026-11-11 21:35:30.445877+00 · md5 bd8439ca78a2cb0ff390771ab569ec02
CREATE OR REPLACE FUNCTION public.ensure_community_post_for_post_ads(p_post_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_post record;
  v_section_id uuid;
  v_section_slug text;
  v_topic_id uuid;
  v_topic_slug text;
  v_location_id uuid;
  v_region_label text := 'Philippines';
BEGIN
  IF p_post_id IS NULL OR p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.community_posts') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id FROM public.community_posts WHERE id = p_post_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_id
  FROM public.community_posts
  WHERE source_legacy_post_id = p_post_id::text
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  IF to_regclass('public.posts') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, user_id, title, content, status, type
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id AND user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_post.type, '') NOT IN ('community', '') THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_post.status, 'active') IN ('deleted', 'hidden') THEN
    RETURN NULL;
  END IF;

  SELECT cs.id, cs.slug
  INTO v_section_id, v_section_slug
  FROM public.community_sections cs
  WHERE cs.is_active = true
    AND cs.slug IN ('plife', 'philife', 'dongnae')
  ORDER BY CASE cs.slug WHEN 'plife' THEN 0 WHEN 'philife' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_section_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ct.id, ct.slug
  INTO v_topic_id, v_topic_slug
  FROM public.community_topics ct
  WHERE ct.section_id = v_section_id
    AND COALESCE(ct.is_visible, true) = true
  ORDER BY ct.sort_order NULLS LAST, ct.created_at
  LIMIT 1;

  IF v_topic_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.locations') IS NOT NULL THEN
    SELECT l.id, COALESCE(l.district, l.city, l.region, v_region_label)
    INTO v_location_id, v_region_label
    FROM public.locations l
    WHERE COALESCE(l.is_active, true) = true
    ORDER BY l.created_at NULLS LAST
    LIMIT 1;
  END IF;

  INSERT INTO public.community_posts (
    id,
    user_id,
    section_id,
    section_slug,
    topic_id,
    topic_slug,
    title,
    content,
    summary,
    region_label,
    location_id,
    category,
    images,
    is_question,
    is_meetup,
    status,
    source_legacy_post_id
  ) VALUES (
    p_post_id,
    v_post.user_id,
    v_section_id,
    v_section_slug,
    v_topic_id,
    v_topic_slug,
    COALESCE(NULLIF(trim(v_post.title), ''), '(제목 없음)'),
    COALESCE(v_post.content, ''),
    left(COALESCE(v_post.content, ''), 180),
    COALESCE(v_region_label, 'Philippines'),
    v_location_id,
    'etc',
    '[]'::jsonb,
    false,
    false,
    'active',
    p_post_id::text
  )
  ON CONFLICT (id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN COALESCE(v_id, p_post_id);
EXCEPTION
  WHEN undefined_column THEN
    RETURN NULL;
  WHEN undefined_table THEN
    RETURN NULL;
END;
$function$


-- ===== function get_cm_bootstrap_full_snapshot(uuid,text,integer,text) · saved_at 2026-11-11 21:35:30.445877+00 · md5 71dc3d2d7c897dffe3b2d3f8df28bf12
CREATE OR REPLACE FUNCTION public.get_cm_bootstrap_full_snapshot(p_user_id uuid, p_cursor text DEFAULT ''::text, p_limit integer DEFAULT 500, p_tier text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text := lower(trim(coalesce(p_tier, 'full')));
  v_cap integer;
  v_lite jsonb;
  v_hs5 jsonb;
  v_pc_ids uuid[];
  v_cm_ids uuid[];
  v_trade_context jsonb;
  v_order_context jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_required', 'updated_at', now());
  END IF;

  IF v_tier = 'critical' THEN
    v_cap := least(greatest(coalesce(p_limit, 30), 1), 30);
  ELSE
    v_cap := least(greatest(coalesce(p_limit, 500), 1), 500);
  END IF;

  v_lite := public.community_messenger_bootstrap_lite_my_rooms_bundle(p_user_id, v_cap);

  SELECT coalesce(array_agg(DISTINCT (r->>'id')::uuid) FILTER (WHERE (r->>'id') IS NOT NULL), '{}'::uuid[])
  INTO v_cm_ids
  FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
  WHERE coalesce(r->>'room_type', '') = 'direct'
    AND (
      trim(coalesce(r->>'direct_key', '')) LIKE 'trade_pc:%'
      OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_item:%'
    );

  SELECT coalesce(
    array_agg(DISTINCT (substring(trim(r->>'direct_key') FROM 10))::uuid)
      FILTER (
        WHERE trim(coalesce(r->>'direct_key', '')) LIKE 'trade_pc:%'
          AND length(trim(substring(trim(r->>'direct_key') FROM 10))) > 0
      ),
    '{}'::uuid[]
  )
  INTO v_pc_ids
  FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r;

  v_hs5 := public.home_sync_hs5_unread_legacy_bundle(v_cm_ids, v_pc_ids);

  SELECT jsonb_build_object(
    'store_orders', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id,
          'order_status', so.order_status,
          'community_messenger_room_id', so.community_messenger_room_id,
          'store_id', so.store_id,
          'store_name', st.store_name,
          'profile_image_url', st.profile_image_url
        )
      )
      FROM public.store_orders so
      LEFT JOIN public.stores st ON st.id = so.store_id
      WHERE (
        so.id IN (
          SELECT DISTINCT (nullif(trim(substring(trim(r->>'direct_key') FROM 13)), ''))::uuid
          FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
          WHERE coalesce(r->>'room_type', '') = 'direct'
            AND (
              trim(coalesce(r->>'direct_key', '')) LIKE 'store_order:%'
              OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_order:%'
            )
            AND length(trim(substring(trim(r->>'direct_key') FROM 13))) = 36
        )
      )
      OR (
        so.community_messenger_room_id IN (
          SELECT DISTINCT (r->>'id')::uuid
          FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
          WHERE coalesce(r->>'room_type', '') = 'direct'
            AND (
              trim(coalesce(r->>'direct_key', '')) LIKE 'store_order:%'
              OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_order:%'
            )
            AND (r->>'id') IS NOT NULL
        )
      )
    ), '[]'::jsonb)
  )
  INTO v_order_context;

  IF v_tier = 'critical' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'tier', 'critical',
      'rooms', coalesce(v_lite->'rooms', '[]'::jsonb),
      'unread_snapshot', jsonb_build_object(
        'hs5', v_hs5,
        'participants', coalesce(v_lite->'participants', '[]'::jsonb)
      ),
      'room_summaries', '[]'::jsonb,
      'latest_messages', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'room_id', r->>'id',
            'last_message', r->>'last_message',
            'last_message_at', r->>'last_message_at',
            'last_message_type', r->>'last_message_type',
            'last_message_meta', r->'last_message_meta'
          )
          ORDER BY r->>'last_message_at' DESC NULLS LAST
        )
        FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
      ), '[]'::jsonb),
      'lite_bundle', v_lite,
      'hs5', v_hs5,
      'order_context', coalesce(v_order_context, jsonb_build_object('store_orders', '[]'::jsonb)),
      'next_cursor', null,
      'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
      'list_limit', v_cap,
      'updated_at', now()
    );
  END IF;

  SELECT public.home_sync_direct_keys_critical_bundle(v_cm_ids, v_pc_ids)
  INTO v_trade_context;

  RETURN (
    WITH social AS (
      SELECT jsonb_build_object(
        'accepted_friends', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'requester_id', f.requester_user_id,
              'addressee_id', f.addressee_user_id,
              'status', 'accepted',
              'created_at', f.created_at,
              'responded_at', coalesce(f.accepted_at, f.updated_at)
            )
            ORDER BY coalesce(f.accepted_at, f.updated_at) DESC NULLS LAST
          )
          FROM public.community_messenger_friendships f
          WHERE f.status = 'accepted'
            AND (f.requester_user_id = p_user_id OR f.addressee_user_id = p_user_id)
        ), '[]'::jsonb),
        'favorite_friend_ids', coalesce((
          SELECT jsonb_agg(ff.target_user_id ORDER BY ff.created_at DESC)
          FROM public.community_friend_favorites ff
          WHERE ff.user_id = p_user_id
        ), '[]'::jsonb),
        'following_neighbor', coalesce((
          SELECT jsonb_agg(ur.target_user_id)
          FROM public.user_relationships ur
          WHERE ur.user_id = p_user_id
            AND (ur.relation_type = 'neighbor_follow' OR ur.type = 'neighbor_follow')
        ), '[]'::jsonb),
        'following_hidden', coalesce((
          SELECT jsonb_agg(ur.target_user_id)
          FROM public.user_relationships ur
          WHERE ur.user_id = p_user_id
            AND (ur.relation_type = 'hidden' OR ur.type = 'hidden')
        ), '[]'::jsonb),
        'following_blocked', coalesce((
          SELECT jsonb_agg(DISTINCT blocked_id)
          FROM (
            SELECT sr.target_user_id AS blocked_id
            FROM public.user_social_relations sr
            WHERE sr.owner_user_id = p_user_id
              AND sr.relation_type = 'blocked' AND coalesce(sr.is_active, true)
            UNION
            SELECT ur.target_user_id AS blocked_id
            FROM public.user_relationships ur
            WHERE ur.user_id = p_user_id
              AND (ur.relation_type = 'blocked' OR ur.type = 'blocked')
          ) blocked_union
          WHERE blocked_id IS NOT NULL
        ), '[]'::jsonb),
        'friend_requests', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', f.id,
              'requester_id', f.requester_user_id,
              'addressee_id', f.addressee_user_id,
              'status', f.status,
              'created_at', f.created_at,
              'responded_at', null
            )
            ORDER BY f.created_at DESC
          )
          FROM public.community_messenger_friendships f
          WHERE f.status = 'pending'
            AND (f.requester_user_id = p_user_id OR f.addressee_user_id = p_user_id)
        ), '[]'::jsonb)
      ) AS j
    ),
    discoverable AS (
      SELECT coalesce(
        jsonb_agg(
          to_jsonb(r)
          ORDER BY r.last_message_at DESC NULLS LAST
        ),
        '[]'::jsonb
      ) AS rooms
      FROM public.community_messenger_rooms r
      WHERE r.room_type = 'open_group'
        AND r.is_discoverable = true
      LIMIT 50
    ),
    disc_participants AS (
      SELECT coalesce(
        jsonb_agg(to_jsonb(p)),
        '[]'::jsonb
      ) AS participants
      FROM public.community_messenger_participants p
      WHERE p.room_id IN (
        SELECT (dr->>'id')::uuid
        FROM discoverable d,
          jsonb_array_elements(d.rooms) AS dr
        WHERE dr->>'id' IS NOT NULL
      )
    ),
    joined_rooms AS (
      SELECT coalesce(
        jsonb_agg(p.room_id),
        '[]'::jsonb
      ) AS ids
      FROM public.community_messenger_participants p
      WHERE p.user_id = p_user_id
    ),
    call_logs AS (
      SELECT coalesce(
        jsonb_agg(
          to_jsonb(cl) ||
          jsonb_build_object(
            'sessionEndedAt', cs.ended_at,
            'sessionEndedReason', cs.ended_reason
          )
          ORDER BY cl.started_at DESC NULLS LAST
        ),
        '[]'::jsonb
      ) AS rows
      FROM public.community_messenger_call_logs cl
      LEFT JOIN public.community_messenger_call_sessions cs ON cs.id = cl.session_id
      WHERE (cl.caller_user_id = p_user_id OR cl.peer_user_id = p_user_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.community_messenger_call_log_user_hides h
          WHERE h.user_id = p_user_id AND h.call_log_id = cl.id
        )
      LIMIT 100
    ),
    call_session_participants AS (
      SELECT coalesce(
        jsonb_agg(to_jsonb(csp)),
        '[]'::jsonb
      ) AS rows
      FROM public.community_messenger_call_session_participants csp
      WHERE csp.session_id IN (
        SELECT (cr->>'session_id')::uuid
        FROM call_logs cl,
          jsonb_array_elements(cl.rows) AS cr
        WHERE cr->>'session_id' IS NOT NULL
      )
    ),
    meetings AS (
      SELECT coalesce(
        jsonb_agg(to_jsonb(m)),
        '[]'::jsonb
      ) AS rows
      FROM public.meetings m
      WHERE m.community_messenger_room_id IN (
        SELECT (dr->>'id')::uuid
        FROM discoverable d,
          jsonb_array_elements(d.rooms) AS dr
        WHERE dr->>'id' IS NOT NULL
      )
    ),
    all_user_ids AS (
      SELECT DISTINCT uid AS id
      FROM (
        SELECT p_user_id AS uid
        UNION
        SELECT (pr->>'user_id')::uuid FROM jsonb_array_elements(coalesce(v_lite->'participants', '[]'::jsonb)) AS pr
        UNION
        SELECT (fr->>'requester_id')::uuid FROM social s, jsonb_array_elements(coalesce(s.j->'accepted_friends', '[]'::jsonb)) AS fr
        UNION
        SELECT (fr->>'addressee_id')::uuid FROM social s, jsonb_array_elements(coalesce(s.j->'accepted_friends', '[]'::jsonb)) AS fr
        UNION
        SELECT (fr->>'requester_id')::uuid FROM social s, jsonb_array_elements(coalesce(s.j->'friend_requests', '[]'::jsonb)) AS fr
        UNION
        SELECT (fr->>'addressee_id')::uuid FROM social s, jsonb_array_elements(coalesce(s.j->'friend_requests', '[]'::jsonb)) AS fr
        UNION
        SELECT (fid)::uuid FROM social s, jsonb_array_elements_text(coalesce(s.j->'favorite_friend_ids', '[]'::jsonb)) AS fid
        UNION
        SELECT (fid)::uuid FROM social s, jsonb_array_elements_text(coalesce(s.j->'following_neighbor', '[]'::jsonb)) AS fid
        UNION
        SELECT (fid)::uuid FROM social s, jsonb_array_elements_text(coalesce(s.j->'following_hidden', '[]'::jsonb)) AS fid
        UNION
        SELECT (fid)::uuid FROM social s, jsonb_array_elements_text(coalesce(s.j->'following_blocked', '[]'::jsonb)) AS fid
        UNION
        SELECT (dp->>'user_id')::uuid FROM disc_participants dpj, jsonb_array_elements(dpj.participants) AS dp
        UNION
        SELECT (cl->>'caller_user_id')::uuid FROM call_logs clj, jsonb_array_elements(clj.rows) AS cl
        UNION
        SELECT (cl->>'peer_user_id')::uuid FROM call_logs clj, jsonb_array_elements(clj.rows) AS cl
        UNION
        SELECT (csp->>'user_id')::uuid FROM call_session_participants cspj, jsonb_array_elements(cspj.rows) AS csp
      ) z
      WHERE uid IS NOT NULL
    ),
    profile_labels_expanded AS (
      SELECT coalesce(
        jsonb_object_agg(
          pr.id::text,
          jsonb_build_object(
            'id', pr.id,
            'display_name', pr.display_name,
            'nickname', pr.nickname,
            'username', pr.username,
            'avatar_url', pr.avatar_url,
            'bio', pr.bio
          )
        ),
        coalesce(v_lite->'profile_labels', '{}'::jsonb)
      ) AS profiles
      FROM public.profiles pr
      WHERE pr.id IN (SELECT id FROM all_user_ids)
    )
    SELECT jsonb_build_object(
      'ok', true,
      'tier', 'full',
      'rooms', coalesce(v_lite->'rooms', '[]'::jsonb),
      'unread_snapshot', jsonb_build_object(
        'hs5', v_hs5,
        'participants', coalesce(v_lite->'participants', '[]'::jsonb)
      ),
      'room_summaries', '[]'::jsonb,
      'latest_messages', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'room_id', r->>'id',
            'last_message', r->>'last_message',
            'last_message_at', r->>'last_message_at',
            'last_message_type', r->>'last_message_type',
            'last_message_meta', r->'last_message_meta'
          )
          ORDER BY r->>'last_message_at' DESC NULLS LAST
        )
        FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
      ), '[]'::jsonb),
      'lite_bundle', v_lite,
      'hs5', v_hs5,
      'social_graph', (SELECT j FROM social),
      'discoverable', jsonb_build_object(
        'rooms', (SELECT rooms FROM discoverable),
        'participants', (SELECT participants FROM disc_participants),
        'joined_room_ids', (SELECT ids FROM joined_rooms)
      ),
      'trade_context', coalesce(v_trade_context, '{}'::jsonb),
      'order_context', coalesce(v_order_context, jsonb_build_object('store_orders', '[]'::jsonb)),
      'notification_context', '{}'::jsonb,
      'attachment_meta', '{}'::jsonb,
      'call_logs', (SELECT rows FROM call_logs),
      'call_session_participants', (SELECT rows FROM call_session_participants),
      'meetings', (SELECT rows FROM meetings),
      'profile_labels_expanded', (SELECT profiles FROM profile_labels_expanded),
      'next_cursor', null,
      'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
      'list_limit', v_cap,
      'updated_at', now()
    )
  );
END;
$function$


-- ===== function philife_list_default_section_topics_for_feed() · saved_at 2026-11-11 21:35:30.445877+00 · md5 bcc344a9fa21018905a5dc0cb4447ab3
CREATE OR REPLACE FUNCTION public.philife_list_default_section_topics_for_feed()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH raw_slug AS (
    SELECT value_json ->> 'section_slug' AS s
    FROM public.admin_settings
    WHERE key = 'philife_neighborhood_section'
    LIMIT 1
  ),
  slug_try AS (
    SELECT COALESCE(
      NULLIF(lower(trim(coalesce((SELECT s FROM raw_slug), ''))), ''),
      'dongnae'
    )::text AS v
  ),
  picked_section AS (
    SELECT COALESCE(
      (
        SELECT cs.id
        FROM public.community_sections cs,
          slug_try st
        WHERE cs.slug = st.v
          AND cs.is_active = true
        LIMIT 1
      ),
      (
        SELECT cs2.id
        FROM public.community_sections cs2
        WHERE cs2.slug = 'dongnae'
          AND cs2.is_active = true
        LIMIT 1
      )
    ) AS section_id
  ),
  topic_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(row_to_json(q)::jsonb ORDER BY q.sort_order ASC, q.id ASC)
        FROM (
          SELECT
            t.id,
            t.section_id,
            t.name,
            t.name_en,
            t.slug,
            t.color,
            t.icon,
            t.sort_order,
            t.is_visible,
            t.is_feed_sort,
            t.allow_question,
            t.allow_meetup,
            t.feed_list_skin
          FROM public.community_topics t
          WHERE t.section_id = (SELECT section_id FROM picked_section)
            AND t.is_active = true
            AND t.is_visible = true
        ) q
      ),
      '[]'::jsonb
    ) AS topics
  )
  SELECT jsonb_build_object(
    'resolved_slug',
    COALESCE(
      (
        SELECT lower(trim(cs.slug))
        FROM public.community_sections cs
        WHERE cs.id = (SELECT section_id FROM picked_section)
        LIMIT 1
      ),
      'dongnae'
    ),
    'section_slug_candidate',
    (SELECT v FROM slug_try),
    'topics',
    (SELECT topics FROM topic_json)
  );
$function$


-- ===== function philify_list_default_section_topics_for_feed() · saved_at 2026-11-11 21:35:30.445877+00 · md5 51305de44a7178c2bceac669ed9738de
CREATE OR REPLACE FUNCTION public.philify_list_default_section_topics_for_feed()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH raw_slug AS (
    SELECT value_json ->> 'section_slug' AS s
    FROM public.admin_settings
    WHERE key = 'philife_neighborhood_section'
    LIMIT 1
  ),
  slug_try AS (
    SELECT COALESCE(
      NULLIF(lower(trim(coalesce((SELECT s FROM raw_slug), ''))), ''),
      'dongnae'
    )::text AS v
  ),
  picked_section AS (
    SELECT COALESCE(
      (
        SELECT cs.id
        FROM public.community_sections cs,
          slug_try st
        WHERE cs.slug = st.v
          AND cs.is_active = true
        LIMIT 1
      ),
      (
        SELECT cs2.id
        FROM public.community_sections cs2
        WHERE cs2.slug = 'dongnae'
          AND cs2.is_active = true
        LIMIT 1
      )
    ) AS section_id
  ),
  topic_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(row_to_json(q)::jsonb ORDER BY q.sort_order ASC, q.id ASC)
        FROM (
          SELECT
            t.id,
            t.section_id,
            t.name,
            t.slug,
            t.color,
            t.icon,
            t.sort_order,
            t.is_visible,
            t.is_feed_sort,
            t.allow_question,
            t.allow_meetup,
            t.feed_list_skin,
            t.feed_sort_mode
          FROM public.community_topics t
          WHERE t.section_id = (SELECT section_id FROM picked_section)
            AND t.is_active = true
            AND t.is_visible = true
        ) q
      ),
      '[]'::jsonb
    ) AS topics
  )
  SELECT jsonb_build_object(
    'resolved_slug',
    COALESCE(
      (
        SELECT lower(trim(cs.slug))
        FROM public.community_sections cs
        WHERE cs.id = (SELECT section_id FROM picked_section)
        LIMIT 1
      ),
      'dongnae'
    ),
    'section_slug_candidate',
    (SELECT v FROM slug_try),
    'topics',
    (SELECT topics FROM topic_json)
  );
$function$


-- ===== view public.philife_topics · saved_at 2026-11-11 21:35:30.445877+00 · md5 7afe4873a5bb32a8233034ea4b94250b
create view public.philife_topics with (security_invoker = true) as  SELECT id,
    section_id,
    name,
    slug,
    icon,
    color,
    sort_order,
    is_active,
    is_visible,
    allow_question,
    allow_meetup,
    is_feed_sort,
    created_at,
    updated_at,
    feed_list_skin
   FROM community_topics;

