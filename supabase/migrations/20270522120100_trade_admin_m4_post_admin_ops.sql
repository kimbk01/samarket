-- 거래 Admin M4 (D-09·D-10·D-16·D-18·D-26, 설계 v2 §F-1-3·§F-1-4·§G-0-2):
-- 관리자 게시물 조치 = DB 함수 1번 = 트랜잭션 1개 (상태 변경 + 감사 기록). 감사 기록이 실패하면 조치도 롤백.
-- - admin_trade_post_moderate: 숨김 · 숨김 해제 · 삭제(소프트) · 삭제 취소 · 원인 미확인 숨김을 관리자 숨김으로 확정
-- - admin_trade_post_edit:    내용 수정 (updated_at CAS) + 수정 전 값을 trade_post_revisions 에 보존
-- 판매 단계(seller_listing_state·구매자)는 여기서 바꾸지 않는다.

create table if not exists public.trade_post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  editor_id uuid not null,
  before_json jsonb not null,
  after_json jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_trade_post_revisions_post on public.trade_post_revisions (post_id, created_at desc);
alter table public.trade_post_revisions enable row level security;
revoke all on public.trade_post_revisions from anon, authenticated;

create or replace function public.admin_trade_post_moderate(
  p_post_id uuid,
  p_actor_id uuid,
  p_action text,              -- hide | unhide | delete | undelete | confirm_admin_hidden
  p_reason text,
  p_expected_updated_at timestamptz default null,
  p_ip text default null,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_next text;
  v_after record;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_actor_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select id, status, seller_listing_state, moderation_state, owner_state, updated_at
    into v_row
    from public.posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_expected_updated_at is not null and v_row.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'error', 'stale_state', 'moderation_state', v_row.moderation_state);
  end if;

  v_next := case p_action
    when 'hide' then case when v_row.moderation_state = 'visible' then 'admin_hidden' end
    when 'unhide' then case when v_row.moderation_state = 'admin_hidden' then 'visible' end
    when 'delete' then case when v_row.moderation_state in ('visible', 'admin_hidden', 'legacy_hidden') then 'admin_deleted' end
    when 'undelete' then case when v_row.moderation_state = 'admin_deleted' then 'admin_hidden' end
    when 'confirm_admin_hidden' then case when v_row.moderation_state = 'legacy_hidden' then 'admin_hidden' end
    else 'invalid'
  end;
  if v_next = 'invalid' then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;
  if v_next is null then
    return jsonb_build_object('ok', false, 'error', 'stale_state', 'moderation_state', v_row.moderation_state);
  end if;

  update public.posts
     set moderation_state = v_next,
         moderation_reason = left(trim(p_reason), 1000),
         moderation_by = p_actor_id,
         updated_at = now()
   where id = p_post_id
  returning status, seller_listing_state, moderation_state, owner_state, updated_at into v_after;

  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, user_agent)
  values (
    'admin', p_actor_id, 'trade_post', p_post_id::text, 'trade_post.' || p_action,
    jsonb_build_object('status', v_row.status, 'seller_listing_state', v_row.seller_listing_state,
                       'moderation_state', v_row.moderation_state, 'owner_state', v_row.owner_state),
    jsonb_build_object('status', v_after.status, 'seller_listing_state', v_after.seller_listing_state,
                       'moderation_state', v_after.moderation_state, 'owner_state', v_after.owner_state,
                       'reason', left(trim(p_reason), 1000)),
    left(p_ip, 80), left(p_user_agent, 500)
  );

  return jsonb_build_object('ok', true, 'status', v_after.status, 'moderation_state', v_after.moderation_state,
                            'owner_state', v_after.owner_state, 'updated_at', v_after.updated_at);
end;
$$;

-- 관리자 내용 수정. p_patch 키: title, content, price, trade_category_id, images(text[] JSON 배열), thumbnail_url, is_price_offer, is_free_share
create or replace function public.admin_trade_post_edit(
  p_post_id uuid,
  p_actor_id uuid,
  p_patch jsonb,
  p_reason text,
  p_expected_updated_at timestamptz,
  p_ip text default null,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.posts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_images text[];
  v_upd timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch');
  end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k
              where k not in ('title', 'content', 'price', 'trade_category_id', 'images', 'thumbnail_url',
                              'is_price_offer', 'is_free_share')) then
    return jsonb_build_object('ok', false, 'error', 'invalid_field');
  end if;

  select * into v_row from public.posts where id = p_post_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_expected_updated_at is null or v_row.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'error', 'stale_state');
  end if;

  if p_patch ? 'title' and coalesce(length(trim(p_patch->>'title')), 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'title_required');
  end if;
  if p_patch ? 'trade_category_id' and not exists (
    select 1 from public.categories where id = (p_patch->>'trade_category_id')::uuid and type = 'trade'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_category');
  end if;
  if p_patch ? 'images' then
    if jsonb_typeof(p_patch->'images') <> 'array' then
      return jsonb_build_object('ok', false, 'error', 'invalid_images');
    end if;
    select coalesce(array_agg(value), '{}') into v_images from jsonb_array_elements_text(p_patch->'images');
  end if;

  v_before := jsonb_build_object(
    'title', v_row.title, 'content', v_row.content, 'price', v_row.price,
    'trade_category_id', v_row.trade_category_id, 'images', to_jsonb(v_row.images),
    'thumbnail_url', v_row.thumbnail_url, 'is_price_offer', v_row.is_price_offer, 'is_free_share', v_row.is_free_share);

  update public.posts set
    title = case when p_patch ? 'title' then left(trim(p_patch->>'title'), 200) else title end,
    content = case when p_patch ? 'content' then coalesce(p_patch->>'content', '') else content end,
    price = case when p_patch ? 'price' then nullif(p_patch->>'price', '')::numeric else price end,
    trade_category_id = case when p_patch ? 'trade_category_id' then (p_patch->>'trade_category_id')::uuid else trade_category_id end,
    images = case when p_patch ? 'images' then v_images else images end,
    thumbnail_url = case
      when p_patch ? 'thumbnail_url' then nullif(p_patch->>'thumbnail_url', '')
      when p_patch ? 'images' then v_images[1]
      else thumbnail_url end,
    is_price_offer = case when p_patch ? 'is_price_offer' then (p_patch->>'is_price_offer')::boolean else is_price_offer end,
    is_free_share = case when p_patch ? 'is_free_share' then (p_patch->>'is_free_share')::boolean else is_free_share end,
    updated_at = now()
  where id = p_post_id
  returning updated_at into v_upd;

  select jsonb_build_object(
    'title', title, 'content', content, 'price', price, 'trade_category_id', trade_category_id,
    'images', to_jsonb(images), 'thumbnail_url', thumbnail_url, 'is_price_offer', is_price_offer,
    'is_free_share', is_free_share)
    into v_after from public.posts where id = p_post_id;

  insert into public.trade_post_revisions (post_id, editor_id, before_json, after_json, reason)
  values (p_post_id, p_actor_id, v_before, v_after, left(trim(p_reason), 1000));

  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, user_agent)
  values ('admin', p_actor_id, 'trade_post', p_post_id::text, 'trade_post.edit', v_before,
          v_after || jsonb_build_object('reason', left(trim(p_reason), 1000)), left(p_ip, 80), left(p_user_agent, 500));

  return jsonb_build_object('ok', true, 'updated_at', v_upd);
end;
$$;

revoke all on function public.admin_trade_post_moderate(uuid, uuid, text, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.admin_trade_post_edit(uuid, uuid, jsonb, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.admin_trade_post_moderate(uuid, uuid, text, text, timestamptz, text, text) to service_role;
grant execute on function public.admin_trade_post_edit(uuid, uuid, jsonb, text, timestamptz, text, text) to service_role;
