-- 모임 4번 묶음 적용 전 운영 정의 백업 (2026-11-28) · 운영 md5 9135d8ad4aa5a9ffb95bda25f34736e7 = 아래 정의
-- 롤백: 이 정의를 그대로 실행.
CREATE OR REPLACE FUNCTION public.cm_moim_guard_rooms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     or new.identity_policy is distinct from old.identity_policy then
    raise exception 'moim_room_settings_managed_by_moim' using errcode = 'P0001';
  end if;
  return new;
end
$function$

;
