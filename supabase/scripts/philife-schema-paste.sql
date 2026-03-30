-- ============================================================================
-- 필라이프(동네) 붙여넣기용 스키마 보강
-- Supabase SQL Editor에서 한 번에 실행. 기존 데이터 보존, IF NOT EXISTS 위주.
--
-- 앱 기준 컬럼 목록: lib/neighborhood/philife-db-expected.ts
--
-- 전제: public.community_posts, public.community_comments, public.meetings,
--       public.meeting_members 테이블이 이미 존재 (초기 커뮤니티 마이그레이션 적용됨).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) 전제 테이블 확인
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.community_posts') IS NULL THEN
    RAISE EXCEPTION 'community_posts 가 없습니다. 먼저 커뮤니티 기본 테이블을 생성하세요.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) locations (동네 키 → location_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL DEFAULT 'PH',
  city text NOT NULL,
  district text NOT NULL DEFAULT '',
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.locations ALTER COLUMN district DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS locations_dedup
  ON public.locations (lower(country), lower(city), lower(COALESCE(district, '')), lower(name));

-- ---------------------------------------------------------------------------
-- 2) community_posts — 필라이프·피드·신고 API가 사용하는 컬럼 전부
-- ---------------------------------------------------------------------------
-- 제목·본문: 초기 스키마에 없으면 모임방 만들기 등에서 schema cache 오류 발생
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS section_id uuid;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS section_slug text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS topic_id uuid;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS topic_slug text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS region_label text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_question boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_meetup boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS meetup_date timestamptz;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS meetup_place text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_reported boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS source_legacy_post_id uuid;

DO $$
BEGIN
  ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_location_id_fkey;
  ALTER TABLE public.community_posts
    ADD CONSTRAINT community_posts_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations(id);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'community_posts.location_id FK 추가 생략(고아 행·중복 등): %', SQLERRM;
END $$;

-- status / 레거시 플래그 정합
UPDATE public.community_posts SET status =
  CASE
    WHEN COALESCE(is_deleted, false) THEN 'deleted'
    WHEN COALESCE(is_hidden, false) THEN 'hidden'
    ELSE COALESCE(status, 'active')
  END
WHERE status IS NULL OR status = '';

UPDATE public.community_posts SET status = 'active' WHERE status IS NULL;

ALTER TABLE public.community_posts ALTER COLUMN status SET DEFAULT 'active';

UPDATE public.community_posts SET category = 'etc'
WHERE category IS NOT NULL AND category NOT IN (
  'question', 'info', 'daily', 'meetup', 'food', 'job', 'promo', 'notice', 'etc'
);

ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_status_check;
ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_status_check
  CHECK (status IS NULL OR status IN ('active', 'hidden', 'deleted'));

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
    ELSIF NEW.status = 'active' OR NEW.status IS NULL THEN
      NEW.is_deleted := false;
      NEW.is_hidden := false;
      IF NEW.status IS NULL THEN
        NEW.status := 'active';
      END IF;
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

CREATE INDEX IF NOT EXISTS community_posts_location_created_idx
  ON public.community_posts (location_id, created_at DESC)
  WHERE COALESCE(status, 'active') = 'active';

CREATE INDEX IF NOT EXISTS community_posts_category_idx
  ON public.community_posts (category)
  WHERE COALESCE(status, 'active') = 'active';

CREATE INDEX IF NOT EXISTS community_posts_is_sample_data_idx
  ON public.community_posts (is_sample_data)
  WHERE is_sample_data = true;

-- ---------------------------------------------------------------------------
-- 3) community_post_images (이미지 행 저장)
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
-- 3b) community_comments — 필라이프 댓글 목록·가시성
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.community_comments') IS NOT NULL THEN
    ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS parent_id uuid;
    ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS depth integer NOT NULL DEFAULT 0;
    ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;
    ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS status text;
    ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
    ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.community_comments') IS NOT NULL THEN
    UPDATE public.community_comments SET status =
      CASE
        WHEN COALESCE(is_deleted, false) THEN 'deleted'
        WHEN COALESCE(is_hidden, false) THEN 'hidden'
        ELSE COALESCE(status, 'active')
      END
    WHERE status IS NULL OR status = '';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) meetings — neighborhood-posts 모임 생성 INSERT 에 필요한 컬럼
--    (세부 제약·카운터 동기화는 migrations/20260329143000_… 전체 적용 권장)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.meetings') IS NOT NULL THEN
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS host_user_id uuid;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open';
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS status text;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS entry_policy text;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS password_hash text;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS requires_approval boolean;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_waitlist boolean NOT NULL DEFAULT false;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_member_invite boolean NOT NULL DEFAULT false;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS joined_count integer NOT NULL DEFAULT 0;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS pending_count integer NOT NULL DEFAULT 0;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS banned_count integer NOT NULL DEFAULT 0;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS notice_count integer NOT NULL DEFAULT 0;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS last_notice_at timestamptz;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS welcome_message text;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS cover_image_url text;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_feed boolean NOT NULL DEFAULT true;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_album_upload boolean NOT NULL DEFAULT true;
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_member_list boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) meeting_members — role 등 (호스트 INSERT)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.meeting_members') IS NOT NULL THEN
    ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
    ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS joined_at timestamptz;
    ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS requested_at timestamptz;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6) PostgREST 스키마 캐시 갱신
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
