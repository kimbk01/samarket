-- 거래 목록·필터·찾기 단일 정렬 함수 (docs/dibay-marketplace-list-ssot-target.md, Owner 2026-10-27 재설계 4-3).
--
-- 모든 공개 거래 글을 한 번의 ORDER BY 로 정렬한다 — 조건은 순서만 바꾸고 글을 빼지 않는다.
-- 순서 키: 검색 단계 → 물품 → 옵션 → 가격 → 거래 상태 → 지역 → 정렬(최신/인기/거리) → id.
-- 다음 페이지는 마지막 글의 키(cursor)로 이어 읽는다(keyset) — 새 글·삭제가 생겨도 중복·누락 없음.
--
-- 지역 판정(동네·시·주변·그 외, 거리 km)은 앱의 전국 LGU 데이터(SSOT)로 서버가 계산해 넘긴다:
--   p.loc_lgu    = { "<trade_lgu_id>": [tier, km] }
--   p.loc_legacy = { "<region>|<city>": [tier, km] }   (trade_lgu_id 가 없는 예전 글)
--   p.loc_hood   = { "r": region, "c": city, "from": tier, "to": tier }  (회원 대표 주소 동네)
--   p.loc_default = 맵에 없는 글의 구간, p.loc_parts = 구간별 안내 키 조각
--
-- 반환: 공개 글 id·안내 줄 키·커서 키. 상세 행은 앱이 id 로 읽는다.
-- SECURITY DEFINER — 공개 자격(숨김·삭제·관리자 숨김 제외) 글의 id 만 돌려준다.

CREATE OR REPLACE FUNCTION public.trade_list_comp_value(rj jsonb, col text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN col ~ '^meta->>[A-Za-z0-9_]+$' THEN rj -> 'meta' ->> substr(col, 8)
    ELSE rj ->> col
  END
$$;

-- lib/trade/marketplace/list-contract/list-segments.ts `rowMatchesCompositionClauses` 와 같은 판정
CREATE OR REPLACE FUNCTION public.trade_list_comp_match(rj jsonb, clauses jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cl jsonb;
  op text;
  cols text[];
  vals text[];
  n int;
  i int;
  v text;
  val text;
  any_hit boolean;
  considered boolean;
BEGIN
  IF clauses IS NULL OR jsonb_typeof(clauses) <> 'array' THEN
    RETURN true;
  END IF;
  FOR cl IN SELECT value FROM jsonb_array_elements(clauses) LOOP
    op := cl ->> 'op';
    cols := ARRAY(SELECT jsonb_array_elements_text(coalesce(cl -> 'columns', '[]'::jsonb)));
    vals := ARRAY(SELECT jsonb_array_elements_text(coalesce(cl -> 'values', '[]'::jsonb)));
    n := least(coalesce(array_length(cols, 1), 0), coalesce(array_length(vals, 1), 0));
    IF op = 'exclude_eq' THEN
      FOR i IN 1..n LOOP
        IF coalesce(cols[i], '') <> '' AND coalesce(vals[i], '') <> ''
           AND public.trade_list_comp_value(rj, cols[i]) = vals[i] THEN
          RETURN false;
        END IF;
      END LOOP;
    ELSIF op = 'or_eq' THEN
      any_hit := false;
      considered := false;
      FOR i IN 1..n LOOP
        IF coalesce(cols[i], '') <> '' AND coalesce(vals[i], '') <> '' THEN
          considered := true;
          IF public.trade_list_comp_value(rj, cols[i]) = vals[i] THEN
            any_hit := true;
          END IF;
        END IF;
      END LOOP;
      IF considered AND NOT any_hit THEN
        RETURN false;
      END IF;
    ELSIF op = 'eq' THEN
      v := vals[1];
      IF coalesce(v, '') <> '' AND coalesce(array_length(cols, 1), 0) > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM unnest(cols) c WHERE public.trade_list_comp_value(rj, c) = v
        ) THEN
          RETURN false;
        END IF;
      END IF;
    ELSE
      IF coalesce(cols[1], '') <> '' AND coalesce(array_length(vals, 1), 0) > 0 THEN
        val := public.trade_list_comp_value(rj, cols[1]);
        IF coalesce(val, '') = '' THEN
          RETURN false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM unnest(vals) x WHERE position(lower(x) IN lower(val)) > 0
        ) THEN
          RETURN false;
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.trade_list_page(p jsonb)
RETURNS TABLE (id uuid, list_section text, sort_key jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_universe uuid[];
  v_primary uuid[];
  v_similar uuid[];
  v_comp jsonb;
  v_pmin numeric;
  v_pmax numeric;
  v_state text;
  v_loc_lgu jsonb;
  v_loc_legacy jsonb;
  v_hood jsonb;
  v_loc_default int;
  v_loc_parts text[];
  v_words text[];
  v_sort text;
  v_limit int;
  v_offset int;
  v_cursor jsonb;
BEGIN
  v_universe := CASE WHEN jsonb_typeof(p -> 'universe') = 'array'
    THEN ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p -> 'universe') x) END;
  v_primary := CASE WHEN jsonb_typeof(p -> 'cat_primary') = 'array'
    THEN ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p -> 'cat_primary') x) END;
  v_similar := CASE WHEN jsonb_typeof(p -> 'cat_similar') = 'array'
    THEN ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p -> 'cat_similar') x) END;
  IF coalesce(array_length(v_universe, 1), 0) = 0 THEN v_universe := NULL; END IF;
  IF coalesce(array_length(v_primary, 1), 0) = 0 THEN v_primary := NULL; END IF;
  IF coalesce(array_length(v_similar, 1), 0) = 0 THEN v_similar := NULL; END IF;
  v_comp := CASE WHEN jsonb_typeof(p -> 'comp') = 'array' AND jsonb_array_length(p -> 'comp') > 0
    THEN p -> 'comp' END;
  v_pmin := nullif(p ->> 'price_min', '')::numeric;
  v_pmax := nullif(p ->> 'price_max', '')::numeric;
  v_state := coalesce(p ->> 'trade_state', 'all');
  v_loc_lgu := CASE WHEN jsonb_typeof(p -> 'loc_lgu') = 'object' THEN p -> 'loc_lgu' ELSE '{}'::jsonb END;
  v_loc_legacy := CASE WHEN jsonb_typeof(p -> 'loc_legacy') = 'object' THEN p -> 'loc_legacy' ELSE '{}'::jsonb END;
  v_hood := CASE WHEN jsonb_typeof(p -> 'loc_hood') = 'object' THEN p -> 'loc_hood' END;
  v_loc_default := coalesce((p ->> 'loc_default')::int, 0);
  v_loc_parts := CASE WHEN jsonb_typeof(p -> 'loc_parts') = 'array'
    THEN ARRAY(SELECT coalesce(x, '') FROM jsonb_array_elements_text(p -> 'loc_parts') x) ELSE ARRAY[]::text[] END;
  v_words := ARRAY(
    SELECT lower(w) FROM regexp_split_to_table(btrim(coalesce(p ->> 'q', '')), '\s+') w WHERE w <> ''
  );
  IF coalesce(array_length(v_words, 1), 0) = 0 THEN v_words := NULL; END IF;
  v_sort := coalesce(p ->> 'sort', 'latest');
  v_limit := least(greatest(coalesce((p ->> 'limit')::int, 50), 1), 200);
  v_offset := greatest(coalesce((p ->> 'offset')::int, 0), 0);
  v_cursor := CASE WHEN jsonb_typeof(p -> 'cursor') = 'array' AND jsonb_array_length(p -> 'cursor') = 9
    THEN p -> 'cursor' END;

  RETURN QUERY
  WITH base AS (
    SELECT
      po.id AS pid,
      po.created_at,
      po.view_count,
      po.price,
      po.status,
      po.trade_category_id,
      po.trade_lgu_id,
      po.region,
      po.city,
      CASE WHEN v_words IS NULL THEN false ELSE NOT EXISTS (
        SELECT 1 FROM unnest(v_words) w
        WHERE position(w IN lower(regexp_replace(
          coalesce(po.search_text, '') || ' ' || coalesce(po.content, '') || ' '
            || coalesce(c.name, '') || ' ' || coalesce(pc.name, ''),
          '\s+', '', 'g'))) = 0
      ) END AS q_hit,
      CASE WHEN v_comp IS NULL THEN 0
        WHEN public.trade_list_comp_match(to_jsonb(po), v_comp) THEN 0 ELSE 1 END AS t_opt
    FROM public.posts po
    LEFT JOIN public.categories c ON c.id = po.trade_category_id
    LEFT JOIN public.categories pc ON pc.id = c.parent_id
    WHERE po.trade_category_id IS NOT NULL
      AND (po.status IS NULL OR po.status <> 'hidden')
      AND coalesce(po.moderation_state, 'visible') = 'visible'
      AND coalesce(po.owner_state, 'none') = 'none'
      AND NOT coalesce(po.is_deleted, false)
      AND (v_universe IS NULL OR po.trade_category_id = ANY (v_universe))
  ),
  q_topics AS (
    SELECT DISTINCT b.trade_category_id AS tid FROM base b WHERE b.q_hit
  ),
  keyed AS (
    SELECT
      b.pid,
      CASE
        WHEN v_words IS NULL OR b.q_hit THEN 0
        WHEN b.trade_category_id IN (SELECT tid FROM q_topics) THEN 1
        ELSE 2
      END AS t_q,
      CASE
        WHEN v_primary IS NULL OR b.trade_category_id = ANY (v_primary) THEN 0
        WHEN v_similar IS NOT NULL AND b.trade_category_id = ANY (v_similar) THEN 1
        ELSE 2
      END AS t_cat,
      b.t_opt,
      CASE
        WHEN v_pmin IS NULL AND v_pmax IS NULL THEN 0
        WHEN b.price IS NULL THEN 1
        WHEN v_pmin IS NOT NULL AND b.price < v_pmin THEN 1
        WHEN v_pmax IS NOT NULL AND b.price > v_pmax THEN 1
        ELSE 0
      END AS t_price,
      CASE
        WHEN v_state = 'sold' THEN CASE WHEN b.status = 'sold' THEN 0 ELSE 1 END
        ELSE CASE WHEN b.status = 'sold' THEN 1 ELSE 0 END
      END AS t_state,
      coalesce(
        CASE WHEN nullif(btrim(b.trade_lgu_id), '') IS NOT NULL
          THEN v_loc_lgu -> btrim(b.trade_lgu_id)
          ELSE v_loc_legacy -> (coalesce(btrim(b.region), '') || '|' || coalesce(btrim(b.city), ''))
        END,
        jsonb_build_array(v_loc_default, 1e9)
      ) AS loc_pair,
      b.region,
      b.city,
      b.created_at,
      b.view_count
    FROM base b
  ),
  ranked AS (
    SELECT
      k.pid,
      k.t_q,
      k.t_cat,
      k.t_opt,
      k.t_price,
      k.t_state,
      CASE
        WHEN v_hood IS NOT NULL
          AND (k.loc_pair ->> 0)::int = (v_hood ->> 'from')::int
          AND coalesce(btrim(k.region), '') = (v_hood ->> 'r')
          AND coalesce(btrim(k.city), '') = (v_hood ->> 'c')
        THEN (v_hood ->> 'to')::int
        ELSE (k.loc_pair ->> 0)::int
      END AS t_loc,
      (CASE
        WHEN v_sort = 'distance' THEN (k.loc_pair ->> 1)::float8
        WHEN v_sort = 'popular' THEN -coalesce(k.view_count, 0)::float8
        ELSE -extract(epoch FROM k.created_at)::float8
      END) AS s1,
      (CASE
        WHEN v_sort IN ('distance', 'popular') THEN -extract(epoch FROM k.created_at)::float8
        ELSE 0::float8
      END) AS s2
    FROM keyed k
  )
  SELECT
    r.pid AS id,
    array_to_string(array_remove(ARRAY[
      CASE r.t_q WHEN 1 THEN 'q:similar' WHEN 2 THEN 'q:rest' END,
      CASE r.t_cat WHEN 1 THEN 'cat:similar' WHEN 2 THEN 'cat:other' END,
      CASE r.t_opt WHEN 1 THEN 'opt:mismatch' END,
      CASE r.t_price WHEN 1 THEN 'price:out' END,
      CASE WHEN r.t_state = 1 THEN CASE WHEN v_state = 'sold' THEN 'state:active' ELSE 'state:sold' END END,
      nullif(coalesce(v_loc_parts[r.t_loc + 1], ''), '')
    ], NULL), '|') AS list_section,
    jsonb_build_array(r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_state, r.t_loc, r.s1, r.s2, r.pid::text) AS sort_key
  FROM ranked r
  WHERE v_cursor IS NULL
     OR (r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_state, r.t_loc, r.s1, r.s2, r.pid::text)
        > ((v_cursor ->> 0)::int, (v_cursor ->> 1)::int, (v_cursor ->> 2)::int, (v_cursor ->> 3)::int,
           (v_cursor ->> 4)::int, (v_cursor ->> 5)::int, (v_cursor ->> 6)::float8, (v_cursor ->> 7)::float8,
           (v_cursor ->> 8))
  ORDER BY r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_state, r.t_loc, r.s1, r.s2, r.pid::text
  OFFSET CASE WHEN v_cursor IS NULL THEN v_offset ELSE 0 END
  LIMIT v_limit + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.trade_list_page(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trade_list_page(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trade_list_comp_match(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trade_list_comp_match(jsonb, jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trade_list_comp_value(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trade_list_comp_value(jsonb, text) TO anon, authenticated, service_role;
