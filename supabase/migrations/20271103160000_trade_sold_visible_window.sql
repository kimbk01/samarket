-- 판매완료 글 목록 노출 기간 (Owner 2026-11-03 「판매 완료 부분은 1달 보여야 … 어드민에서 판매 완료 부분의 기간을 조정」)
-- 설계: docs/audit/trade-boost-price-sold-window-design-2026-11-03.md §2
--
-- 1) posts.sold_at — 판매완료가 된 순간. 트리거(노출 트리거 다음 순서)가 최종 상태가 sold 이고 비어 있으면 now(),
--    판매중·예약으로 되돌리면 null, 숨김은 유지. 회원 판매완료·판매 상태 변경·관리자 강제 변경·노출 트리거 전환을 모두 덮는다.
-- 2) 기존 판매완료 글: 판매 시각 기록이 없어 마지막 수정 시각(updated_at)으로 채운다(없으면 created_at).
-- 3) trade_list_page: p.sold_days(일) 동안만 판매완료 글을 목록·찾기에 넣는다. 값이 없으면 30(옛 호출 호환).
--    나머지 본문은 운영 정의(md5 03ee0ece4848c90bebb7376fc6e45f0b)와 같다 — base 조건 1줄·변수 1개만 추가.
-- 롤백: 20270706120000 의 trade_list_page 정의를 다시 CREATE OR REPLACE (sold_at 칸·트리거는 남겨도 무해).

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS sold_at timestamptz NULL;

UPDATE public.posts
   SET sold_at = coalesce(updated_at, created_at)
 WHERE status = 'sold' AND sold_at IS NULL;

CREATE OR REPLACE FUNCTION public.posts_set_sold_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- 최종 상태 기준(노출 트리거 trg_posts_visibility_gate 가 status 를 바꾼 뒤에 실행 — 이름 순서 v < z).
  -- 판매완료인데 시각이 비어 있으면 지금. 숨김은 시각 유지(숨김→노출로 판매완료가 돌아와도 처음 판매 시각 유지).
  -- 판매중·예약 등(판매완료·숨김이 아닌 상태)이면 비운다 → 다시 판매완료되면 그때 시각.
  IF NEW.status = 'sold' THEN
    IF NEW.sold_at IS NULL THEN
      NEW.sold_at := now();
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'hidden' THEN
    NEW.sold_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_set_sold_at ON public.posts;
DROP TRIGGER IF EXISTS trg_posts_z_sold_at ON public.posts;
CREATE TRIGGER trg_posts_z_sold_at
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_set_sold_at();

CREATE OR REPLACE FUNCTION public.trade_list_page(p jsonb)
 RETURNS TABLE(id uuid, list_section text, sort_key jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_sold_since timestamptz;
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
  -- 판매완료 노출 기간(일): 어드민 › 거래 › 설정 값. 없으면 30, 범위 1~365
  v_sold_since := now() - make_interval(days => least(greatest(coalesce(nullif(p ->> 'sold_days', '')::int, 30), 1), 365));

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
      AND (po.status IS DISTINCT FROM 'sold' OR coalesce(po.sold_at, po.updated_at, po.created_at) >= v_sold_since)
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
$function$;
