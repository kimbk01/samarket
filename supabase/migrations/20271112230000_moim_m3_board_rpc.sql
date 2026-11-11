-- =============================================================================
-- M3 — 모임 게시판·글·댓글·공지 고정·운영진 메모·신고 접수 RPC
-- Owner 2026-11-12 「M3 진행」 · 설계 docs/design/moim/moim-design-v1-2026-11-12.md §6 P9 · P13(접수) · §5.2
-- 원칙은 M2 와 같다: 모임 테이블은 서버(service_role) RPC 만, 권한은 moim_actor_can / 게시판 write_min_role.
-- =============================================================================

begin;

/** 글을 볼 수 있는가 — 멤버면 전부, 비멤버는 public 글만 (모임이 active 이고 차단 아님) */
create or replace function public.moim_post_visible_to(p_post uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.moim_posts po
      join public.moims m on m.id = po.moim_id
     where po.id = p_post and po.status = 'active' and m.status in ('active', 'closed')
       and (po.visibility = 'public' or public.moim_actor_role(po.moim_id, p_viewer) is not null)
  );
$$;

/** P9 글쓰기 — 게시판 쓰기 역할 검사, 차단 모임 불가 */
create or replace function public.moim_post_create(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_role text := public.moim_actor_role(p_moim, p_actor);
  v_board record;
  v_title text := btrim(coalesce(p->>'title', ''));
  v_body text := btrim(coalesce(p->>'body', ''));
  v_vis text := coalesce(nullif(p->>'visibility', ''), 'members');
  v_id uuid;
  v_m record;
  v_word text;
  v_pol public.moim_policies;
begin
  select status, platform_state into v_m from public.moims where id = p_moim;
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if v_m.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if v_role is null then perform public.moim__fail('moim_not_member'); end if;
  select * into v_board from public.moim_boards where id = nullif(p->>'board_id', '')::uuid and moim_id = p_moim and is_active;
  if not found then perform public.moim__fail('moim_board_not_found'); end if;
  if public.moim__role_rank(v_role) < public.moim__role_rank(v_board.write_min_role) then perform public.moim__fail('moim_forbidden'); end if;
  if v_vis not in ('members', 'public') then perform public.moim__fail('moim_visibility_invalid'); end if;
  if v_body = '' then perform public.moim__fail('moim_post_body_required'); end if;
  if char_length(v_title) > 120 or char_length(v_body) > 10000 then perform public.moim__fail('moim_post_too_long'); end if;
  if jsonb_typeof(coalesce(p->'images', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'images', '[]'::jsonb)) > 10 then
    perform public.moim__fail('moim_post_images_invalid');
  end if;
  select * into v_pol from public.moim_policies where id = 1;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_title)) > 0 or position(lower(v_word) in lower(v_body)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  insert into public.moim_posts (moim_id, board_id, author_id, title, body, images, visibility)
  values (p_moim, v_board.id, p_actor, v_title, v_body, coalesce(p->'images', '[]'::jsonb), v_vis)
  returning id into v_id;
  update public.moims set last_activity_at = now() where id = p_moim;
  perform public.moim__log(p_moim, p_actor, 'user', 'post_created', v_id, jsonb_build_object('board_kind', v_board.kind));
  return jsonb_build_object('ok', true, 'post_id', v_id, 'board_kind', v_board.kind);
end
$$;

/** 글 수정 — 작성자만 (게시판 이동 불가) */
create or replace function public.moim_post_update(p_actor uuid, p_post uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_po record;
  v_title text;
  v_body text;
  v_vis text;
begin
  select * into v_po from public.moim_posts where id = p_post for update;
  if not found or v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_po.author_id <> p_actor or public.moim_actor_role(v_po.moim_id, p_actor) is null then perform public.moim__fail('moim_forbidden'); end if;
  if (select platform_state from public.moims where id = v_po.moim_id) = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  v_title := case when p ? 'title' then btrim(coalesce(p->>'title', '')) else v_po.title end;
  v_body := case when p ? 'body' then btrim(coalesce(p->>'body', '')) else v_po.body end;
  v_vis := case when p ? 'visibility' then p->>'visibility' else v_po.visibility end;
  if v_body = '' then perform public.moim__fail('moim_post_body_required'); end if;
  if char_length(v_title) > 120 or char_length(v_body) > 10000 then perform public.moim__fail('moim_post_too_long'); end if;
  if v_vis not in ('members', 'public') then perform public.moim__fail('moim_visibility_invalid'); end if;
  update public.moim_posts set title = v_title, body = v_body, visibility = v_vis,
    images = case when p ? 'images' then coalesce(p->'images', '[]'::jsonb) else images end, updated_at = now()
  where id = p_post;
  return jsonb_build_object('ok', true);
end
$$;

/** 글 삭제(작성자) · 숨김(운영진 hide_post) */
create or replace function public.moim_post_remove(p_actor uuid, p_post uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_po record;
begin
  select * into v_po from public.moim_posts where id = p_post for update;
  if not found or v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_po.author_id = p_actor then
    update public.moim_posts set status = 'deleted', is_pinned = false, updated_at = now() where id = p_post;
    perform public.moim__log(v_po.moim_id, p_actor, 'user', 'post_deleted', p_post, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'result', 'deleted');
  end if;
  if not public.moim_actor_can(v_po.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_posts set status = 'hidden', is_pinned = false, hidden_by = p_actor, hidden_reason = left(p_reason, 500), updated_at = now() where id = p_post;
  perform public.moim__log(v_po.moim_id, p_actor, 'user', 'post_hidden', p_post, jsonb_build_object('reason', left(p_reason, 500)));
  return jsonb_build_object('ok', true, 'result', 'hidden', 'author_id', v_po.author_id);
end
$$;

/** 공지 고정 — pin_notice, 공지 게시판 글만, 상한 policy.max_pinned_notices */
create or replace function public.moim_post_pin(p_actor uuid, p_post uuid, p_pinned boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_po record;
  v_kind text;
  v_max int;
begin
  select * into v_po from public.moim_posts where id = p_post for update;
  if not found or v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  if not public.moim_actor_can(v_po.moim_id, p_actor, 'pin_notice') then perform public.moim__fail('moim_forbidden'); end if;
  select kind into v_kind from public.moim_boards where id = v_po.board_id;
  if v_kind <> 'notice' then perform public.moim__fail('moim_pin_notice_only'); end if;
  if p_pinned and not v_po.is_pinned then
    select max_pinned_notices into v_max from public.moim_policies where id = 1;
    if v_max is not null and (select count(*) from public.moim_posts where moim_id = v_po.moim_id and is_pinned and status = 'active') >= v_max then
      perform public.moim__fail('moim_pin_limit');
    end if;
  end if;
  update public.moim_posts set is_pinned = p_pinned, updated_at = now() where id = p_post;
  perform public.moim__log(v_po.moim_id, p_actor, 'user', case when p_pinned then 'post_pinned' else 'post_unpinned' end, p_post, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$$;

/** 댓글 — 멤버만 (public 글도 댓글은 멤버만) */
create or replace function public.moim_comment_create(p_actor uuid, p_post uuid, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_po record;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_word text;
  v_pol public.moim_policies;
begin
  select po.*, m.platform_state into v_po from public.moim_posts po join public.moims m on m.id = po.moim_id
   where po.id = p_post and m.status = 'active';
  if not found or v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_po.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if public.moim_actor_role(v_po.moim_id, p_actor) is null then perform public.moim__fail('moim_not_member'); end if;
  if v_body = '' or char_length(v_body) > 2000 then perform public.moim__fail('moim_comment_invalid'); end if;
  select * into v_pol from public.moim_policies where id = 1;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and position(lower(v_word) in lower(v_body)) > 0 then perform public.moim__fail('moim_banned_word'); end if;
  end loop;
  insert into public.moim_comments (post_id, moim_id, author_id, body) values (p_post, v_po.moim_id, p_actor, v_body) returning id into v_id;
  update public.moim_posts set comment_count = comment_count + 1 where id = p_post;
  update public.moims set last_activity_at = now() where id = v_po.moim_id;
  return jsonb_build_object('ok', true, 'comment_id', v_id, 'post_author_id', v_po.author_id, 'moim_id', v_po.moim_id);
end
$$;

/** 댓글 삭제(작성자) · 숨김(운영진) */
create or replace function public.moim_comment_remove(p_actor uuid, p_comment uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_c record;
begin
  select * into v_c from public.moim_comments where id = p_comment for update;
  if not found or v_c.status <> 'active' then perform public.moim__fail('moim_comment_not_found'); end if;
  if v_c.author_id <> p_actor and not public.moim_actor_can(v_c.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_comments set status = case when v_c.author_id = p_actor then 'deleted' else 'hidden' end, updated_at = now() where id = p_comment;
  update public.moim_posts set comment_count = greatest(comment_count - 1, 0) where id = v_c.post_id;
  return jsonb_build_object('ok', true);
end
$$;

/** 사용자 게시판 추가·이름 변경·사용 중지 — manage_boards */
create or replace function public.moim_board_upsert(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'board_id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_role text := coalesce(nullif(p->>'write_min_role', ''), 'member');
  v_max int;
  v_kind text;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'manage_boards') then perform public.moim__fail('moim_forbidden'); end if;
  if v_role not in ('host', 'co_host', 'staff', 'member') then perform public.moim__fail('moim_role_invalid'); end if;
  if v_id is null then
    if v_name = '' or char_length(v_name) > 30 then perform public.moim__fail('moim_board_name_invalid'); end if;
    select max_custom_boards into v_max from public.moim_policies where id = 1;
    if v_max is not null and (select count(*) from public.moim_boards where moim_id = p_moim and kind = 'custom' and is_active) >= v_max then
      perform public.moim__fail('moim_board_limit');
    end if;
    insert into public.moim_boards (moim_id, kind, name, write_min_role, sort_order)
    values (p_moim, 'custom', v_name, v_role, coalesce((select max(sort_order) from public.moim_boards where moim_id = p_moim), 0) + 1)
    returning id into v_id;
  else
    select kind into v_kind from public.moim_boards where id = v_id and moim_id = p_moim;
    if v_kind is null then perform public.moim__fail('moim_board_not_found'); end if;
    if v_kind <> 'custom' and (p ? 'name' or p ? 'is_active') then perform public.moim__fail('moim_board_system_fixed'); end if;
    if p ? 'name' and (v_name = '' or char_length(v_name) > 30) then perform public.moim__fail('moim_board_name_invalid'); end if;
    update public.moim_boards set
      name = case when p ? 'name' then v_name else name end,
      write_min_role = case when p ? 'write_min_role' and v_kind <> 'notice' then v_role else write_min_role end,
      is_active = case when p ? 'is_active' then (p->>'is_active')::boolean else is_active end
    where id = v_id;
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'board_saved', v_id, p);
  return jsonb_build_object('ok', true, 'board_id', v_id);
end
$$;

/** 운영진 메모 — write_note */
create or replace function public.moim_member_note_set(p_actor uuid, p_moim uuid, p_target uuid, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'write_note') then perform public.moim__fail('moim_forbidden'); end if;
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_target) then perform public.moim__fail('moim_target_not_member'); end if;
  if btrim(coalesce(p_body, '')) = '' then
    delete from public.moim_member_notes where moim_id = p_moim and target_user_id = p_target;
    return jsonb_build_object('ok', true, 'deleted', true);
  end if;
  select id into v_id from public.moim_member_notes where moim_id = p_moim and target_user_id = p_target order by created_at limit 1;
  if v_id is null then
    insert into public.moim_member_notes (moim_id, target_user_id, author_user_id, body) values (p_moim, p_target, p_actor, left(btrim(p_body), 1000)) returning id into v_id;
  else
    update public.moim_member_notes set body = left(btrim(p_body), 1000), author_user_id = p_actor, updated_at = now() where id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'note_id', v_id);
end
$$;

/** P13 신고 접수 — 대상이 그 모임에 속하는지 확인, 처리 전 같은 대상 중복 신고 불가 */
create or replace function public.moim_report_create(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_type text := p->>'target_type';
  v_target uuid := nullif(p->>'target_id', '')::uuid;
  v_reason text := btrim(coalesce(p->>'reason_code', ''));
  v_ok boolean;
  v_id uuid;
begin
  if not exists (select 1 from public.moims where id = p_moim and status in ('active', 'closed')) then perform public.moim__fail('moim_not_found'); end if;
  if v_type not in ('moim', 'member', 'post', 'comment', 'schedule', 'album', 'chat_message') or v_target is null then
    perform public.moim__fail('moim_report_target_invalid');
  end if;
  if v_reason !~ '^[a-z_]{2,40}$' then perform public.moim__fail('moim_report_reason_invalid'); end if;
  v_ok := case v_type
    when 'moim' then v_target = p_moim
    when 'member' then exists (select 1 from public.moim_members where moim_id = p_moim and user_id = v_target)
    when 'post' then exists (select 1 from public.moim_posts where moim_id = p_moim and id = v_target)
    when 'comment' then exists (select 1 from public.moim_comments where moim_id = p_moim and id = v_target)
    when 'schedule' then exists (select 1 from public.moim_schedules where moim_id = p_moim and id = v_target)
    when 'album' then exists (select 1 from public.moim_album_items where moim_id = p_moim and id = v_target)
    when 'chat_message' then exists (
      select 1 from public.community_messenger_messages msg
        join public.community_messenger_rooms r on r.id = msg.room_id
       where msg.id = v_target and r.owner_domain = 'moim'
         and (r.owner_ref_id = p_moim or r.owner_ref_id in (select id from public.moim_schedules where moim_id = p_moim)))
  end;
  if not coalesce(v_ok, false) then perform public.moim__fail('moim_report_target_invalid'); end if;
  if v_type = 'member' and v_target = p_actor then perform public.moim__fail('moim_cannot_target_self'); end if;
  if exists (select 1 from public.moim_reports where reporter_id = p_actor and target_type = v_type and target_id = v_target and status in ('received', 'reviewing')) then
    perform public.moim__fail('moim_report_duplicate');
  end if;
  insert into public.moim_reports (reporter_id, moim_id, target_type, target_id, reason_code, detail)
  values (p_actor, p_moim, v_type, v_target, v_reason, left(nullif(btrim(coalesce(p->>'detail', '')), ''), 1000))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'report_id', v_id);
end
$$;

-- 실행 권한: service_role 만 (M2 와 같은 규칙)
do $grant$
declare f record;
begin
  for f in
    select p.oid::regprocedure sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('moim_post_visible_to', 'moim_post_create', 'moim_post_update', 'moim_post_remove', 'moim_post_pin',
                         'moim_comment_create', 'moim_comment_remove', 'moim_board_upsert', 'moim_member_note_set', 'moim_report_create')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$grant$;

commit;
