# 거래 마켓 피드 계약 (Trade market feed contract)

## 근본 원인 (이번에 정리한 정의)

마켓 탭(`/market/[id]`)은 처음에 **홈용** `resolveHomePostsPayload` → `loadHomePostsPage` 경로와 묶여 있었다. 이 경로는:

- `HOME_POSTS_SELECT_TIERS`로 컬럼 폴백을 여러 번 시도하고,
- PostgREST `and` 조합이 **거래 전용** `fetchPostsRangeForTradeCategories`와 구현이 다르며,
- `posts_masked` / 스키마 차이 시 **한쪽만 빈 결과**가 나올 수 있었다.

반면 관리자 상품 목록·`trade-expand-ids`는 **`trade_category_id` 집합**을 기준으로 하고, 실제 목록 API로 검증된 것은 **`/api/trade/feed` → `fetchTradeFeedPage` → `fetchPostsRangeForTradeCategories`** 체인이었다.

즉, **“임시로 다른 API를 썼다”가 아니라**, 마켓·무한스크롤·bootstrap 첫 화면은 **거래 피드 전용 쿼리 모듈**을 단일 소스로 두는 것이 맞다. 홈 전체(`/home` · `tradeMarketParent` 없음)는 `GET /api/home/posts`가 담당한다.

## 단일 소스 (Canonical)

| 역할 | 구현 |
|------|------|
| 마켓 목록·페이지네이션·bootstrap `initialFeed` | `GET /api/trade/feed` → `fetchTradeFeedPage` → `lib/posts/trade-posts-range-query.ts` |
| 카테고리 트리 확장 (루트 아래 하위 id) | `fetchTradeCategoryDescendantNodes` + `computeMarketFilterIds` (또는 `expandTradeCategoryIdsForRoot`) |
| 홈 “전체” 등 (거래 부모 없음) | `GET /api/home/posts` → `resolveHomePostsPayload` |

클라이언트: 비주제·비알바 마켓은 `PostListByCategory`가 `getPostsByTradeCategoryIds`만 사용한다 (`getPostsForHome`의 `tradeMarketParent` 경로는 마켓과 섞지 않음).

## URL·마켓 세그먼트

거래 루트가 **같은 slug**를 쓰면 `/market/[slug]` 가 충돌하므로, 링크는 **`/market/{categoryId}` (UUID)** 를 쓴다 (`lib/categories/tradeMarketPath.ts`, `getCategoryHref`).

## 규모가 커질 때 예상 이슈 (현재 완화·향후 작업)

1. **PostgREST URL 길이**  
   `trade_category_id.in.(uuid,uuid,…)` 가 수백 개면 프록시/게이트웨이 한도에 걸릴 수 있다.  
   **대응**: `lib/posts/trade-posts-category-filter.ts` 에서 id 를 **청크(기본 64개)** 로 나눠 `or(trade…in chunk1, category…in chunk1, …)` 형태로 보낸다. 홈 거래 필터·마켓 피드 **동일** 규칙.

2. **오프셋 페이지네이션**  
   `page`·`range(from,to)` 는 깊은 페이지에서 비용이 커진다.  
   **향후**: `created_at` + `id` 커서 기반 API (또는 RPC) 검토.

3. **카테고리 BFS**  
   `fetchTradeCategoryDescendantNodes` 는 깊이 상한이 있다. 루트당 하위 노드가 매우 많으면 요청당 DB 왕복이 늘어난다.  
   **향후**: 머티리얼라이즈드 경로·`ltree`·서버 캐시(Redis 등) 검토.

4. **DB 인덱스**  
   목록 정렬이 `created_at DESC` 위주이면 `(trade_category_id, created_at DESC)` 등 부분 인덱스가 유리하다. 운영 DB에서 `EXPLAIN` 으로 확인 권장.

5. **클라이언트 중복 요청**  
   탭 전환 시 이전 `fetch` 가 늦게 끝나면 스테일 결과를 그릴 수 있다. `CategoryListLayout` 등에서 **AbortController** 로 취소한다.

## 관련 파일

- `lib/posts/trade-posts-range-query.ts` — 마켓 목록 쿼리
- `lib/posts/trade-posts-category-filter.ts` — 상태+카테고리 `and` 문자열·청크
- `lib/posts/home-posts-query-server.ts` — 홈 전용 (거래 부모 필터 시에도 위와 동일 청크 규칙)
- `app/api/trade/feed/route.ts`
- `app/api/categories/market-bootstrap/route.ts`
- `lib/trade/trade-market-catalog.ts`
