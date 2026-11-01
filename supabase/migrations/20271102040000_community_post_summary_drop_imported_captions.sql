-- 목록 요약문 사진 설명 제외 — 가져온 글 형식까지 (Owner 승인 2026-11-02 「4건 모두 진행」 3번).
--
-- 20271102010000 은 회원 글 형식(`(url)` + 줄바꿈 1개 + 설명)만 뺐다. 가져온 글(origin_kind=imported)은 본문이
-- `(url)` + 빈 줄(줄바꿈 2개) + 설명 이라 남았다(운영 1건: 44a45ead, 요약에 「세부 현지인 유명 맛 집 Pares Ta Bai」).
-- 두 형식 모두 「사진 줄 바로 뒤 설명 줄」만 뺀다. content·content_blocks 저장값은 바꾸지 않는다.
--
-- 데이터: 설명이 요약에 남은 글만 요약을 다시 계산한다(`content = content` → 요약 트리거만 실행).
-- 수정 기록 트리거는 content·title·블록·주제가 그대로라 기록을 남기지 않는다. updated_at 은 바뀌지 않는다.
-- 적용 전 미리보기(2026-11-02 PHT): 대상 1건(44a45ead) — 설명 문장만 빠지고 나머지 요약 동일.
-- 설명이 있는 다른 글 2건(9413c218·0605121d)은 결과가 지금과 같아 대상에서 제외된다.

CREATE OR REPLACE FUNCTION public.community_posts_set_summary_from_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text := coalesce(NEW.content, '');
  v_block jsonb;
  v_url text;
  v_caption text;
BEGIN
  IF NEW.content_blocks IS NOT NULL AND jsonb_typeof(NEW.content_blocks) = 'array' THEN
    FOR v_block IN SELECT value FROM jsonb_array_elements(NEW.content_blocks) LOOP
      IF v_block->>'t' = 'img' THEN
        v_url := coalesce(v_block->>'url', '');
        v_caption := coalesce(v_block->>'caption', '');
        IF v_url <> '' AND v_caption <> '' THEN
          v_text := replace(v_text, '(' || v_url || ')' || E'\n' || v_caption, '(' || v_url || ')');
          v_text := replace(v_text, '(' || v_url || ')' || E'\n\n' || v_caption, '(' || v_url || ')');
        END IF;
      END IF;
    END LOOP;
  END IF;
  NEW.summary := public.community_post_summary_from_content(v_text, 160);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.community_posts_set_summary_from_content()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.community_posts_set_summary_from_content()
IS 'Community list summary: content minus image caption lines (member \n / imported \n\n after the image line), then community_post_summary_from_content.';

-- 설명이 요약에 남은 글만 다시 계산
UPDATE public.community_posts p
SET content = p.content
WHERE p.status <> 'deleted'
  AND p.content_blocks IS NOT NULL
  AND jsonb_typeof(p.content_blocks) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.content_blocks) b
    WHERE b->>'t' = 'img'
      AND coalesce(b->>'caption', '') <> ''
      AND position(b->>'caption' in coalesce(p.summary, '')) > 0
  );
