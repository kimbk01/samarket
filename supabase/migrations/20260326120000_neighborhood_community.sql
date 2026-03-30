-- 당근형 동네 커뮤니티: locations, meetings, 관계, community_posts 확장, 모임–채팅 연결용 컬럼
-- 적용 후 neighborhood 피드·글쓰기 API 사용. community_post_likes 는 스펙상 community_likes 와 동일 역할(물리 테이블명 유지).

-- ---------- locations ----------
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL DEFAULT 'PH',
  city text NOT NULL,
  district text NOT NULL DEFAULT '',
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS locations_dedup
  ON public.locations (lower(country), lower(city), lower(COALESCE(district, '')), lower(name));

-- ---------- community_posts 확장 ----------
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS community_posts_location_created_idx
  ON public.community_posts (location_id, created_at DESC)
  WHERE COALESCE(is_hidden, false) = false AND COALESCE(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS community_posts_category_idx
  ON public.community_posts (category)
  WHERE COALESCE(is_hidden, false) = false AND COALESCE(is_deleted, false) = false;

-- ---------- community_comments ----------
ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- ---------- meetings ----------
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location_text text NOT NULL DEFAULT '',
  meeting_date timestamptz,
  max_members int NOT NULL DEFAULT 30 CHECK (max_members > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_closed boolean NOT NULL DEFAULT false,
  chat_room_id uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS meetings_one_per_post ON public.meetings (post_id);
CREATE INDEX IF NOT EXISTS meetings_created_by_idx ON public.meetings (created_by);

-- ---------- meeting_members ----------
CREATE TABLE IF NOT EXISTS public.meeting_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'left', 'kicked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS meeting_members_meeting_idx ON public.meeting_members (meeting_id);
CREATE INDEX IF NOT EXISTS meeting_members_user_idx ON public.meeting_members (user_id);

-- ---------- user_relationships (관심이웃 / 차단; 친구 UI 없음) ----------
CREATE TABLE IF NOT EXISTS public.user_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('neighbor_follow', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_user_id, type)
);

CREATE INDEX IF NOT EXISTS user_relationships_user_idx ON public.user_relationships (user_id);
CREATE INDEX IF NOT EXISTS user_relationships_target_idx ON public.user_relationships (target_user_id);

-- ---------- chat_rooms: 모임 연결 ----------
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.meetings(id);

CREATE INDEX IF NOT EXISTS chat_rooms_meeting_id_idx ON public.chat_rooms (meeting_id) WHERE meeting_id IS NOT NULL;

-- ---------- 동네 섹션에 카테고리=주제 시드 (이미 있으면 건너뜀) ----------
DO $$
DECLARE
  sec_id uuid;
BEGIN
  SELECT id INTO sec_id FROM public.community_sections WHERE slug = 'dongnae' AND COALESCE(is_active, true) LIMIT 1;
  IF sec_id IS NULL THEN
    RAISE NOTICE 'neighborhood seed: community_sections.slug=dongnae 없음 — 어드민에서 섹션 추가 후 주제를 수동 생성하세요.';
    RETURN;
  END IF;

  INSERT INTO public.community_topics (
    section_id, name, slug, sort_order, is_active, is_visible, is_feed_sort, allow_question, allow_meetup, color, icon, feed_list_skin
  )
  SELECT sec_id, v.nm, v.sl, v.ord, true, true, false, v.aq, v.am, v.col, NULL, 'compact_media'
  FROM (VALUES
    ('질문', 'question', 1, true, false, '#64748b'),
    ('정보', 'info', 2, false, false, '#0ea5e9'),
    ('일상', 'daily', 3, false, false, '#8b5cf6'),
    ('모임', 'meetup', 4, false, true, '#059669'),
    ('구인구직', 'job', 5, false, false, '#d97706'),
    ('맛집', 'food', 6, false, false, '#ec4899'),
    ('기타', 'etc', 7, false, false, '#6b7280')
  ) AS v(nm, sl, ord, aq, am, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.community_topics t WHERE t.section_id = sec_id AND t.slug = v.sl
  );
END $$;
