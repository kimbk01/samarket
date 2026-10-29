-- v4 W5 · PERF-12 (2026-10-29 PHT) — 배달 검색 `%q%` ILIKE 용 trigram GIN 인덱스.
--
-- 검색 쿼리 (lib/delivery/search/search-delivery.ts):
--   stores          .or(store_name.ilike."%q%", description.ilike."%q%")
--   store_products  .or(title.ilike."%q%",      summary.ilike."%q%")
--   OR 조건은 두 컬럼 모두 인덱스가 있어야 BitmapOr 로 인덱스를 쓸 수 있어 stores.description 도 함께 만든다.
-- 운영 확인(READ ONLY, 2026-10-29): pg_trgm 1.6 이 extensions 스키마에 설치됨, 위 4개 컬럼 trigram 인덱스 없음.
--   테이블 크기 작음(stores 52행, store_products 667행 · 936 kB) → 일반 CREATE INDEX 잠금 시간 짧음.
--
-- 롤백:
--   drop index if exists public.idx_store_products_title_trgm;
--   drop index if exists public.idx_store_products_summary_trgm;
--   drop index if exists public.idx_stores_store_name_trgm;
--   drop index if exists public.idx_stores_description_trgm;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_store_products_title_trgm
  ON public.store_products USING gin (title extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_store_products_summary_trgm
  ON public.store_products USING gin (summary extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_stores_store_name_trgm
  ON public.stores USING gin (store_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_stores_description_trgm
  ON public.stores USING gin (description extensions.gin_trgm_ops);
