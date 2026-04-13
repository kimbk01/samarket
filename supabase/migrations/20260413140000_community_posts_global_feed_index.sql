-- 전역 필라이프 피드(`globalFeed=1`, `allLocations`): `location_id` 없이 `status = active` 만 걸고 최신순 정렬
CREATE INDEX IF NOT EXISTS community_posts_feed_active_created_id_idx
  ON public.community_posts (created_at DESC, id DESC)
  WHERE status = 'active';
