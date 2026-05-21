# Owner products list GET — slim snapshot perf lock

`GET /api/me/stores/[storeId]/products` — 매장 오너 상품 목록.

**계약:** 응답 JSON shape(필드 키)·상품 상세 semantics·주문·realtime·UI·mark_read/bootstrap/unread **불변**.

## 구조 (고정 PASS)

| 항목 | 기준 |
|------|------|
| `options_embed` | **0** |
| `images_embed` | **0** |
| `payload_kb` | **≤ 50** |
| warm `products_query_ms` | **0** (`products_list_cache_hit=1`) |
| warm `sections_query_ms` | **0** |
| warm `categories_query_ms` | **0** |
| warm `actual_db_queries_count` | **0** |
| warm `early_return_from_cache` | **1** |
| PATCH/POST 후 첫 GET | `products_list_cache_hit=0` (invalidate) |
| rewarm GET | 위 warm PASS + `total_ms` 목표 |

**금지:** `options_json`·`images_json`·`description_html`·PostgREST embed fan-out.

## 구현

| 레이어 | 모듈 |
|--------|------|
| slim list | `lib/stores/owner-products-list-snapshot.ts` |
| auth | `validateActiveSessionLightDeduped` + 5s TTL |
| ownership | `getCachedStoreIfOwner` 30s TTL |
| list cache | `globalThis` 30s TTL · POST/PATCH `invalidateOwnerProductsListCache` |

## Dev 로그

```text
[owner-products-perf] { auth_ms, auth_cache_hit, ownership_ms, ownership_cache_hit, products_list_cache_hit, products_query_ms, sections_query_ms, categories_query_ms, early_return_from_cache, actual_db_queries_count, cache_lookup_ms, payload_kb, ... }
[owner-products-perf-lock] { code, severity: "warn"|"fail", ... }
```

### WARN vs FAIL (`local_linked`)

| 구간 | severity | code 예시 |
|------|----------|-----------|
| Run1 cold | **warn** | `cold_slow`, `auth_cold` |
| Run2 transitional | **warn** | `auth_transitional`, `warm_transitional_slow` |
| Run3 warm | **pass** | (없음) |
| rewarm | **pass** / fail | `rewarm_slow` if `total_ms` > 50 |
| 구조 위반 | **fail** | `embed_still_included`, `list_cache_hit_but_query_ms_nonzero`, `cache_invalidate_broken` |

**Run3 warm = 공식 PASS 라인** (허브 연속 조회 3회째 패턴).

## SLO

| 환경 | cold (warn) | Run3 warm (pass) | rewarm (pass) |
|------|-------------|------------------|---------------|
| `local_linked` | total > **500ms** warn | total ≤ **250ms** | total ≤ **50ms** |
| `prod_same_region` | total > **250ms** warn | total ≤ **100ms** | total ≤ **50ms** |

`prod_same_region` 측정:

```bash
SAMARKET_PERF_ENV=prod_same_region npm run verify:owner-products-perf
```

## 검증

```bash
npm run verify:owner-products-perf
```

스크립트는 요청 전 `.next/dev/logs/next-development.log` 바이트 오프셋을 잡고, 이후 추가분만 파싱한다(터미널 stdout은 fallback). Next dev 로그는 `[owner-products-perf] "{\"...\"}"` 이스케이프 형식이므로 `scripts/owner-products-perf-lock.mjs` `parseOwnerProductsPerfLogs`가 quoted·raw `{...}` 둘 다 처리한다.

1. GET ×3 — Run3 `early_return_from_cache=1`, query ms 전부 0.
2. PATCH `sort_order` — 다음 GET `products_list_cache_hit=0`.
3. GET — rewarm PASS, `total_ms` ≤ 50ms (`local_linked`).

## 회귀 FAIL 분류

- `embed_still_included` / `payload_too_large`
- `list_cache_hit_but_query_ms_nonzero` (DB 재실행 또는 cold timing 잔상)
- `auth_cache_miss` / `list_cache_miss` (Run3)
- `actual_db_queries_on_warm`
- `cache_invalidate_broken`
- `rewarm_slow`
