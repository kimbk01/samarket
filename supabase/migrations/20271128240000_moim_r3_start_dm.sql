-- 모임 R3 Q2 (Owner 「Q1·Q2 권장안으로 진행」 2026-11-28) — 설계 docs/audit/moim-r3-screens-design-2026-11-28.md §5 Q2
-- 계약 P11 「모임장은 「운영진만 1:1 가능」으로 제한할 수 있다」 = 권한 start_dm(모임 화면의 [대화하기]) · 기본 멤버 · 조정 가능 · 상한 운영진
create or replace function public.moim_permission_defaults()
 returns table(action text, default_min_role text, adjustable boolean, floor_role text)
 language sql
 immutable
 set search_path to 'public'
as $function$
  values
    ('edit_info',          'host',    false, 'host'),
    ('decide_join',        'staff',   true,  'staff'),
    ('manage_invite_link', 'staff',   true,  'staff'),
    ('send_invite',        'member',  true,  'member'),
    ('pin_notice',         'staff',   true,  'staff'),
    ('manage_boards',      'co_host', false, 'co_host'),
    ('hide_post',          'staff',   false, 'staff'),
    ('create_schedule',    'member',  true,  'member'),
    ('remove_member',      'co_host', false, 'co_host'),
    ('ban_member',         'co_host', false, 'co_host'),
    ('write_note',         'staff',   true,  'staff'),
    ('set_role',           'host',    false, 'host'),
    ('transfer_host',      'host',    false, 'host'),
    ('close',              'host',    false, 'host'),
    ('start_dm',           'member',  true,  'member');
$function$;

create or replace function public.moim_permission_ceiling(p_action text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case p_action
    when 'decide_join' then 'co_host'
    when 'manage_invite_link' then 'co_host'
    when 'pin_notice' then 'co_host'
    when 'send_invite' then 'staff'
    when 'create_schedule' then 'staff'
    when 'write_note' then 'host'
    when 'start_dm' then 'staff'
    else null end;
$function$;
