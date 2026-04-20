-- 커뮤니티 레거시 public.posts → 앱 계약 정렬
--   - meta.board_id / meta.board_category_id / meta.visibility (컬럼 값이 있을 때만 meta 보강)
--   - type = 'community' (거래 글 제외: trade_category_id 비어 있을 때만)
--
-- 레거시 컬럼(board_id 등)이 없는 DB에서는 해당 UPDATE 블록은 스킵됩니다.
-- 이미 meta 또는 type이 채워진 행은 덮어쓰지 않습니다(보강만).

DO $$
DECLARE
  v_has_meta boolean;
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RAISE NOTICE 'community_posts_meta_backfill_from_legacy: public.posts 없음 — 스킵';
    RETURN;
  END IF;

  -- SELECT ... INTO 는 DO 밖에서 실행되면 "테이블 has_meta 생성"으로 해석될 수 있어 := 로만 할당
  v_has_meta := EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'meta'
  );

  IF NOT v_has_meta THEN
    RAISE NOTICE 'community_posts_meta_backfill: posts.meta 컬럼 없음 — 레거시 컬럼→meta 병합(1~3) 스킵';
    RETURN;
  END IF;

  -- 1) posts.board_id → meta.board_id
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'board_id'
  ) THEN
    EXECUTE $q$
      UPDATE public.posts p
      SET meta = coalesce(p.meta, '{}'::jsonb) || jsonb_build_object('board_id', p.board_id::text)
      WHERE p.board_id IS NOT NULL
        AND trim(p.board_id::text) <> ''
        AND (
          p.meta IS NULL
          OR p.meta->>'board_id' IS NULL
          OR trim(p.meta->>'board_id') = ''
        )
    $q$;
    RAISE NOTICE 'community_posts_meta_backfill: board_id 컬럼 → meta.board_id 병합 완료';
  ELSE
    RAISE NOTICE 'community_posts_meta_backfill: posts.board_id 컬럼 없음 — 스킵';
  END IF;

  -- 2) posts.board_category_id → meta.board_category_id
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'board_category_id'
  ) THEN
    EXECUTE $q$
      UPDATE public.posts p
      SET meta = coalesce(p.meta, '{}'::jsonb) || jsonb_build_object('board_category_id', p.board_category_id::text)
      WHERE p.board_category_id IS NOT NULL
        AND trim(p.board_category_id::text) <> ''
        AND (
          p.meta IS NULL
          OR p.meta->>'board_category_id' IS NULL
          OR trim(p.meta->>'board_category_id') = ''
        )
    $q$;
    RAISE NOTICE 'community_posts_meta_backfill: board_category_id 컬럼 → meta 병합 완료';
  ELSE
    RAISE NOTICE 'community_posts_meta_backfill: posts.board_category_id 컬럼 없음 — 스킵';
  END IF;

  -- 3) posts.visibility → meta.visibility (목록이 public 만 볼 때와 동일 계약)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'visibility'
  ) THEN
    EXECUTE $q$
      UPDATE public.posts p
      SET meta = coalesce(p.meta, '{}'::jsonb) || jsonb_build_object('visibility', p.visibility::text)
      WHERE p.visibility IS NOT NULL
        AND trim(p.visibility::text) <> ''
        AND (
          p.meta IS NULL
          OR p.meta->>'visibility' IS NULL
          OR trim(p.meta->>'visibility') = ''
        )
    $q$;
    RAISE NOTICE 'community_posts_meta_backfill: visibility 컬럼 → meta.visibility 병합 완료';
  ELSE
    RAISE NOTICE 'community_posts_meta_backfill: posts.visibility 컬럼 없음 — 스킵';
  END IF;
END $$;

-- 4) type 백필 + 5) meta.visibility 기본값 — posts.meta 컬럼 유무에 따라 분기
DO $$
DECLARE
  v_has_meta boolean;
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RETURN;
  END IF;

  v_has_meta := EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'meta'
  );

  IF v_has_meta THEN
    EXECUTE $q$
      UPDATE public.posts p
      SET type = 'community'
      WHERE (p.type IS NULL OR trim(p.type) = '')
        AND (
          p.community_topic_id IS NOT NULL
          OR (
            p.meta IS NOT NULL
            AND nullif(trim(p.meta->>'board_id'), '') IS NOT NULL
          )
        )
        AND (
          p.trade_category_id IS NULL
          OR trim(p.trade_category_id::text) = ''
        )
    $q$;

    EXECUTE $q$
      UPDATE public.posts p
      SET meta = coalesce(p.meta, '{}'::jsonb) || jsonb_build_object('visibility', 'public')
      WHERE p.type = 'community'
        AND (
          p.meta IS NULL
          OR p.meta->>'visibility' IS NULL
          OR trim(p.meta->>'visibility') = ''
        )
    $q$;
  ELSE
    RAISE NOTICE 'community_posts_meta_backfill: posts.meta 컬럼 없음 — type 은 community_topic_id 만 반영';
    EXECUTE $q$
      UPDATE public.posts p
      SET type = 'community'
      WHERE (p.type IS NULL OR trim(p.type) = '')
        AND p.community_topic_id IS NOT NULL
        AND (
          p.trade_category_id IS NULL
          OR trim(p.trade_category_id::text) = ''
        )
    $q$;
  END IF;
END $$;
