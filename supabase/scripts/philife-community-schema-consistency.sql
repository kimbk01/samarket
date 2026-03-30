-- 필라이프/커뮤니티 정합성 보강 SQL
-- 목적:
-- 1) 오래된 운영 DB에서도 현재 앱이 기대하는 핵심 컬럼/테이블을 보강
-- 2) 기존 데이터를 깨지 않도록 IF NOT EXISTS / 보수적 UPDATE 위주로 적용
-- 3) RLS 정책 같은 운영 영향이 큰 변경은 이번 스크립트에서 제외

BEGIN;

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL DEFAULT 'PH',
  city text NOT NULL,
  district text NOT NULL DEFAULT '',
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS locations_dedup
  ON public.locations (lower(country), lower(city), lower(COALESCE(district, '')), lower(name));

-- ---------------------------------------------------------------------------
-- community_posts
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS section_id uuid;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS section_slug text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS topic_id uuid;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS topic_slug text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS summary text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS region_label text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_question boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_meetup boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS meetup_date timestamptz;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS meetup_place text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_reported boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

UPDATE public.community_posts
SET status = CASE
  WHEN COALESCE(is_deleted, false) THEN 'deleted'
  WHEN COALESCE(is_hidden, false) THEN 'hidden'
  ELSE 'active'
END
WHERE status IS NULL;

UPDATE public.community_posts p
SET
  section_slug = COALESCE(
    p.section_slug,
    (SELECT s.slug FROM public.community_sections s WHERE s.id = p.section_id LIMIT 1)
  ),
  topic_slug = COALESCE(
    p.topic_slug,
    (SELECT t.slug FROM public.community_topics t WHERE t.id = p.topic_id LIMIT 1),
    NULLIF(p.category, '')
  )
WHERE p.section_slug IS NULL OR p.topic_slug IS NULL;

ALTER TABLE public.community_posts
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_status_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_status_check
  CHECK (status IN ('active', 'hidden', 'deleted'));

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_category_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_category_check
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
  IF NEW.status = 'deleted' THEN
    NEW.is_deleted := true;
    NEW.is_hidden := false;
  ELSIF NEW.status = 'hidden' THEN
    NEW.is_deleted := false;
    NEW.is_hidden := true;
  ELSE
    NEW.is_deleted := false;
    NEW.is_hidden := false;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_posts_sync_legacy ON public.community_posts;
CREATE TRIGGER trg_community_posts_sync_legacy
  BEFORE INSERT OR UPDATE OF status ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.community_posts_sync_legacy_flags();

CREATE INDEX IF NOT EXISTS community_posts_location_created_idx
  ON public.community_posts (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_posts_status_location_created_idx
  ON public.community_posts (location_id, created_at DESC)
  WHERE status = 'active' AND location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS community_posts_category_idx
  ON public.community_posts (category)
  WHERE COALESCE(status, 'active') = 'active';

CREATE INDEX IF NOT EXISTS community_posts_is_sample_data_idx
  ON public.community_posts (is_sample_data)
  WHERE is_sample_data = true;

-- ---------------------------------------------------------------------------
-- community_post_images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_post_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_post_images_post_id_sort_idx
  ON public.community_post_images (post_id, sort_order ASC, created_at ASC);

-- ---------------------------------------------------------------------------
-- community_comments
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS depth integer NOT NULL DEFAULT 0;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

UPDATE public.community_comments
SET status = CASE
  WHEN COALESCE(is_deleted, false) THEN 'deleted'
  WHEN COALESCE(is_hidden, false) THEN 'hidden'
  ELSE 'active'
END
WHERE status IS NULL;

ALTER TABLE public.community_comments
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.community_comments
  DROP CONSTRAINT IF EXISTS community_comments_status_check;

ALTER TABLE public.community_comments
  ADD CONSTRAINT community_comments_status_check
  CHECK (status IN ('active', 'hidden', 'deleted'));

CREATE OR REPLACE FUNCTION public.community_comments_sync_legacy_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'deleted' THEN
    NEW.is_deleted := true;
    NEW.is_hidden := false;
  ELSIF NEW.status = 'hidden' THEN
    NEW.is_deleted := false;
    NEW.is_hidden := true;
  ELSE
    NEW.is_deleted := false;
    NEW.is_hidden := false;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_comments_sync_legacy ON public.community_comments;
CREATE TRIGGER trg_community_comments_sync_legacy
  BEFORE INSERT OR UPDATE OF status ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_comments_sync_legacy_flags();

-- ---------------------------------------------------------------------------
-- likes / reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_post_likes_user_idx
  ON public.community_post_likes (user_id);

CREATE TABLE IF NOT EXISTS public.community_comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_comment_likes_user_idx
  ON public.community_comment_likes (user_id);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason_type text NOT NULL DEFAULT 'etc',
  reason_text text,
  status text NOT NULL DEFAULT 'open',
  admin_memo text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_reports_created_at_idx
  ON public.community_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS community_reports_target_idx
  ON public.community_reports (target_type, target_id);

-- ---------------------------------------------------------------------------
-- counters / rpc
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

REVOKE ALL ON FUNCTION public.increment_community_post_view_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_community_post_view_count(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_community_post_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts
    SET like_count = COALESCE(like_count, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts
    SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_post_likes_count ON public.community_post_likes;
CREATE TRIGGER trg_community_post_likes_count
  AFTER INSERT OR DELETE ON public.community_post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_community_post_like_count();

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
    vis_new := COALESCE(NEW.is_hidden, false) = false AND COALESCE(NEW.is_deleted, false) = false;
    IF vis_new THEN
      UPDATE public.community_posts
      SET comment_count = COALESCE(comment_count, 0) + 1
      WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    vis_old := COALESCE(OLD.is_hidden, false) = false AND COALESCE(OLD.is_deleted, false) = false;
    IF vis_old THEN
      UPDATE public.community_posts
      SET comment_count = GREATEST(0, COALESCE(comment_count, 0) - 1)
      WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    vis_old := COALESCE(OLD.is_hidden, false) = false AND COALESCE(OLD.is_deleted, false) = false;
    vis_new := COALESCE(NEW.is_hidden, false) = false AND COALESCE(NEW.is_deleted, false) = false;
    IF vis_old AND NOT vis_new THEN
      UPDATE public.community_posts
      SET comment_count = GREATEST(0, COALESCE(comment_count, 0) - 1)
      WHERE id = NEW.post_id;
    ELSIF NOT vis_old AND vis_new THEN
      UPDATE public.community_posts
      SET comment_count = COALESCE(comment_count, 0) + 1
      WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_comments_count ON public.community_comments;
CREATE TRIGGER trg_community_comments_count
  AFTER INSERT OR DELETE OR UPDATE OF is_hidden, is_deleted ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_community_post_comment_count();

-- ---------------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location_text text NOT NULL DEFAULT '',
  meeting_date timestamptz,
  max_members integer NOT NULL DEFAULT 30 CHECK (max_members > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_closed boolean NOT NULL DEFAULT false,
  chat_room_id uuid
);

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS host_user_id uuid;

UPDATE public.meetings
SET host_user_id = created_by
WHERE host_user_id IS NULL;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open';

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.meetings
SET status = CASE WHEN COALESCE(is_closed, false) THEN 'closed' ELSE 'open' END
WHERE status IS NULL;

ALTER TABLE public.meetings
  ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_join_policy_check;

ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_join_policy_check
  CHECK (join_policy IN ('open', 'approve'));

ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_status_check;

ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_status_check
  CHECK (status IN ('open', 'closed', 'ended', 'cancelled'));

UPDATE public.meetings
SET meeting_date = COALESCE(meeting_date, created_at, now())
WHERE meeting_date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS meetings_one_per_post
  ON public.meetings (post_id);

CREATE INDEX IF NOT EXISTS meetings_created_by_idx
  ON public.meetings (created_by);

CREATE INDEX IF NOT EXISTS meetings_is_sample_data_idx
  ON public.meetings (is_sample_data)
  WHERE is_sample_data = true;

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

-- ---------------------------------------------------------------------------
-- meeting_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'joined',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

ALTER TABLE public.meeting_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

ALTER TABLE public.meeting_members
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.meeting_members
  DROP CONSTRAINT IF EXISTS meeting_members_role_check;

ALTER TABLE public.meeting_members
  ADD CONSTRAINT meeting_members_role_check
  CHECK (role IN ('host', 'member'));

ALTER TABLE public.meeting_members
  DROP CONSTRAINT IF EXISTS meeting_members_status_check;

ALTER TABLE public.meeting_members
  ADD CONSTRAINT meeting_members_status_check
  CHECK (status IN ('joined', 'left', 'kicked', 'pending'));

UPDATE public.meeting_members mm
SET role = 'host'
FROM public.meetings m
WHERE mm.meeting_id = m.id
  AND mm.user_id = m.host_user_id
  AND mm.role = 'member';

CREATE INDEX IF NOT EXISTS meeting_members_meeting_idx
  ON public.meeting_members (meeting_id);

CREATE INDEX IF NOT EXISTS meeting_members_user_idx
  ON public.meeting_members (user_id);

CREATE OR REPLACE FUNCTION public.enforce_meeting_member_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cap integer;
  n integer;
  st text;
BEGIN
  SELECT max_members, status INTO cap, st
  FROM public.meetings
  WHERE id = NEW.meeting_id;

  IF st IN ('closed', 'ended', 'cancelled') THEN
    RAISE EXCEPTION 'meeting_closed' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'joined' THEN
      SELECT count(*)::int INTO n
      FROM public.meeting_members
      WHERE meeting_id = NEW.meeting_id
        AND status = 'joined';
      IF n >= COALESCE(cap, 999999) THEN
        RAISE EXCEPTION 'meeting_full' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'joined' AND (OLD.status IS DISTINCT FROM 'joined') THEN
    SELECT count(*)::int INTO n
    FROM public.meeting_members
    WHERE meeting_id = NEW.meeting_id
      AND status = 'joined'
      AND id IS DISTINCT FROM NEW.id;
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
-- user_relationships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('neighbor_follow', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_user_id, type)
);

ALTER TABLE public.user_relationships
  ADD COLUMN IF NOT EXISTS relation_type text;

UPDATE public.user_relationships
SET relation_type = type
WHERE relation_type IS NULL;

ALTER TABLE public.user_relationships
  DROP CONSTRAINT IF EXISTS user_relationships_relation_type_check;

ALTER TABLE public.user_relationships
  ADD CONSTRAINT user_relationships_relation_type_check
  CHECK (relation_type IN ('neighbor_follow', 'blocked'));

ALTER TABLE public.user_relationships
  DROP CONSTRAINT IF EXISTS user_relationships_user_id_target_user_id_type_key;

ALTER TABLE public.user_relationships
  DROP CONSTRAINT IF EXISTS user_relationships_user_target_rel_key;

ALTER TABLE public.user_relationships
  ADD CONSTRAINT user_relationships_user_target_rel_key
  UNIQUE (user_id, target_user_id, relation_type);

CREATE INDEX IF NOT EXISTS user_relationships_user_idx
  ON public.user_relationships (user_id);

CREATE INDEX IF NOT EXISTS user_relationships_target_idx
  ON public.user_relationships (target_user_id);

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
-- chat_rooms meeting_id 연결 (chat_rooms 가 있을 때만)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.chat_rooms') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.meetings(id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS chat_rooms_meeting_id_idx ON public.chat_rooms (meeting_id) WHERE meeting_id IS NOT NULL';
    -- 모임당 여러 chat_rooms(전체+서브+비공개) 허용 — 유니크 인덱스는 사용하지 않음
    EXECUTE 'DROP INDEX IF EXISTS public.chat_rooms_meeting_id_unique';
  END IF;
END $$;

COMMIT;

-- 확인용
-- SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'community_posts' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meetings' ORDER BY ordinal_position;
-- SELECT section_slug, count(*) FROM public.community_posts GROUP BY 1 ORDER BY 1;
