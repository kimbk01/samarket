-- 모임 정원·채팅 중복 방지·RLS(직접 Supabase 접속 시)
-- 서버 API가 service_role 이면 RLS를 우회합니다.

-- ---------- 채팅: 모임당 방 1개 ----------
CREATE UNIQUE INDEX IF NOT EXISTS chat_rooms_meeting_id_unique
  ON public.chat_rooms (meeting_id)
      WHERE meeting_id IS NOT NULL;

-- ---------- 모임 정원(동시 참여 레이스 완화) ----------
CREATE OR REPLACE FUNCTION public.enforce_meeting_member_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cap int;
  n int;
  closed boolean;
BEGIN
  SELECT max_members, is_closed INTO cap, closed FROM public.meetings WHERE id = NEW.meeting_id;
  IF closed THEN
    RAISE EXCEPTION 'meeting_closed' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'joined' THEN
      SELECT count(*)::int INTO n FROM public.meeting_members
      WHERE meeting_id = NEW.meeting_id AND status = 'joined';
      IF n >= COALESCE(cap, 999999) THEN
        RAISE EXCEPTION 'meeting_full' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'joined' AND (OLD.status IS DISTINCT FROM 'joined') THEN
    SELECT count(*)::int INTO n FROM public.meeting_members
    WHERE meeting_id = NEW.meeting_id AND status = 'joined' AND id IS DISTINCT FROM NEW.id;
    IF n + 1 > COALESCE(cap, 999999) THEN
      RAISE EXCEPTION 'meeting_full' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_members_cap ON public.meeting_members;
CREATE TRIGGER trg_meeting_members_cap
  BEFORE INSERT OR UPDATE OF status ON public.meeting_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_meeting_member_cap();

-- ---------- RLS (예시: 기존 정책과 충돌 시 생략하거나 병합) ----------
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_posts_select_public ON public.community_posts;
CREATE POLICY community_posts_select_public ON public.community_posts
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_hidden, false) = false
    AND COALESCE(is_deleted, false) = false
    AND location_id IS NOT NULL
  );

DROP POLICY IF EXISTS community_posts_update_own ON public.community_posts;
CREATE POLICY community_posts_update_own ON public.community_posts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS community_posts_delete_own ON public.community_posts;
CREATE POLICY community_posts_delete_own ON public.community_posts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS community_comments_select_on_visible_posts ON public.community_comments;
CREATE POLICY community_comments_select_on_visible_posts ON public.community_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND COALESCE(p.is_hidden, false) = false
        AND COALESCE(p.is_deleted, false) = false
    )
    AND COALESCE(community_comments.is_hidden, false) = false
    AND COALESCE(community_comments.is_deleted, false) = false
  );

DROP POLICY IF EXISTS community_comments_insert_authenticated ON public.community_comments;
CREATE POLICY community_comments_insert_authenticated ON public.community_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
