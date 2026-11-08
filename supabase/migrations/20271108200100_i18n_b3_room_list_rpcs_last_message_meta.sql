-- 언어 SSOT B3-b 범위 정정 (Owner 「허용했다, 진행」 2026-11-08) — docs/audit/i18n-b3-stored-preview-design-2026-11-08.md §6
-- 메신저 목록 RPC 가 방 `last_message_meta` 를 함께 돌려준다. 반환값에 키·열을 **추가만** 한다(구 앱·구 서버 코드는 무시).
-- 1) community_messenger_bootstrap_lite_my_rooms_bundle (jsonb) — 방 객체에 last_message_meta (대화 지움 이전이면 null, last_message 와 같은 규칙)
-- 2) get_cm_bootstrap_full_snapshot (jsonb) — latest_messages 에 last_message_meta (rooms 는 1) 을 그대로 씀)
-- 3) community_messenger_bootstrap_rooms 는 RETURNS TABLE 이라 열 추가 = DROP 필요 → 기존 함수는 두고 _v2 를 새로 만든다.
-- 각 함수 본문은 바꿀 문장이 정확히 있을 때만 교체(없으면 중단), 다른 부분 변경 0.

do $$
declare
  v_def text;
  v_old_a text := E'        else r.last_message_type\n      end as last_message_type,\n';
  v_new_a text := E'        else r.last_message_type\n      end as last_message_type,\n      case\n        when p.cleared_at is not null and (r.last_message_at is null or r.last_message_at <= p.cleared_at) then null\n        else r.last_message_meta\n      end as last_message_meta,\n';
  v_old_b text := E'          ''last_message_type'', c.last_message_type\n        )';
  v_new_b text := E'          ''last_message_type'', c.last_message_type,\n          ''last_message_meta'', c.last_message_meta\n        )';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'community_messenger_bootstrap_lite_my_rooms_bundle';
  if v_def is null then raise exception 'lite bundle 없음'; end if;
  if position('last_message_meta' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_old_a, ''))) / length(v_old_a) <> 1 then raise exception 'lite bundle 문장 A 불일치'; end if;
  if (length(v_def) - length(replace(v_def, v_old_b, ''))) / length(v_old_b) <> 1 then raise exception 'lite bundle 문장 B 불일치'; end if;
  execute replace(replace(v_def, v_old_a, v_new_a), v_old_b, v_new_b);
end $$;

do $$
declare
  v_def text;
  v_old text := E'            ''last_message_type'', r->>''last_message_type''\n          )';
  v_new text := E'            ''last_message_type'', r->>''last_message_type'',\n            ''last_message_meta'', r->''last_message_meta''\n          )';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_cm_bootstrap_full_snapshot';
  if v_def is null then raise exception 'full snapshot 없음'; end if;
  if position('last_message_meta' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 2 then raise exception 'full snapshot 문장 불일치'; end if;
  execute replace(v_def, v_old, v_new);
end $$;

create or replace function public.community_messenger_bootstrap_rooms_v2(p_room_ids uuid[])
returns table(
  id uuid, chat_domain text, domain_identity_key text, room_type text, room_status text, is_readonly boolean,
  direct_key text, title text, summary text, avatar_url text, last_message text, last_message_at timestamp with time zone,
  last_message_type text, last_message_meta jsonb
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    r.id,
    r.chat_domain,
    r.domain_identity_key,
    r.room_type,
    r.room_status,
    r.is_readonly,
    r.direct_key,
    r.title,
    r.summary,
    r.avatar_url,
    r.last_message,
    r.last_message_at,
    r.last_message_type,
    r.last_message_meta
  from public.community_messenger_rooms r
  where r.id = any(coalesce(p_room_ids, '{}'::uuid[]))
  order by r.last_message_at desc nulls last;
$function$;

-- 기존 community_messenger_bootstrap_rooms 와 같은 권한(postgres·service_role 만)
revoke all on function public.community_messenger_bootstrap_rooms_v2(uuid[]) from public;
revoke all on function public.community_messenger_bootstrap_rooms_v2(uuid[]) from anon, authenticated;
grant execute on function public.community_messenger_bootstrap_rooms_v2(uuid[]) to service_role;
