-- 동네생활(community_posts) 카운터: 동시성 안전 조회수, 좋아요·댓글 수 자동 동기화
-- Supabase SQL Editor 또는 CLI로 적용. 적용 후 /api/community/posts/:id/view 는 RPC를 우선 사용합니다.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- 1) 조회수: 단일 UPDATE 로 원자적 증가
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
    AND COALESCE(is_hidden, false) = false
  RETURNING view_count INTO new_count;

  IF new_count IS NULL THEN
    RETURN -1;
  END IF;
  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_community_post_view_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_community_post_view_count(uuid) TO service_role;

-- 2) 좋아요 수: likes 테이블 INSERT/DELETE 시 게시글 like_count 동기화
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
  EXECUTE PROCEDURE public.sync_community_post_like_count();

-- 3) 댓글 수: comments INSERT/DELETE/숨김 토글 시 comment_count 동기화
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
    vis_new := COALESCE(NEW.is_hidden, false) = false;
    IF vis_new THEN
      UPDATE public.community_posts
      SET comment_count = COALESCE(comment_count, 0) + 1
      WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    vis_old := COALESCE(OLD.is_hidden, false) = false;
    IF vis_old THEN
      UPDATE public.community_posts
      SET comment_count = GREATEST(0, COALESCE(comment_count, 0) - 1)
      WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    vis_old := COALESCE(OLD.is_hidden, false) = false;
    vis_new := COALESCE(NEW.is_hidden, false) = false;
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
  AFTER INSERT OR DELETE OR UPDATE OF is_hidden ON public.community_comments
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_community_post_comment_count();
