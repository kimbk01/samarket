# store_browse_cards projection (미적용 — cold >400ms 지속 시)

현재 cold 경로는 `stores` + `store_products(is_featured)` + taxonomy TTL 캐시로 축소했다.
`[browse-perf-steps-v2]` 에서 `base_query_ms` 가 250ms 이상이고 product 제거 후에도 목표(250~400ms)를 넘기면 아래를 검토한다.

## 제안: `store_browse_cards` (view 또는 materialized table)

| 컬럼 | 용도 |
|------|------|
| store_id, slug, store_name | 카드·링크 |
| profile_image_url | 아바타 |
| primary_slug, sub_slug, topic_slug | 필터·라벨 |
| region, city, district, lat, lng | 정렬·거리 |
| rating_avg, review_count | 카드 (reviews aggregate 금지) |
| delivery/pickup/visit/reservation flags | 뱃지 |
| commerce_json | `business_hours_json` 에서 파싱된 카드용 최소 스냅샷 |
| is_featured, is_open, business_status | 정렬 |
| featured_product_ids / featured_preview_json | 선택: 상품 1~3개 스냅샷 |

## route fallback

1. `FROM store_browse_cards WHERE …` (인덱스: category+visibility)
2. miss/마이그레이션 전: 기존 `stores` + related 쿼리 (현행)

## 인덱스 (이미 적용됨)

`supabase/migrations/20260516180000_stores_browse_list_perf.sql`
