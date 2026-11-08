-- 언어 SSOT B3-b (Owner 「권장대로 승인」 2026-11-08) — docs/audit/i18n-b3-stored-preview-design-2026-11-08.md
-- 방 목록 미리보기가 저장된 한국어 시스템 문장을 그대로 보이던 결함: 마지막 시스템 메시지의 종류 코드를 방에 둔다.
--
-- 설계 정정(구현 중 확인): 방 표는 Realtime publication 대상이라, 메시지 INSERT 트리거로 방을 따로 UPDATE 하면
-- 방 변경 이벤트가 1개 더 나간다. 그래서 **방 BEFORE UPDATE 트리거**로 작성처의 같은 UPDATE 안에서 채운다
-- (이벤트 수 변화 0). DB 작성 함수 3개는 모두 메시지 INSERT 후 방 UPDATE 순서라 방금 넣은 메시지가 보인다.
--
-- 값: {text: 저장 첫 줄, message_key, message_vars, kind, listingState} — 화면은 text 가 last_message 첫 줄과 같을 때만
-- 코드로 그리고, 다르면 저장 글자(잘못된 문구 표시 없음). 통화 기록(call_stub)·텍스트·이미지는 대상 아님(NULL).

alter table public.community_messenger_rooms add column if not exists last_message_meta jsonb null;

comment on column public.community_messenger_rooms.last_message_meta is
  '마지막 메시지가 시스템일 때만: {text, message_key, message_vars, kind, listingState}. 목록 미리보기를 보는 사람 언어로 다시 그리는 재료. 그 밖 NULL.';

create or replace function public.cm_room_last_system_meta_from_message(p_content text, p_metadata jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'text', btrim(split_part(replace(left(coalesce(p_content, ''), 200), E'\r', ''), E'\n', 1)),
    'message_key', p_metadata -> 'message_key',
    'message_vars', p_metadata -> 'message_vars',
    'kind', p_metadata -> 'kind',
    'listingState', p_metadata -> 'listingState'
  ));
$$;

create or replace function public.cm_rooms_fill_last_message_meta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_content text;
  v_metadata jsonb;
begin
  if coalesce(NEW.last_message_type, '') <> 'system' or coalesce(btrim(NEW.last_message), '') = '' then
    if NEW.last_message_meta is not null then
      NEW.last_message_meta := null;
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE'
     and NEW.last_message is not distinct from OLD.last_message
     and NEW.last_message_type is not distinct from OLD.last_message_type
     and NEW.last_message_at is not distinct from OLD.last_message_at
     and NEW.last_message_meta is not distinct from OLD.last_message_meta then
    return NEW;
  end if;

  select m.content, m.metadata
    into v_content, v_metadata
  from public.community_messenger_messages m
  where m.room_id = NEW.id
    and m.message_type = 'system'
    and m.deleted_at is null
  order by m.created_at desc nulls last, m.id desc
  limit 1;

  if v_content is null then
    NEW.last_message_meta := null;
  else
    NEW.last_message_meta := public.cm_room_last_system_meta_from_message(v_content, coalesce(v_metadata, '{}'::jsonb));
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_cm_rooms_fill_last_message_meta on public.community_messenger_rooms;
create trigger trg_cm_rooms_fill_last_message_meta
  before insert or update of last_message, last_message_type, last_message_at
  on public.community_messenger_rooms
  for each row
  execute function public.cm_rooms_fill_last_message_meta();
