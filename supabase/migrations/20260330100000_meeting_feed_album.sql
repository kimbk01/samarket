-- ============================================================================
-- 모임 피드 / 앨범 / 환영메시지 / 커버이미지 스키마
-- Step A (역할 기반 분기) 이후 Step C (DB 연동) 시 적용
-- ============================================================================

-- 전제 확인
DO $$
BEGIN
  IF to_regclass('public.meetings') IS NULL THEN
    RAISE EXCEPTION 'public.meetings does not exist. Apply earlier migrations first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- meetings: 환영메시지 / 커버이미지 / 피드·앨범 허용 여부 추가
-- ---------------------------------------------------------------------------
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS welcome_message   text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS cover_image_url   text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_feed        boolean NOT NULL DEFAULT true;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_album_upload boolean NOT NULL DEFAULT true;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_member_list  boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- meeting_feed_posts: 모임 내부 피드
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_feed_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  author_user_id  uuid NOT NULL,
  post_type       text NOT NULL DEFAULT 'normal'
                    CHECK (post_type IN ('normal', 'notice', 'intro', 'attendance', 'review')),
  content         text NOT NULL DEFAULT '',
  is_pinned       boolean NOT NULL DEFAULT false,
  is_hidden       boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_feed_posts_meeting_idx
  ON public.meeting_feed_posts (meeting_id, created_at DESC)
  WHERE deleted_at IS NULL AND is_hidden = false;

CREATE INDEX IF NOT EXISTS meeting_feed_posts_pinned_idx
  ON public.meeting_feed_posts (meeting_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- meeting_feed_images: 피드 첨부 이미지 (1 post → N images)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_feed_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.meeting_feed_posts(id) ON DELETE CASCADE,
  image_url  text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_feed_images_post_idx
  ON public.meeting_feed_images (post_id, sort_order);

-- ---------------------------------------------------------------------------
-- meeting_feed_comments: 피드 댓글
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_feed_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid NOT NULL REFERENCES public.meeting_feed_posts(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  content        text NOT NULL DEFAULT '',
  parent_id      uuid REFERENCES public.meeting_feed_comments(id),
  is_hidden      boolean NOT NULL DEFAULT false,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_feed_comments_post_idx
  ON public.meeting_feed_comments (post_id, created_at)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- meeting_album_items: 모임 앨범
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_album_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  uploader_user_id uuid NOT NULL,
  image_url        text NOT NULL,
  caption          text,
  is_hidden        boolean NOT NULL DEFAULT false,
  is_cover         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_album_items_meeting_idx
  ON public.meeting_album_items (meeting_id, created_at DESC)
  WHERE is_hidden = false;

-- ---------------------------------------------------------------------------
-- meeting_reports: 신고
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid REFERENCES public.meetings(id),
  target_type     text NOT NULL
                    CHECK (target_type IN (
                      'meeting', 'member', 'feed_post', 'feed_comment',
                      'chat_message', 'album_item'
                    )),
  target_id       uuid NOT NULL,
  reporter_user_id uuid NOT NULL,
  reason_type     text NOT NULL DEFAULT 'etc',
  reason_detail   text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'reviewing', 'resolved', 'rejected')),
  action_result   text,
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_reports_status_idx
  ON public.meeting_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS meeting_reports_meeting_idx
  ON public.meeting_reports (meeting_id)
  WHERE meeting_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- meeting_action_logs: 운영 로그 (관리자 / 호스트 조치 기록)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_action_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   uuid REFERENCES public.meetings(id),
  actor_user_id uuid,
  actor_role   text NOT NULL DEFAULT 'member'
                 CHECK (actor_role IN ('member', 'host', 'admin', 'system')),
  action_type  text NOT NULL,
  target_type  text,
  target_id    uuid,
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_action_logs_meeting_idx
  ON public.meeting_action_logs (meeting_id, created_at DESC)
  WHERE meeting_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS 기본 정책 (Supabase RLS 활성화)
-- ---------------------------------------------------------------------------

-- meeting_feed_posts: 승인된 멤버만 조회, 작성자만 수정, 호스트는 모두 관리
ALTER TABLE public.meeting_feed_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_feed_posts_select ON public.meeting_feed_posts;
CREATE POLICY meeting_feed_posts_select ON public.meeting_feed_posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_members mm
      WHERE mm.meeting_id = meeting_feed_posts.meeting_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'joined'
    )
  );

DROP POLICY IF EXISTS meeting_feed_posts_insert ON public.meeting_feed_posts;
CREATE POLICY meeting_feed_posts_insert ON public.meeting_feed_posts
  FOR INSERT
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.meeting_members mm
      WHERE mm.meeting_id = meeting_feed_posts.meeting_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'joined'
    )
  );

-- meeting_album_items: 승인된 멤버만 조회
ALTER TABLE public.meeting_album_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_album_items_select ON public.meeting_album_items;
CREATE POLICY meeting_album_items_select ON public.meeting_album_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_members mm
      WHERE mm.meeting_id = meeting_album_items.meeting_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'joined'
    )
  );

-- meeting_album_items: 업로드 허용된 멤버만 insert
DROP POLICY IF EXISTS meeting_album_items_insert ON public.meeting_album_items;
CREATE POLICY meeting_album_items_insert ON public.meeting_album_items
  FOR INSERT
  WITH CHECK (
    uploader_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.meeting_members mm
      JOIN public.meetings m ON m.id = mm.meeting_id
      WHERE mm.meeting_id = meeting_album_items.meeting_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'joined'
        AND COALESCE(m.allow_album_upload, true) = true
    )
  );

-- service_role은 모든 정책 우회 (관리자 API 용)
GRANT ALL ON public.meeting_feed_posts    TO service_role;
GRANT ALL ON public.meeting_feed_images   TO service_role;
GRANT ALL ON public.meeting_feed_comments TO service_role;
GRANT ALL ON public.meeting_album_items   TO service_role;
GRANT ALL ON public.meeting_reports       TO service_role;
GRANT ALL ON public.meeting_action_logs   TO service_role;

-- anon / authenticated: 기본 SELECT 허용은 RLS 정책이 제어
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_feed_posts    TO authenticated;
GRANT SELECT, INSERT                  ON public.meeting_feed_images   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.meeting_feed_comments TO authenticated;
GRANT SELECT, INSERT                  ON public.meeting_album_items   TO authenticated;
GRANT SELECT, INSERT                  ON public.meeting_reports       TO authenticated;
