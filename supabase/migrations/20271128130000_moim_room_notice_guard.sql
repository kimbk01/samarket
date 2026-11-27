-- 모임 4번 묶음 D1 — 모임 방에서는 메신저 방 공지(notice_text)를 쓰지 않는다: 공지는 모임 게시판 공지 하나 (설계 §2·P9 · 시안 U8)
-- 설계: docs/audit/moim-bundle4-design-2026-11-28.md (Owner 「구현 승인」 2026-11-28) · hard-lock docs/dibay-messenger-domain-group-hard-lock.md 갱신
-- 적용 전 운영 정의 백업: docs/audit/moim-bundle4-backup-definitions-2026-11-28.sql (md5 9135d8ad4aa5a9ffb95bda25f34736e7)
-- 바꾼 것: 막는 칸에 notice_text · notice_updated_at · notice_updated_by · allow_admin_edit_notice 추가. 그 밖은 운영 정의 그대로.
-- 메시지 고정(pinned_message_id)은 hard-lock 승인 「메시지 고정은 그대로」라 막지 않는다. 다른 함수를 부르지 않는다(m2 시험 규칙).

create or replace function public.cm_moim_guard_rooms()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_writer boolean := coalesce(current_setting('dibay.moim_writer', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and (new.owner_domain is distinct from old.owner_domain or new.owner_ref_id is distinct from old.owner_ref_id) then
    raise exception 'moim_room_owner_immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.owner_domain is not null and not v_writer then
      raise exception 'moim_room_create_requires_moim' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.owner_domain is null or v_writer then
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id
     or new.deleted_at is distinct from old.deleted_at
     or new.room_type is distinct from old.room_type
     or new.visibility is distinct from old.visibility
     or new.join_policy is distinct from old.join_policy
     or new.is_discoverable is distinct from old.is_discoverable
     or new.invite_link_enabled is distinct from old.invite_link_enabled
     or new.invite_token is distinct from old.invite_token
     or new.allow_member_invite is distinct from old.allow_member_invite
     or new.allow_admin_invite is distinct from old.allow_admin_invite
     or new.allow_admin_kick is distinct from old.allow_admin_kick
     or new.title is distinct from old.title
     or new.avatar_url is distinct from old.avatar_url
     or new.member_limit is distinct from old.member_limit
     or new.identity_policy is distinct from old.identity_policy
     or new.notice_text is distinct from old.notice_text
     or new.notice_updated_at is distinct from old.notice_updated_at
     or new.notice_updated_by is distinct from old.notice_updated_by
     or new.allow_admin_edit_notice is distinct from old.allow_admin_edit_notice then
    raise exception 'moim_room_settings_managed_by_moim' using errcode = 'P0001';
  end if;
  return new;
end
$function$;
