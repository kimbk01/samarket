-- 채팅 영상 보내기 S1 (Owner 2026-11-24 설계 승인 · docs/audit/messenger-video-send-audit-design-2026-11-24.md §3-3·§4)
-- 바꾸는 것 3가지: ① message_type·last_message_type CHECK 에 'video' 추가 ② dibay_append_room_message_atomic 의
-- 방 미리보기 CASE 에 'video' → '동영상' 1줄 추가 ③ 고아 영상 GC 후보 함수(신규, service_role 만).
-- 운영 확인(2026-11-24 읽기 전용): 이 CHECK 두 개가 전부이고, 메시지 종류로 미리보기를 정하는 DB 함수는 ②뿐이다.
-- 비파괴: 허용 값·분기 추가만. 롤백 = 'video' 를 뺀 CHECK 재생성(그 전에 video 행이 없어야 함) · ②는 그 1줄 제거 · ③ drop.

alter table public.community_messenger_messages
  drop constraint if exists community_messenger_messages_message_type_check;

alter table public.community_messenger_messages
  add constraint community_messenger_messages_message_type_check
  check (message_type in (
    'text', 'image', 'file', 'system', 'call_stub', 'voice', 'sticker',
    'community_post_share', 'gift_certificate', 'video'
  ));

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_last_message_type_check;

alter table public.community_messenger_rooms
  add constraint community_messenger_rooms_last_message_type_check
  check (last_message_type in (
    'text', 'image', 'file', 'system', 'call_stub', 'voice', 'sticker',
    'community_post_share', 'gift_certificate', 'video'
  ));

-- 방 목록 미리보기(rooms.last_message): 지금 함수는 image='사진', file=파일명, 그 외=content 를 넣는다.
-- video 를 그대로 두면 저장 URL 이 미리보기로 들어가므로 'video' → '동영상' 한 줄만 추가한다.
-- 운영 현재 정의(2026-11-24 조회, md5 e9cff8dc0c46d5df47122282bf709f67)를 읽어 그 한 줄만 바꿔 다시 만든다
-- (함수 본문 전체를 손으로 옮겨 적지 않음 — 다른 부분이 달라지지 않게).
do $$
declare
  v_sig regprocedure := 'public.dibay_append_room_message_atomic(text,uuid,text,text,uuid,text,text,text,jsonb,timestamp with time zone,boolean,text,boolean)'::regprocedure;
  v_def text;
  v_needle text := E'WHEN ''image'' THEN ''사진''\n';
  v_new text;
begin
  v_def := pg_get_functiondef(v_sig);
  if position(E'WHEN ''video'' THEN' in v_def) > 0 then
    raise notice 'dibay_append_room_message_atomic: video preview already present';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle) <> 1 then
    raise exception 'dibay_append_room_message_atomic: image preview line not found exactly once — 정의가 바뀌었으니 중단';
  end if;
  v_new := replace(v_def, v_needle, v_needle || E'    WHEN ''video'' THEN ''동영상''\n');
  execute v_new;
end
$$;

-- 고아 영상 GC 후보(설계 §3-5) — 업로드 후 메시지가 생기지 않은 영상·썸네일(앱 종료·네트워크 단절·취소 정리 실패).
-- 대상: messenger-media 버킷 `{uid}/community/messenger-video/{room}/{uuid}.(mp4|mov|thumb.jpg)` 중 p_min_age 경과 ·
--       어떤 메시지의 metadata.storage_paths 에도 없음. 메시지가 가리키는 파일은 절대 대상이 아니다.
-- 호출: 일일 cron `messenger-video-orphan-gc` (service_role 만).
create or replace function public.messenger_video_orphan_candidates(
  p_min_age interval,
  p_limit integer
)
returns table (name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, storage
as $fn$
  select so.name, so.created_at
  from storage.objects so
  where so.bucket_id = 'messenger-media'
    and so.name ~ '^[0-9a-f-]{36}/community/messenger-video/[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|mov|thumb\.jpg)$'
    and so.created_at <= now() - p_min_age
    and not exists (
      select 1
      from public.community_messenger_messages m
      where m.message_type = 'video'
        and m.metadata -> 'storage_paths' ? so.name
    )
  order by so.created_at
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$fn$;

revoke all on function public.messenger_video_orphan_candidates(interval, integer) from public, anon, authenticated;
grant execute on function public.messenger_video_orphan_candidates(interval, integer) to service_role;
