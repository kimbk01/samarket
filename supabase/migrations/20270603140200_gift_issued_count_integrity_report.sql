-- 상품권 2-D GFT-08 (문서 G-1 §5-D, 2026-10-20) — 상품 issued_count = 인스턴스 수 무결성 검사 (읽기 전용 · 신규 함수)
-- 근거(운영 ckdosyydvgzqwpbwuhon 읽기 전용 조회 2026-10-21 PHT):
--   * 상품권 전용 무결성/보고 함수 없음 (store_commission_integrity_report 는 수수료·캐시 전용) → 관리자용 읽기 전용 함수 신설.
--   * 불일치 1건: product 2901c35b-6a56-4fb1-a9dd-029263780364 issued_count 26 · 인스턴스 46 (마지막 인스턴스 2026-09-17,
--     상품 updated_at 2026-08-28, archived 2026-08-28, 기준 이후 인스턴스 0). max_issuance 초과 0. 원인 NOT_PROVEN.
-- 판정: delta = issued_count - 인스턴스 수.
--   * delta = 0 → 정상 (보고하지 않음)
--   * delta <> 0 이고 기준(2026-10-20 20:30 UTC) 이후 생성 인스턴스 0 · 상품 updated_at < 기준 → legacy_preserved (D-5, 정리 안 함)
--   * 그 외 delta <> 0 → mismatch (신규 — 작성 경로를 특정해 수정할 대상)
--   기준 이후 변화가 있는 레거시 상품은 보수적으로 mismatch 로 보고한다(pre/post 인스턴스 수를 함께 반환해 판단 근거 제공).
-- 데이터 변경 0 · 발행 RPC 불변. 호출: service_role(관리자 서버 API) 전용.
-- 함수 본문에는 비 ASCII 문자를 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백: DROP FUNCTION IF EXISTS public.gift_certificate_issued_count_integrity_report();

CREATE OR REPLACE FUNCTION public.gift_certificate_issued_count_integrity_report()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cutoff AS (
    SELECT timestamptz '2026-10-20 20:30:00+00' AS at
  ),
  per_product AS (
    SELECT p.id AS product_id,
           p.title,
           coalesce(p.issued_count, 0) AS issued_count,
           p.max_issuance,
           p.updated_at,
           count(i.id)::integer AS instance_count,
           (count(i.id) FILTER (WHERE i.created_at < c.at))::integer AS pre_cutoff_instance_count,
           (count(i.id) FILTER (WHERE i.created_at >= c.at))::integer AS post_cutoff_instance_count,
           max(i.created_at) AS last_instance_at,
           c.at AS cutoff_at
      FROM public.gift_certificate_products p
      CROSS JOIN cutoff c
      LEFT JOIN public.gift_certificate_instances i ON i.product_id = p.id
     GROUP BY p.id, p.title, p.issued_count, p.max_issuance, p.updated_at, c.at
  ),
  classified AS (
    SELECT pp.*,
           pp.issued_count - pp.instance_count AS delta,
           CASE
             WHEN pp.post_cutoff_instance_count = 0 AND pp.updated_at < pp.cutoff_at THEN 'legacy_preserved'
             ELSE 'mismatch'
           END AS classification
      FROM per_product pp
     WHERE pp.issued_count <> pp.instance_count
  )
  SELECT jsonb_build_object(
    'ok', true,
    'check', 'issued_count_eq_instance_count',
    'cutoff_at', (SELECT at FROM cutoff),
    'mismatch_count', (SELECT count(*) FROM classified WHERE classification = 'mismatch'),
    'legacy_preserved_count', (SELECT count(*) FROM classified WHERE classification = 'legacy_preserved'),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'product_id', x.product_id,
               'title', x.title,
               'issued_count', x.issued_count,
               'instance_count', x.instance_count,
               'delta', x.delta,
               'max_issuance', x.max_issuance,
               'pre_cutoff_instance_count', x.pre_cutoff_instance_count,
               'post_cutoff_instance_count', x.post_cutoff_instance_count,
               'last_instance_at', x.last_instance_at,
               'product_updated_at', x.updated_at,
               'classification', x.classification
             ) ORDER BY x.classification, x.product_id)
        FROM classified x
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.gift_certificate_issued_count_integrity_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_issued_count_integrity_report() TO service_role;
