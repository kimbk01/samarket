-- 언어 SSOT B3-b 정정 (2026-11-08) — 트리거가 「가장 최근 시스템 메시지」를 고르면, 방이 보여 주는 문장(예: 나중에 다시 쓴
-- 「📋 주문 요약」)과 다른 메시지의 코드를 담는다(채우기 394 중 219 불일치 — 화면은 일치 검사로 저장 글자를 썼음).
-- 정정: 방 저장 문장 첫 줄과 **같은 첫 줄**의 시스템 메시지를 최근 20개 안에서 고른다. 없으면 NULL(저장 글자).

create or replace function public.cm_rooms_fill_last_message_meta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_first text;
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

  v_first := btrim(split_part(replace(left(NEW.last_message, 200), E'\r', ''), E'\n', 1));

  select x.content, x.metadata
    into v_content, v_metadata
  from (
    select m.content, m.metadata, m.created_at, m.id
    from public.community_messenger_messages m
    where m.room_id = NEW.id
      and m.message_type = 'system'
      and m.deleted_at is null
    order by m.created_at desc nulls last, m.id desc
    limit 20
  ) x
  where btrim(split_part(replace(left(coalesce(x.content, ''), 200), E'\r', ''), E'\n', 1)) = v_first
  order by x.created_at desc nulls last, x.id desc
  limit 1;

  if v_content is null then
    NEW.last_message_meta := null;
  else
    NEW.last_message_meta := public.cm_room_last_system_meta_from_message(v_content, coalesce(v_metadata, '{}'::jsonb));
  end if;
  return NEW;
end;
$$;
