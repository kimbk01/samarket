\set ON_ERROR_STOP off
insert into public.profiles (id, nickname, phone_verified) values
  ('00000000-0000-0000-0000-0000000000b1', 'c1', true),
  ('00000000-0000-0000-0000-0000000000b2', 'c2', true);
create table public._t3 (n serial, k text, v text);
grant all on public._t3, public._t3_n_seq to service_role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
do $s$
declare
  u1 uuid := '00000000-0000-0000-0000-0000000000a1';
  c1 uuid := '00000000-0000-0000-0000-0000000000b1';
  c2 uuid := '00000000-0000-0000-0000-0000000000b2';
  cat uuid := (select id from public.moim_categories where slug = 'sports');
  r jsonb; mid uuid; room uuid; req uuid; inv jsonb;
begin
  -- 대표 사진 → 방 사진 (개설 시)
  r := public.moim_create(u1, jsonb_build_object('name','승인제 시험','category_id',cat,'join_mode','approval','cover_image_url','https://img/c.jpg'));
  mid := (r->>'moim_id')::uuid; room := (r->>'room_id')::uuid;
  insert into _t3(k,v) select 'cover_to_room', coalesce(avatar_url, 'null') from community_messenger_rooms where id = room;

  -- 신청 취소 → cancelled, 다시 신청·승인 → 재가입 아님(0)
  perform public.moim_join(c1, mid, '{}'::jsonb);
  perform public.moim_join_cancel(c1, mid);
  insert into _t3(k,v) select 'cancel_status', status || ' left_at=' || coalesce(left_at::text, 'null') from moim_members where moim_id = mid and user_id = c1;
  r := public.moim_join(c1, mid, '{}'::jsonb); req := (r->>'request_id')::uuid;
  perform public.moim_join_decide(u1, req, true, null);
  insert into _t3(k,v) select 'first_join_after_cancel_rejoin', rejoin_count::text from moim_members where moim_id = mid and user_id = c1;

  -- 예전 멤버가 탈퇴 후 다시 신청·승인 → 재가입 1
  perform public.moim_leave(c1, mid);
  r := public.moim_join(c1, mid, '{}'::jsonb); req := (r->>'request_id')::uuid;
  perform public.moim_join_decide(u1, req, true, null);
  insert into _t3(k,v) select 'former_member_rejoin', rejoin_count::text from moim_members where moim_id = mid and user_id = c1;

  -- 거절당한 사람이 다시 신청·승인 → 재가입 아님
  r := public.moim_join(c2, mid, '{}'::jsonb); req := (r->>'request_id')::uuid;
  perform public.moim_join_decide(u1, req, false, 'no');
  r := public.moim_join(c2, mid, '{}'::jsonb); req := (r->>'request_id')::uuid;
  perform public.moim_join_decide(u1, req, true, null);
  insert into _t3(k,v) select 'rejected_then_join_rejoin', rejoin_count::text from moim_members where moim_id = mid and user_id = c2;

  -- 링크 조회는 사용 횟수 0, 링크로 가입 신청 시 1
  inv := public.moim_invite_link_create(u1, mid, null);
  perform public.moim_invite_link_resolve(inv->>'token');
  perform public.moim_invite_link_resolve(inv->>'token');
  insert into _t3(k,v) select 'usage_after_resolve', usage_count::text from moim_invites where id = (inv->>'invite_id')::uuid;
  perform public.moim_leave(c2, mid);
  perform public.moim_join(c2, mid, jsonb_build_object('invite_token', inv->>'token'));
  insert into _t3(k,v) select 'usage_after_join', usage_count::text from moim_invites where id = (inv->>'invite_id')::uuid;
end
$s$;
reset role;
select n, k, v from public._t3 order by n;
