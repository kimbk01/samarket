-- 커뮤니티 목록 요약문에서 사진 설명(caption) 제외 (Owner 승인 2026-11-02).
--
-- 실기 2026-11-01(Production dc4488fbb, Android·iPhone): 피드 카드 요약에 사진 설명이 본문처럼 섞였다
-- (예: "Route • one • two go bold capA https://example.com").
-- 원인: 서식 본문의 평문 content 는 `![](url)\n설명` 으로 설명 줄을 담고(검색·관리자 화면·수정 기록용 — 유지),
-- 이 트리거가 저장 때마다 summary 를 content 로 다시 만들어 앱이 보낸 요약을 덮어쓴다.
--
-- 변경: 트리거만 바꾼다. content_blocks 의 사진(img) 블록에 설명이 있으면 content 에서
-- 「사진 줄 바로 뒤 설명 줄」(`(url)` + 줄바꿈 + 설명, `contentFromRichBlocks` 와 같은 모양)만 빼고 요약을 만든다.
-- content·content_blocks 저장값은 바꾸지 않는다. 설명이 없는 글·평문 글은 결과가 전과 같다.
-- 기존 글의 summary 는 다시 계산하지 않는다(다음 저장 때부터 적용).

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
IS 'Community list summary: content minus image caption lines (content_blocks img.caption), then community_post_summary_from_content.';
