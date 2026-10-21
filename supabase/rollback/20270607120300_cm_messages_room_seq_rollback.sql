-- 롤백: 20270607120300_cm_messages_room_seq (W5) — 완전 원복.
-- **트리거 제거와 after RPC 원본(md5 1936cf18…) 복원을 반드시 한 TX 로** — 트리거만 제거하면 이후 신규 행(seq NULL)이
--   seq 앵커 따라잡기에서 누락된다(로컬 검증 2026-10-22). 원본 복원 후에는 모든 행이 (created_at, id) keyset 으로 일관.
-- room_seq 컬럼 값은 남아도 무해(원본 함수는 읽지 않음).
BEGIN;
DROP TRIGGER IF EXISTS cm_messages_zz_assign_room_seq ON public.community_messenger_messages;

CREATE OR REPLACE FUNCTION public.community_messenger_room_messages_after(p_user_id uuid, p_room_id uuid, p_after_message_id uuid, p_limit integer)
 RETURNS SETOF community_messenger_messages
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.*
  from public.community_messenger_messages m
  where m.room_id = p_room_id
    and m.deleted_at is null
    and exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = p_room_id
        and p.user_id = p_user_id
    )
    and exists (
      select 1
      from public.community_messenger_messages a
      where a.id = p_after_message_id
        and a.room_id = p_room_id
    )
    and (
      m.created_at,
      m.id
    ) > (
      select a.created_at, a.id
      from public.community_messenger_messages a
      where a.id = p_after_message_id
        and a.room_id = p_room_id
    )
  order by m.created_at asc, m.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$function$;

DROP FUNCTION IF EXISTS public.cm_messages_assign_room_seq();
DROP INDEX IF EXISTS public.uq_cm_messages_room_seq;
DROP TABLE IF EXISTS public.community_messenger_room_message_seq;
-- 컬럼까지 제거하려면(선택, 이후 재적용 시 번호 재시작): ALTER TABLE public.community_messenger_messages DROP COLUMN room_seq;
COMMIT;
