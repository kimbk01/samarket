-- 메신저 감사 W5 / M-4 (docs/dibay-messenger-full-audit-2026-10-21.md 2부 I-3) — 방별 메시지 순번(room_seq)
-- 원인: created_at 을 앱 서버가 RPC 호출 **전에** 정해 커밋 순서와 시간 순서가 어긋날 수 있다.
--   따라잡기(after=)는 (created_at,id) > anchor keyset 이라 늦게 커밋된 행을 영구히 건너뛸 수 있다.
-- 설계(추가 전용·즉시 롤백 가능):
--   · messages.room_seq bigint NULL — 기존 18,800행은 NULL 유지(**백필 없음**: messages 가 Realtime publication
--     대상이라 기존 행 UPDATE 가 클라이언트에 UPDATE 이벤트로 퍼진다).
--   · 방별 카운터 테이블(publication 미포함 → rooms UPDATE 이벤트 증가 없음).
--   · BEFORE INSERT 트리거가 rooms 행 FOR UPDATE → 카운터 +1 을 같은 TX 에서 할당 → seq 순서 = 커밋 순서.
--     모든 INSERT 경로(RPC 3종·TS 직접 INSERT 6곳)가 수정 없이 seq 를 받는다.
--     잠금 순서 rooms → 카운터 → participants 로 통일(append RPC 는 이미 rooms FOR UPDATE 선행).
--   · after RPC 이중 읽기: 앵커에 seq 가 있으면 seq 기준 + (seq NULL 이면서 keyset 이후) 행, 없으면 기존 keyset.
--     API(after=<messageId>) 불변 → 구 클라이언트도 혜택.
-- 롤백: DROP TRIGGER cm_messages_zz_assign_room_seq — 새 행은 NULL, after RPC 의 OR 조건이 계속 받는다.
-- 운영 적용: Owner 별도 명시 승인 후(D6). 적용 직후 검증 SQL 은 문서 4부 참조.
BEGIN;

ALTER TABLE public.community_messenger_messages ADD COLUMN IF NOT EXISTS room_seq bigint;

CREATE TABLE IF NOT EXISTS public.community_messenger_room_message_seq (
  room_id uuid PRIMARY KEY REFERENCES public.community_messenger_rooms(id) ON DELETE CASCADE,
  last_seq bigint NOT NULL DEFAULT 0
) WITH (fillfactor = 50);
ALTER TABLE public.community_messenger_room_message_seq ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_messenger_room_message_seq FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cm_messages_assign_room_seq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.room_seq IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- 직렬화 지점: 같은 방 INSERT 는 커밋까지 순서대로 seq 를 받는다(롤백 시 카운터도 함께 되돌아가 빈 번호 없음)
  PERFORM 1 FROM public.community_messenger_rooms r WHERE r.id = NEW.room_id FOR UPDATE;
  INSERT INTO public.community_messenger_room_message_seq AS s (room_id, last_seq)
  VALUES (NEW.room_id, 1)
  ON CONFLICT (room_id) DO UPDATE SET last_seq = s.last_seq + 1
  RETURNING s.last_seq INTO NEW.room_seq;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.cm_messages_assign_room_seq() FROM PUBLIC, anon, authenticated;

-- 이름순으로 cm_messages_block_deleted 다음에 실행
DROP TRIGGER IF EXISTS cm_messages_zz_assign_room_seq ON public.community_messenger_messages;
CREATE TRIGGER cm_messages_zz_assign_room_seq
  BEFORE INSERT ON public.community_messenger_messages
  FOR EACH ROW EXECUTE FUNCTION public.cm_messages_assign_room_seq();

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_messages_room_seq
  ON public.community_messenger_messages (room_id, room_seq)
  WHERE room_seq IS NOT NULL;

-- 드리프트 가드: after RPC 본문이 2026-10-21 확인값(md5 1936cf18…, 20270505121000 적용본)이 아니면 중단
DO $guard$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.community_messenger_room_messages_after(uuid,uuid,uuid,integer)'::regprocedure) INTO v_def;
  IF md5(v_def) IS DISTINCT FROM '1936cf1841d2b4e5f854a58b182e65af' THEN
    RAISE EXCEPTION 'W5 guard: community_messenger_room_messages_after drifted (md5 %), aborting', md5(v_def);
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.community_messenger_room_messages_after(
  p_user_id uuid, p_room_id uuid, p_after_message_id uuid, p_limit integer
)
RETURNS SETOF public.community_messenger_messages
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with a as (
    select a.created_at, a.id, a.room_seq
    from public.community_messenger_messages a
    where a.id = p_after_message_id
      and a.room_id = p_room_id
  )
  select m.*
  from public.community_messenger_messages m, a
  where m.room_id = p_room_id
    and m.deleted_at is null
    and exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = p_room_id
        and p.user_id = p_user_id
    )
    and (
      case
        when a.room_seq is not null then
          m.room_seq > a.room_seq
          or (m.room_seq is null and (m.created_at, m.id) > (a.created_at, a.id))
        else
          m.room_seq is not null
          or (m.created_at, m.id) > (a.created_at, a.id)
      end
    )
  order by (m.room_seq is not null), m.room_seq asc, m.created_at asc, m.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$function$;

COMMIT;
