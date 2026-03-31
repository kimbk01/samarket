-- 필라이프 동네글 기준 채팅·모임 메인방: related_post_id(public.posts) 와 분리
-- (meetings.post_id → community_posts 이므로 chat_rooms 에는 이 컬럼 사용)

DO $$
BEGIN
  IF to_regclass('public.chat_rooms') IS NOT NULL
     AND to_regclass('public.community_posts') IS NOT NULL
  THEN
    ALTER TABLE public.chat_rooms
      ADD COLUMN IF NOT EXISTS related_community_post_id uuid REFERENCES public.community_posts(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS chat_rooms_related_community_post_id_idx
      ON public.chat_rooms (related_community_post_id)
      WHERE related_community_post_id IS NOT NULL;
  END IF;
END $$;
