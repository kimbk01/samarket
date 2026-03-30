-- 사마켓 커뮤니티 엔진 v2 — status 기반 글/댓글, 모임 lifecycle, 신고, 댓글 좋아요, 관계 relation_type
-- 기존 neighborhood 마이그레이션 이후 적용. service_role API 는 RLS 우회.

-- ---------------------------------------------------------------------------
-- 관리자 판별 (RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT check_uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = check_uid AND p.role IN ('admin', 'master'))
    OR EXISTS (SELECT 1 FROM public.test_users t WHERE t.id = check_uid AND t.role IN ('admin', 'master'))
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.locations ALTER COLUMN district DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- community_posts — v2 컬럼 + 레거시 boolean 과 동기화
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_reported boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.community_posts SET status =
  CASE
    WHEN COALESCE(is_deleted, false) THEN 'deleted'
    WHEN COALESCE(is_hidden, false) THEN 'hidden'
    ELSE 'active'
  END
WHERE status IS NULL;

ALTER TABLE public.community_posts ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.community_posts ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_status_check;
ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_status_check
  CHECK (status IN ('active', 'hidden', 'deleted'));

UPDATE public.community_posts SET category = 'etc'
WHERE category IS NOT NULL AND category NOT IN (
  'question', 'info', 'daily', 'meetup', 'food', 'job', 'promo', 'notice', 'etc'
);

ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_category_check;
ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_category_check
  CHECK (
    category IS NULL OR category IN (
      'question', 'info', 'daily', 'meetup', 'food', 'job', 'promo', 'notice', 'etc'
    )
  );

CREATE OR REPLACE FUNCTION public.community_posts_sync_legacy_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.status = 'deleted' THEN
      NEW.is_deleted := true;
      NEW.is_hidden := false;
    ELSIF NEW.status = 'hidden' THEN
      NEW.is_deleted := false;
      NEW.is_hidden := true;
    ELSIF NEW.status = 'active' THEN
      NEW.is_deleted := false;
      NEW.is_hidden := false;
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_posts_sync_legacy ON public.community_posts;
CREATE TRIGGER trg_community_posts_sync_legacy
  BEFORE INSERT OR UPDATE OF status ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.community_posts_sync_legacy_flags();

CREATE INDEX IF NOT EXISTS community_posts_status_location_created_idx
  ON public.community_posts (location_id, created_at DESC)
  WHERE status = 'active' AND location_id IS NOT NULL;

DROP INDEX IF EXISTS community_posts_location_created_idx;
DROP INDEX IF EXISTS community_posts_category_idx;

CREATE INDEX IF NOT EXISTS community_posts_location_created_idx
  ON public.community_posts (location_id, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS community_posts_category_idx
  ON public.community_posts (category)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- community_comments
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE;
ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS depth int NOT NULL DEFAULT 0;
ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS like_count int NOT NULL DEFAULT 0;
ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.community_comments SET status =
  CASE
    WHEN COALESCE(is_deleted, false) THEN 'deleted'
    WHEN COALESCE(is_hidden, false) THEN 'hidden'
    ELSE 'active'
  END
WHERE status IS NULL;

ALTER TABLE public.community_comments ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.community_comments ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.community_comments DROP CONSTRAINT IF EXISTS community_comments_status_check;
ALTER TABLE public.community_comments ADD CONSTRAINT community_comments_status_check
  CHECK (status IN ('active', 'hidden', 'deleted'));

CREATE OR REPLACE FUNCTION public.community_comments_sync_legacy_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.status = 'deleted' THEN
      NEW.is_deleted := true;
      NEW.is_hidden := false;
    ELSIF NEW.status = 'hidden' THEN
      NEW.is_deleted := false;
      NEW.is_hidden := true;
    ELSIF NEW.status = 'active' THEN
      NEW.is_deleted := false;
      NEW.is_hidden := false;
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_comments_sync_legacy ON public.community_comments;
CREATE TRIGGER trg_community_comments_sync_legacy
  BEFORE INSERT OR UPDATE OF status ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_comments_sync_legacy_flags();

-- 댓글 수 동기화: status + 레거시 호환
CREATE OR REPLACE FUNCTION public.sync_community_post_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vis_new boolean;
  vis_old boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    vis_new := COALESCE(NEW.status, 'active') = 'active'
      AND COALESCE(NEW.is_hidden, false) = false
      AND COALESCE(NEW.is_deleted, false) = false;
    IF vis_new THEN
      UPDATE public.community_posts SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    vis_old := COALESCE(OLD.status, 'active') = 'active'
      AND COALESCE(OLD.is_hidden, false) = false
      AND COALESCE(OLD.is_deleted, false) = false;
    IF vis_old THEN
      UPDATE public.community_posts SET comment_count = GREATEST(0, COALESCE(comment_count, 0) - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    vis_old := COALESCE(OLD.status, 'active') = 'active'
      AND COALESCE(OLD.is_hidden, false) = false
      AND COALESCE(OLD.is_deleted, false) = false;
    vis_new := COALESCE(NEW.status, 'active') = 'active'
      AND COALESCE(NEW.is_hidden, false) = false
      AND COALESCE(NEW.is_deleted, false) = false;
    IF vis_old AND NOT vis_new THEN
      UPDATE public.community_posts SET comment_count = GREATEST(0, COALESCE(comment_count, 0) - 1) WHERE id = NEW.post_id;
    ELSIF NOT vis_old AND vis_new THEN
      UPDATE public.community_posts SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_comments_count ON public.community_comments;
CREATE TRIGGER trg_community_comments_count
  AFTER INSERT OR DELETE OR UPDATE OF status, is_hidden ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_community_post_comment_count();

-- ---------------------------------------------------------------------------
-- community_comment_likes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_comment_likes_user_idx ON public.community_comment_likes (user_id);

-- community_reports 는 기존 사마켓 스키마(reason_type, reason_text, status …) 유지 — 본 마이그레이션에서 재정의하지 않음

-- ---------------------------------------------------------------------------
-- meetings — host_user_id, join_policy, status (lifecycle)
-- ---------------------------------------------------------------------------
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS host_user_id uuid;
UPDATE public.meetings SET host_user_id = created_by WHERE host_user_id IS NULL;
ALTER TABLE public.meetings ALTER COLUMN host_user_id SET NOT NULL;

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open';
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_join_policy_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_join_policy_check
  CHECK (join_policy IN ('open', 'approve'));

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS status text;
UPDATE public.meetings SET status = CASE WHEN COALESCE(is_closed, false) THEN 'closed' ELSE 'open' END WHERE status IS NULL;
ALTER TABLE public.meetings ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE public.meetings ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_status_check
  CHECK (status IN ('open', 'closed', 'ended', 'cancelled'));

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.meetings_sync_closed_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('closed', 'ended', 'cancelled') THEN
    NEW.is_closed := true;
  ELSE
    NEW.is_closed := false;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_sync_closed ON public.meetings;
CREATE TRIGGER trg_meetings_sync_closed
  BEFORE INSERT OR UPDATE OF status ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.meetings_sync_closed_legacy();

-- meeting_date NOT NULL 요구(스펙)
UPDATE public.meetings SET meeting_date = COALESCE(meeting_date, created_at, now()) WHERE meeting_date IS NULL;
ALTER TABLE public.meetings ALTER COLUMN meeting_date SET NOT NULL;

-- ---------------------------------------------------------------------------
-- meeting_members — role, joined_at, pending
-- ---------------------------------------------------------------------------
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
ALTER TABLE public.meeting_members DROP CONSTRAINT IF EXISTS meeting_members_role_check;
ALTER TABLE public.meeting_members ADD CONSTRAINT meeting_members_role_check
  CHECK (role IN ('host', 'member'));

ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.meeting_members DROP CONSTRAINT IF EXISTS meeting_members_status_check;
ALTER TABLE public.meeting_members ADD CONSTRAINT meeting_members_status_check
  CHECK (status IN ('joined', 'left', 'kicked', 'pending'));

UPDATE public.meeting_members mm SET role = 'host' FROM public.meetings m
WHERE mm.meeting_id = m.id AND mm.user_id = m.host_user_id AND mm.role = 'member';

-- ---------------------------------------------------------------------------
-- 정원 트리거 — meetings.status 사용
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_meeting_member_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cap int;
  n int;
  st text;
BEGIN
  SELECT max_members, status INTO cap, st FROM public.meetings WHERE id = NEW.meeting_id;
  IF st IN ('closed', 'ended', 'cancelled') THEN
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
  EXECUTE FUNCTION public.enforce_meeting_member_cap();

-- ---------------------------------------------------------------------------
-- user_relationships — relation_type (스펙 명칭), type 과 병행
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_relationships ADD COLUMN IF NOT EXISTS relation_type text;
UPDATE public.user_relationships SET relation_type = type WHERE relation_type IS NULL;
ALTER TABLE public.user_relationships ALTER COLUMN relation_type SET NOT NULL;

ALTER TABLE public.user_relationships DROP CONSTRAINT IF EXISTS user_relationships_relation_type_check;
ALTER TABLE public.user_relationships ADD CONSTRAINT user_relationships_relation_type_check
  CHECK (relation_type IN ('neighbor_follow', 'blocked'));

ALTER TABLE public.user_relationships DROP CONSTRAINT IF EXISTS user_relationships_user_id_target_user_id_type_key;
ALTER TABLE public.user_relationships DROP CONSTRAINT IF EXISTS user_relationships_user_target_rel_key;
ALTER TABLE public.user_relationships ADD CONSTRAINT user_relationships_user_target_rel_key
  UNIQUE (user_id, target_user_id, relation_type);

CREATE OR REPLACE FUNCTION public.user_relationships_sync_type_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.type := NEW.relation_type;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_relationships_sync_type ON public.user_relationships;
CREATE TRIGGER trg_user_relationships_sync_type
  BEFORE INSERT OR UPDATE OF relation_type ON public.user_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.user_relationships_sync_type_legacy();

-- ---------------------------------------------------------------------------
-- 조회수 RPC — status = active
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_community_post_view_count(post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.community_posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = post_id
    AND COALESCE(status, 'active') = 'active'
    AND COALESCE(is_hidden, false) = false
    AND COALESCE(is_deleted, false) = false
  RETURNING view_count INTO new_count;

  IF new_count IS NULL THEN
    RETURN -1;
  END IF;
  RETURN new_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS (커뮤니티 코어)
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;
-- ---------- community_posts ----------
DROP POLICY IF EXISTS community_posts_select_public ON public.community_posts;
DROP POLICY IF EXISTS community_posts_select_v2 ON public.community_posts;
CREATE POLICY community_posts_select_v2 ON public.community_posts
  FOR SELECT TO authenticated
  USING (
    (status = 'active' AND location_id IS NOT NULL)
    OR user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS community_posts_insert_own ON public.community_posts;
CREATE POLICY community_posts_insert_own ON public.community_posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND location_id IS NOT NULL);

DROP POLICY IF EXISTS community_posts_update_own ON public.community_posts;
CREATE POLICY community_posts_update_own ON public.community_posts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS community_posts_delete_own ON public.community_posts;
CREATE POLICY community_posts_delete_own ON public.community_posts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- ---------- community_comments ----------
DROP POLICY IF EXISTS community_comments_select_on_visible_posts ON public.community_comments;
DROP POLICY IF EXISTS community_comments_select_v2 ON public.community_comments;
CREATE POLICY community_comments_select_v2 ON public.community_comments
  FOR SELECT TO authenticated
  USING (
    (
      status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.community_posts p
        WHERE p.id = community_comments.post_id
          AND p.status = 'active'
          AND p.location_id IS NOT NULL
      )
    )
    OR user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS community_comments_insert_authenticated ON public.community_comments;
DROP POLICY IF EXISTS community_comments_insert_v2 ON public.community_comments;
CREATE POLICY community_comments_insert_v2 ON public.community_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS community_comments_update_own ON public.community_comments;
CREATE POLICY community_comments_update_own ON public.community_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS community_comments_delete_own ON public.community_comments;
CREATE POLICY community_comments_delete_own ON public.community_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- ---------- likes ----------
DROP POLICY IF EXISTS community_post_likes_select ON public.community_post_likes;
DROP POLICY IF EXISTS community_post_likes_mut_own ON public.community_post_likes;
DROP POLICY IF EXISTS community_post_likes_insert_own ON public.community_post_likes;
DROP POLICY IF EXISTS community_post_likes_delete_own ON public.community_post_likes;
CREATE POLICY community_post_likes_select ON public.community_post_likes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY community_post_likes_insert_own ON public.community_post_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY community_post_likes_delete_own ON public.community_post_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS community_comment_likes_select ON public.community_comment_likes;
DROP POLICY IF EXISTS community_comment_likes_mut_own ON public.community_comment_likes;
DROP POLICY IF EXISTS community_comment_likes_insert_own ON public.community_comment_likes;
DROP POLICY IF EXISTS community_comment_likes_delete_own ON public.community_comment_likes;
CREATE POLICY community_comment_likes_select ON public.community_comment_likes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY community_comment_likes_insert_own ON public.community_comment_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY community_comment_likes_delete_own ON public.community_comment_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ---------- meetings ----------
DROP POLICY IF EXISTS meetings_select_open ON public.meetings;
CREATE POLICY meetings_select_open ON public.meetings
  FOR SELECT TO authenticated
  USING (
    status = 'open'
    OR host_user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.meeting_members mm
      WHERE mm.meeting_id = meetings.id AND mm.user_id = auth.uid() AND mm.status = 'joined'
    )
  );

DROP POLICY IF EXISTS meetings_update_host ON public.meetings;
CREATE POLICY meetings_update_host ON public.meetings
  FOR UPDATE TO authenticated
  USING (host_user_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (host_user_id IS NOT NULL);

-- ---------- meeting_members ----------
DROP POLICY IF EXISTS meeting_members_select ON public.meeting_members;
CREATE POLICY meeting_members_select ON public.meeting_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_members.meeting_id AND m.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.meeting_members mm2
      WHERE mm2.meeting_id = meeting_members.meeting_id AND mm2.user_id = auth.uid() AND mm2.status = 'joined'
    )
  );

DROP POLICY IF EXISTS meeting_members_insert_self ON public.meeting_members;
CREATE POLICY meeting_members_insert_self ON public.meeting_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS meeting_members_update_self ON public.meeting_members;
CREATE POLICY meeting_members_update_self ON public.meeting_members
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_members.meeting_id AND m.host_user_id = auth.uid())
  );

-- ---------- user_relationships ----------
DROP POLICY IF EXISTS user_relationships_own ON public.user_relationships;
DROP POLICY IF EXISTS user_relationships_select_own ON public.user_relationships;
DROP POLICY IF EXISTS user_relationships_mut_own ON public.user_relationships;
CREATE POLICY user_relationships_own ON public.user_relationships
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 동네 주제: promo, notice (카테고리 스펙)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sec_id uuid;
BEGIN
  SELECT id INTO sec_id FROM public.community_sections WHERE slug = 'dongnae' AND COALESCE(is_active, true) LIMIT 1;
  IF sec_id IS NULL THEN
    RAISE NOTICE 'community_engine_v2: dongnae 섹션 없음 — promo/notice 주제 생략';
    RETURN;
  END IF;
  INSERT INTO public.community_topics (
    section_id, name, slug, sort_order, is_active, is_visible, is_feed_sort, allow_question, allow_meetup, color, icon, feed_list_skin
  )
  SELECT sec_id, v.nm, v.sl, v.ord, true, true, false, false, false, v.col, NULL, 'compact_media'
  FROM (VALUES
    ('홍보', 'promo', 80, '#f97316'),
    ('공지', 'notice', 81, '#dc2626')
  ) AS v(nm, sl, ord, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.community_topics t WHERE t.section_id = sec_id AND t.slug = v.sl
  );
END $$;
