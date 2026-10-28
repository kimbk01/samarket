-- 거래 목록 함수 2차 (Owner 2026-10-28 승인 §7 G · §8 Q1) — 20270705120000 위에 함수 본문만 바꾼다.
--
-- 1) 판매완료 맨 끝: ORDER BY 의 거래 상태(t_state)를 맨 앞으로. 판매중 글(일치·비슷한·같은 주제·나머지, 지역 순서 그대로)
--    다음에 판매완료 글(같은 순서). 「거래 상태: 판매완료」를 고르면 반대로 판매완료가 먼저.
-- 2) 찾기 「비슷한 물품」: 검색어 단어 일부만 맞는 글을 「같은 주제」 앞에, 맞은 단어 수가 많은 순으로.
--    t_q = 0 일치 · 1..n-1 비슷한(n-맞은 수) · n 같은 주제 · n+1 나머지 (n = 검색어 단어 수). 안내 줄 키 `q:related`.
-- 커서 형식(길이 9, 자리 순서)은 그대로 — 비교만 새 순서(4,0,1,2,3,5,6,7,8)로 한다. 앱의 커서 코드는 바뀌지 않는다.
-- 안내 줄 키는 거래 상태 조각을 맨 앞에 둔다(정렬 순서와 같게).
-- 롤백: 20270705120000 의 trade_list_page 정의를 다시 CREATE OR REPLACE.

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
  v_nw int;
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
  v_nw := coalesce(array_length(v_words, 1), 0);
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
      CASE WHEN v_words IS NULL THEN 0 ELSE (
        SELECT count(*)::int FROM unnest(v_words) w
        WHERE position(w IN lower(regexp_replace(
          coalesce(po.search_text, '') || ' ' || coalesce(po.content, '') || ' '
            || coalesce(c.name, '') || ' ' || coalesce(pc.name, ''),
          '\s+', '', 'g'))) > 0
      ) END AS q_hits,
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
    SELECT DISTINCT b.trade_category_id AS tid FROM base b WHERE v_nw > 0 AND b.q_hits = v_nw
  ),
  keyed AS (
    SELECT
      b.pid,
      CASE
        WHEN v_nw = 0 OR b.q_hits = v_nw THEN 0
        WHEN b.q_hits > 0 THEN v_nw - b.q_hits
        WHEN b.trade_category_id IN (SELECT tid FROM q_topics) THEN v_nw
        ELSE v_nw + 1
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
      CASE WHEN r.t_state = 1 THEN CASE WHEN v_state = 'sold' THEN 'state:active' ELSE 'state:sold' END END,
      CASE
        WHEN r.t_q = 0 THEN NULL
        WHEN r.t_q < v_nw THEN 'q:related'
        WHEN r.t_q = v_nw THEN 'q:similar'
        ELSE 'q:rest'
      END,
      CASE r.t_cat WHEN 1 THEN 'cat:similar' WHEN 2 THEN 'cat:other' END,
      CASE r.t_opt WHEN 1 THEN 'opt:mismatch' END,
      CASE r.t_price WHEN 1 THEN 'price:out' END,
      nullif(coalesce(v_loc_parts[r.t_loc + 1], ''), '')
    ], NULL), '|') AS list_section,
    jsonb_build_array(r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_state, r.t_loc, r.s1, r.s2, r.pid::text) AS sort_key
  FROM ranked r
  WHERE v_cursor IS NULL
     OR (r.t_state, r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_loc, r.s1, r.s2, r.pid::text)
        > ((v_cursor ->> 4)::int, (v_cursor ->> 0)::int, (v_cursor ->> 1)::int, (v_cursor ->> 2)::int,
           (v_cursor ->> 3)::int, (v_cursor ->> 5)::int, (v_cursor ->> 6)::float8, (v_cursor ->> 7)::float8,
           (v_cursor ->> 8))
  ORDER BY r.t_state, r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_loc, r.s1, r.s2, r.pid::text
  OFFSET CASE WHEN v_cursor IS NULL THEN v_offset ELSE 0 END
  LIMIT v_limit + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.trade_list_page(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trade_list_page(jsonb) TO anon, authenticated, service_role;
