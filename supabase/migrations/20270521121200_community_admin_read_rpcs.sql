-- 커뮤니티 Admin 조회 RPC (설계 §C-10 작성자 조회 · §C-21 운영 통계 · §D-4 · §D-6).
-- 읽기 전용 집계만 — 테이블·데이터 변경 없음 (DROP/DELETE/UPDATE 없음). SECURITY DEFINER + service_role 전용.
-- 선행: M5(sanctions.scope/restriction/revoked_at), M7(point_ledger.actor_id) — 파일 순서상 앞에 있다.
-- 기간은 호출자가 마닐라 자정 경계를 UTC [p_from, p_to) 로 넘긴다. 일별 버킷은 Asia/Manila 날짜.

-- 커뮤니티 감사 대상 유형 (lib/admin/community-admin/community-admin-read-contract.ts 와 같은 목록)
create or replace function public.admin_community_is_audit_target(p_target_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_target_type, '') in (
           'community_post', 'community_comment', 'community_report', 'meeting_report',
           'community_sanction', 'sanction', 'community_topic', 'community_section',
           'community_settings', 'meeting', 'point_promotion_order', 'community_promotion_order',
           'user_points', 'point_charge_request', 'community_notice'
         )
      or coalesce(p_target_type, '') like 'community\_import%';
$$;

-- ── 작성자(커뮤니티 활동 회원) 목록 ─────────────────────────────────────────
-- 글 또는 댓글을 쓴 회원 (외부 수집 계정 제외). 받은 신고·낸 신고는 현재 페이지 행만 계산한다.
-- p_sort: recent(최근 활동) | posts | comments | joined | nickname
-- p_account: null | 'suspended'(profiles.status suspended·blocked) | 'active'
-- p_from/p_to: 기간 안에 글 또는 댓글을 쓴 회원만 (null = 전체). 게시글·댓글 수는 전체 누적.
create or replace function public.admin_community_members(
  p_q text default null,
  p_restricted boolean default false,
  p_account text default null,
  p_sort text default 'recent',
  p_limit integer default 50,
  p_offset integer default 0,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(left(trim(coalesce(p_q, '')), 60), '');
  v_like text;
  v_sort text := coalesce(nullif(trim(p_sort), ''), 'recent');
  v_total bigint;
  v_rows jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_sort not in ('recent', 'posts', 'comments', 'joined', 'nickname') then
    v_sort := 'recent';
  end if;
  v_like := case when v_q is null then null
                 else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  with principal as (
    select user_id from public.community_import_principal
  ),
  post_agg as (
    select p.user_id, count(*) as post_count, max(p.created_at) as last_post_at
      from public.community_posts p
     where p.user_id is not null
       and not exists (select 1 from principal x where x.user_id = p.user_id)
     group by p.user_id
  ),
  comment_agg as (
    select c.user_id, count(*) as comment_count, max(c.created_at) as last_comment_at
      from public.community_comments c
     where c.user_id is not null
       and not exists (select 1 from principal x where x.user_id = c.user_id)
     group by c.user_id
  ),
  authors as (
    select coalesce(pa.user_id, ca.user_id) as user_id,
           coalesce(pa.post_count, 0) as post_count,
           coalesce(ca.comment_count, 0) as comment_count,
           greatest(pa.last_post_at, ca.last_comment_at) as last_activity_at
      from post_agg pa
      full join comment_agg ca on ca.user_id = pa.user_id
  ),
  restr as (
    select s.user_id,
           jsonb_agg(jsonb_build_object(
             'id', s.id, 'restriction', s.restriction, 'start_at', s.start_at,
             'end_at', s.end_at, 'reason', s.reason
           ) order by s.created_at desc) as restrictions
      from public.sanctions s
     where s.scope = 'community'
       and s.sanction_type = 'community_restriction'
       and s.revoked_at is null
       and (s.end_at is null or s.end_at > now())
     group by s.user_id
  ),
  base as (
    select a.user_id, a.post_count, a.comment_count, a.last_activity_at,
           pr.nickname, pr.username, pr.dibay_id, pr.created_at as joined_at,
           pr.status as account_status, pr.member_status, pr.points,
           r.restrictions
      from authors a
      left join public.profiles pr on pr.id = a.user_id
      left join restr r on r.user_id = a.user_id
     where (v_like is null
            or pr.nickname ilike v_like
            or pr.username ilike v_like
            or pr.dibay_id ilike v_like
            or a.user_id::text = v_q)
       and (not coalesce(p_restricted, false) or r.restrictions is not null)
       and (p_account is null
            or (p_account = 'suspended' and pr.status in ('suspended', 'blocked'))
            or (p_account = 'active' and coalesce(pr.status, '') not in ('suspended', 'blocked', 'deleted')))
       and (p_from is null
            or exists (select 1 from public.community_posts p
                        where p.user_id = a.user_id and p.created_at >= p_from
                          and (p_to is null or p.created_at < p_to))
            or exists (select 1 from public.community_comments c
                        where c.user_id = a.user_id and c.created_at >= p_from
                          and (p_to is null or c.created_at < p_to)))
  ),
  page as (
    select b.*,
           row_number() over (
             order by
               case when v_sort = 'posts' then b.post_count end desc nulls last,
               case when v_sort = 'comments' then b.comment_count end desc nulls last,
               case when v_sort = 'joined' then b.joined_at end desc nulls last,
               case when v_sort = 'nickname' then lower(coalesce(b.nickname, '')) end asc,
               b.last_activity_at desc nulls last,
               b.user_id
           ) as ord
      from base b
     order by ord
     limit v_limit offset v_offset
  )
  select (select count(*) from base),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'user_id', pg.user_id,
                    'nickname', pg.nickname,
                    'username', pg.username,
                    'dibay_id', pg.dibay_id,
                    'joined_at', pg.joined_at,
                    'post_count', pg.post_count,
                    'comment_count', pg.comment_count,
                    'last_activity_at', pg.last_activity_at,
                    'account_status', pg.account_status,
                    'member_status', pg.member_status,
                    'points', pg.points,
                    'active_restrictions', coalesce(pg.restrictions, '[]'::jsonb),
                    'warning_count', (
                      select count(*) from public.sanctions s
                       where s.user_id = pg.user_id and s.scope = 'community' and s.sanction_type = 'warning'
                    ),
                    'reports_received', (
                      select count(*) from public.community_reports r
                       where (coalesce(r.target_type, 'post') = 'post'
                              and coalesce(r.target_id, r.post_id::text) in
                                  (select p.id::text from public.community_posts p where p.user_id = pg.user_id))
                          or (r.target_type = 'comment'
                              and r.target_id in
                                  (select c.id::text from public.community_comments c where c.user_id = pg.user_id))
                          or (r.target_type = 'user' and r.target_id = pg.user_id::text)
                    ),
                    'reports_made', (
                      select count(*) from public.community_reports r where r.user_id = pg.user_id
                    )
                  ) order by pg.ord)
             from page pg
         ), '[]'::jsonb)
    into v_total, v_rows;

  return jsonb_build_object('ok', true, 'total', v_total, 'rows', v_rows);
end;
$$;

-- ── 기간 통계 (§D-4) + 마닐라 일별 추이 ───────────────────────────────────────
create or replace function public.admin_community_period_stats(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
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

  with principal as (
    select user_id from public.community_import_principal
  ),
  posts as (
    select p.id, p.user_id, coalesce(p.origin_kind, 'member') as origin_kind, p.status, p.topic_id,
           coalesce(p.published_at, p.created_at) as at
      from public.community_posts p
     where coalesce(p.published_at, p.created_at) >= p_from
       and coalesce(p.published_at, p.created_at) < p_to
  ),
  comments as (
    select c.id, c.user_id, c.parent_id, c.created_at as at, p.topic_id
      from public.community_comments c
      left join public.community_posts p on p.id = c.post_id
     where c.created_at >= p_from and c.created_at < p_to
  ),
  acts as (
    select user_id, at from posts where user_id is not null
    union all
    select user_id, at from comments where user_id is not null
  ),
  member_acts as (
    select a.user_id, a.at from acts a
     where not exists (select 1 from principal x where x.user_id = a.user_id)
  ),
  first_acts as (
    select y.user_id, min(y.at) as first_at
      from (
        select p.user_id, coalesce(p.published_at, p.created_at) as at
          from public.community_posts p
         where p.user_id in (select user_id from member_acts)
        union all
        select c.user_id, c.created_at
          from public.community_comments c
         where c.user_id in (select user_id from member_acts)
      ) y
     group by y.user_id
  ),
  reports_in as (
    select r.status, r.created_at as at from public.community_reports r
     where r.created_at >= p_from and r.created_at < p_to
  ),
  reports_done as (
    select r.status from public.community_reports r
     where r.processed_at >= p_from and r.processed_at < p_to
  ),
  meeting_in as (
    select 1 from public.meeting_reports m where m.created_at >= p_from and m.created_at < p_to
  ),
  meeting_done as (
    select m.status from public.meeting_reports m
     where m.reviewed_at >= p_from and m.reviewed_at < p_to
  ),
  audit as (
    select a.action, a.target_type, a.created_at as at
      from public.audit_logs a
     where a.created_at >= p_from and a.created_at < p_to
       and a.actor_type = 'admin'
       and public.admin_community_is_audit_target(a.target_type)
  ),
  ledger as (
    select l.related_type, l.entry_type, l.amount, l.created_at as at
      from public.point_ledger l
     where l.created_at >= p_from and l.created_at < p_to
       and (
         l.related_type in ('community_reward', 'community_reclaim', 'admin_manual')
         or (l.related_type = 'promotion_order'
             and exists (select 1 from public.point_promotion_orders o
                          where o.id::text = l.related_id and o.domain = 'community'))
       )
  ),
  charges_ok as (
    select q.payment_amount, q.point_amount from public.point_charge_requests q
     where q.request_status = 'approved' and q.approved_at >= p_from and q.approved_at < p_to
  ),
  charges_rej as (
    select 1 from public.point_charge_requests q
     where q.request_status = 'rejected' and q.processed_at >= p_from and q.processed_at < p_to
  ),
  promo_new as (
    select o.point_cost from public.point_promotion_orders o
     where o.domain = 'community' and o.created_at >= p_from and o.created_at < p_to
  ),
  promo_end as (
    -- 1970 같은 잘못된 종료일(C-48)은 제외
    select 1 from public.point_promotion_orders o
     where o.domain = 'community'
       and o.end_at >= greatest(p_from, timestamptz '2000-01-01') and o.end_at < least(p_to, now())
  ),
  days as (
    select d::date as day
      from generate_series(
        (p_from at time zone 'Asia/Manila')::date,
        ((p_to - interval '1 microsecond') at time zone 'Asia/Manila')::date,
        interval '1 day'
      ) d
  ),
  topic_rows as (
    select t.topic_id, sum(t.posts) as posts, sum(t.comments) as comments
      from (
        select topic_id, count(*) as posts, 0::bigint as comments from posts group by topic_id
        union all
        select topic_id, 0::bigint, count(*) from comments group by topic_id
      ) t
     group by t.topic_id
  )
  select jsonb_build_object(
    'ok', true,
    'from', p_from,
    'to', p_to,
    'posts', jsonb_build_object(
      'total', (select count(*) from posts),
      'member', (select count(*) from posts where origin_kind = 'member'),
      'imported', (select count(*) from posts where origin_kind = 'imported'),
      'admin', (select count(*) from posts where origin_kind = 'admin'),
      'active_now', (select count(*) from posts where status = 'active'),
      'hidden_now', (select count(*) from posts where status = 'hidden'),
      'deleted_now', (select count(*) from posts where status = 'deleted')
    ),
    'comments', jsonb_build_object(
      'total', (select count(*) from comments),
      'top_level', (select count(*) from comments where parent_id is null),
      'replies', (select count(*) from comments where parent_id is not null)
    ),
    'authors', jsonb_build_object(
      'active', (select count(distinct user_id) from member_acts),
      'new', (select count(*) from first_acts where first_at >= p_from and first_at < p_to)
    ),
    'reports', jsonb_build_object(
      'received', (select count(*) from reports_in),
      'processed', (select count(*) from reports_done),
      'resolved', (select count(*) from reports_done where status = 'resolved'),
      'dismissed', (select count(*) from reports_done where status = 'dismissed'),
      'meeting_received', (select count(*) from meeting_in),
      'meeting_processed', (select count(*) from meeting_done)
    ),
    'admin_actions', jsonb_build_object(
      'total', (select count(*) from audit),
      'by_action', coalesce((select jsonb_object_agg(action, n) from
                    (select action, count(*) as n from audit group by action) z), '{}'::jsonb),
      'by_target_type', coalesce((select jsonb_object_agg(target_type, n) from
                    (select target_type, count(*) as n from audit group by target_type) z), '{}'::jsonb)
    ),
    'engagement', jsonb_build_object(
      'post_views', (select count(*) from public.community_post_views v
                      where v.viewed_at >= p_from and v.viewed_at < p_to),
      'post_likes', (select count(*) from public.community_post_likes k
                      where k.created_at >= p_from and k.created_at < p_to),
      'comment_likes', (select count(*) from public.community_comment_likes k
                         where k.created_at >= p_from and k.created_at < p_to)
    ),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
               'topic_id', tr.topic_id, 'name', tp.name, 'slug', tp.slug,
               'posts', tr.posts, 'comments', tr.comments
             ) order by tr.posts desc, tr.comments desc)
        from topic_rows tr
        left join public.community_topics tp on tp.id = tr.topic_id
    ), '[]'::jsonb),
    'points', coalesce((
      select jsonb_agg(jsonb_build_object(
               'related_type', related_type, 'entry_type', entry_type,
               'count', n, 'amount', amt
             ) order by related_type, entry_type)
        from (select related_type, entry_type, count(*) as n, coalesce(sum(amount), 0) as amt
                from ledger group by related_type, entry_type) z
    ), '[]'::jsonb),
    'charges', jsonb_build_object(
      'approved_count', (select count(*) from charges_ok),
      'approved_payment_amount', (select coalesce(sum(payment_amount), 0) from charges_ok),
      'approved_point_amount', (select coalesce(sum(point_amount), 0) from charges_ok),
      'rejected_count', (select count(*) from charges_rej)
    ),
    'promotions', jsonb_build_object(
      'new_count', (select count(*) from promo_new),
      'new_point_cost', (select coalesce(sum(point_cost), 0) from promo_new),
      'ended_count', (select count(*) from promo_end)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', to_char(d.day, 'YYYY-MM-DD'),
               'posts', (select count(*) from posts p where (p.at at time zone 'Asia/Manila')::date = d.day),
               'posts_member', (select count(*) from posts p
                                 where p.origin_kind = 'member' and (p.at at time zone 'Asia/Manila')::date = d.day),
               'posts_imported', (select count(*) from posts p
                                   where p.origin_kind = 'imported' and (p.at at time zone 'Asia/Manila')::date = d.day),
               'comments', (select count(*) from comments c where (c.at at time zone 'Asia/Manila')::date = d.day),
               'active_authors', (select count(distinct m.user_id) from member_acts m
                                   where (m.at at time zone 'Asia/Manila')::date = d.day),
               'reports', (select count(*) from reports_in r where (r.at at time zone 'Asia/Manila')::date = d.day),
               'admin_actions', (select count(*) from audit a where (a.at at time zone 'Asia/Manila')::date = d.day),
               'points_rewarded', (select coalesce(sum(l.amount), 0) from ledger l
                                    where l.related_type = 'community_reward'
                                      and (l.at at time zone 'Asia/Manila')::date = d.day),
               'points_reclaimed', (select coalesce(sum(l.amount), 0) from ledger l
                                     where l.related_type = 'community_reclaim'
                                       and (l.at at time zone 'Asia/Manila')::date = d.day)
             ) order by d.day)
        from days d
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.admin_community_is_audit_target(text) from public, anon, authenticated;
revoke all on function public.admin_community_members(text, boolean, text, text, integer, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_community_period_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_community_is_audit_target(text) to service_role;
grant execute on function public.admin_community_members(text, boolean, text, text, integer, integer, timestamptz, timestamptz) to service_role;
grant execute on function public.admin_community_period_stats(timestamptz, timestamptz) to service_role;
