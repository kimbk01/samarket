-- 거래 Admin M9 — 원인 미확인 숨김(legacy_hidden) 상태 제거 (Owner 지시, 개발 단계 정리).
-- 운영 20건은 관리자 숨김(admin_hidden)으로 확정 완료(감사 기록 남김) → legacy_hidden 0건 확인 후 상태 자체를 없앤다.
-- moderation_state = visible · admin_hidden · admin_deleted

do $$
begin
  if exists (select 1 from public.posts where moderation_state = 'legacy_hidden') then
    raise exception 'trade_admin_m9: legacy_hidden 글이 남아 있습니다 — 먼저 관리자 숨김으로 확정하세요';
  end if;
end $$;

alter table public.posts drop constraint if exists posts_moderation_state_check;
alter table public.posts add constraint posts_moderation_state_check
  check (moderation_state in ('visible', 'admin_hidden', 'admin_deleted'));

comment on column public.posts.moderation_state is '관리자 노출: visible | admin_hidden | admin_deleted';

-- 노출 게이트: legacy_hidden 분기 제거 (나머지 규칙 동일)
create or replace function public.posts_visibility_gate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_visible boolean;
  v_was_visible boolean;
begin
  v_visible := new.moderation_state = 'visible' and new.owner_state = 'none';

  -- 노출 원인 없이 status='hidden' 을 직접 쓰는 옛 경로는 거부한다 (조용히 섞이지 않게).
  if v_visible and new.status = 'hidden'
     and (tg_op = 'INSERT' or old.status is distinct from 'hidden') then
    raise exception 'posts_status_hidden_requires_visibility_state' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    v_was_visible := old.moderation_state = 'visible' and old.owner_state = 'none';

    -- 판매 값을 status 로만 바꾼 경로: 판매 단계도 같이 맞춘다 (숨김 중이어도 판매 단계는 저장).
    if new.status is distinct from old.status
       and new.status in ('active', 'reserved', 'sold')
       and new.seller_listing_state is not distinct from old.seller_listing_state then
      new.seller_listing_state := case new.status
        when 'sold' then 'completed'
        when 'reserved' then 'reserved'
        else case when old.seller_listing_state in ('reserved', 'completed') then 'inquiry'
                  else old.seller_listing_state end
      end;
    end if;

    if not v_visible then
      new.status := 'hidden';
    elsif not v_was_visible then
      -- 숨김 → 노출: 보존된 판매 단계에서 다시 계산 (판매완료는 판매완료, 예약은 예약)
      new.status := case new.seller_listing_state
        when 'completed' then 'sold'
        when 'reserved' then 'reserved'
        else 'active'
      end;
    end if;

    if new.moderation_state is distinct from old.moderation_state then
      new.moderation_at := now();
    end if;
    if new.owner_state is distinct from old.owner_state then
      new.owner_state_at := now();
    end if;
  else
    if not v_visible then
      new.status := 'hidden';
    end if;
  end if;

  return new;
end;
$$;

-- 관리자 노출 조치: confirm_admin_hidden 제거, 삭제 대상에서 legacy_hidden 제거 (나머지 동일)
create or replace function public.admin_trade_post_moderate(
  p_post_id uuid,
  p_actor_id uuid,
  p_action text,              -- hide | unhide | delete | undelete
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
    when 'delete' then case when v_row.moderation_state in ('visible', 'admin_hidden') then 'admin_deleted' end
    when 'undelete' then case when v_row.moderation_state = 'admin_deleted' then 'admin_hidden' end
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
