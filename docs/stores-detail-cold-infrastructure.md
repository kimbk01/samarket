# 상세 cold 인프라 (summary / menus ~400ms)

## 1. 첫 cold 400ms대 — 구성

| 구간 | summary | menus |
|------|---------|-------|
| stores.slug gate | 1× `getApprovedStoreBySlug` | 1× (얇은 select) |
| meta | `loadStoreCommerceMeta` 4 count 병렬 | 동일 (캐시·singleflight) |
| products | — | 1× `store_products` 최대 120행 |
| popular | — | 1× RPC `get_store_popular_product_stats` |
| 앱 캐시 | 45s server + 30s meta bundle | 45s server + 60s popular |

**병렬:** summary `store ∥ auth`, meta∥menus 동시 진입 시 meta bundle singleflight.

**측정:**

```bash
npm run measure:store-detail-infrastructure
# 서버 로그: [store-summary-perf], [delivery-menus-api-breakdown]
```

**목표:** cold DB 합산을 250~350ms로 낮추려면 (1) Vercel↔Supabase 동일 리전 (2) 아래 인덱스 적용 (3) popular RPC 실측 후 필요 시 집계 캐시.

---

## 2. popular stats RPC

- 함수: `get_store_popular_product_stats(p_store_id, p_since, p_limit)`
- 마이그레이션: `20260515211000_store_popular_menu_stats_rpc.sql`
- 인덱스: `idx_store_orders_store_created_status`, `idx_store_order_items_product`
- 추가(20260822120000): `idx_store_order_items_order_id_product` — join `order_id`

**실측 (스크립트):** `supabase_direct.popular_rpc` ms

**EXPLAIN (Supabase SQL Editor):**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM get_store_popular_product_stats(
  'YOUR-STORE-UUID'::uuid,
  now() - interval '30 days',
  5
);
```

주문이 거의 없는 매장은 RPC &lt; 50ms, 많으면 100~300ms+ 가능 → `queryStorePopularMenuStatsCached` 60s TTL.

---

## 3. `stores.slug` 인덱스

**앱 쿼리:** `.eq('slug', $slug).maybeSingle()` + `approval_status === 'approved'` && `is_visible === true` (앱 필터)

**확인 SQL:**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'stores'
ORDER BY indexname;
```

**기대:**

- `UNIQUE (slug)` 또는 `stores_public_slug_lookup_idx` (partial, approved+visible)
- `EXPLAIN` 에서 `Index Scan` / `Index Only Scan` on slug (Seq Scan 이면 마이그레이션 미적용)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, slug FROM stores
WHERE slug = 'your-slug'
  AND approval_status = 'approved'
  AND is_visible = true
LIMIT 1;
```

마이그레이션: `supabase/migrations/20260822120000_stores_slug_gate_popular_stats_perf.sql`

---

## 4. Vercel / Supabase region RTT

**관측 API:** `GET /api/perf/prod-region-context`  
(서버에 `SAMARKET_PROD_PERF_MEASURE=1` 또는 development)

```json
{
  "vercel_region": "icn1",
  "supabase_region": "ap-northeast-2",
  "same_region": true
}
```

**summary 응답 헤더 (measure 모드):**

- `x-samarket-actual-handler-ms` — 전체 핸들러
- `x-samarket-db-execution-ms` — cold DB 구간( summary fetcher )
- `x-samarket-cache-hit` — 0/1

**로컬 `npm run start`:** `same_region` 이 false여도 **client wall** 에 LAN+Supabase RTT 포함 → prod 배포 URL로 재측정.

```bash
SAMARKET_BASE_URL=https://YOUR.vercel.app npm run measure:store-detail-infrastructure
npm run measure:delivery-flow-prod
npm run measure:cart-page-phases
npm run measure:prod-same-region
```

**카트 HTML 구간 분리:** `npm run measure:cart-page-phases` — `ttfb_ms` · `html_download_ms` · embedded `rsc_ms` · (Playwright) `hydration_ms`.  
**로그인 flow:** `tests/e2e/.auth/cm-storage.json` 또는 `SAMARKET_MEASURE_COOKIE` 설정 후 `measure:delivery-flow-prod`.

**해석:**

| same_region | typical 추가 RTT |
|-------------|------------------|
| true | ~5–30ms (풀러 1 hop) |
| false (예: Vercel ICN ↔ Supabase US) | +100–250ms **per round-trip** |

summary cold 쿼리 5~6 RTT → 리전 불일치 시 **+500ms** 체감 가능.

**조치:** Supabase Dashboard → Project Settings → Infrastructure region 과 Vercel Function region 일치(필리핀/한국 사용자면 `ap-southeast-1` / `ap-northeast-2` 등 한 쌍으로 고정).

현재 `.env` 프로젝트 ref: `ckdosyydvgzqwpbwuhon` — 리전은 대시보드에서 확인 (호스트명만으로는 부족).
