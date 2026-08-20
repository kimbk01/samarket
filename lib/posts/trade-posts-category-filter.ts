/**
 * 거래 `posts` 목록용 PostgREST `and=(or(상태),or(카테고리…))` 문자열 생성.
 *
 * - 마켓 피드(`fetchPostsRangeForTradeCategories`)·홈 거래 부모 필터(`loadHomePostsPage`)가 **동일 규칙**을 쓴다.
 * - 카테고리 id 가 매우 많을 때 한 `in.(…)` 가 URL 길이 한도를 넘지 않도록 **청크 OR** 로 나눈다.
 *
 * 계약·역사: `docs/trade-market-feed-contract.md`
 */

/** UUID 문자열 기준 청크 — PostgREST 프록시 URL 길이·쿼리 플래너 부담 완화 */
export const POSTGREST_TRADE_CATEGORY_IN_CHUNK_SIZE = 64;

const DEFAULT_STATUS_OR = "status.is.null,status.not.in.(hidden,sold)";

/**
 * 거래 목록 카테고리 필터 — Production `posts` authority 는 `trade_category_id` 만.
 * 존재하지 않는 `posts.category_id` 를 넣어 42703 fail→retry 하지 않는다.
 */
export function buildTradePostsStatusAndCategoryAndFilter(
  tradeCategoryIds: string[],
  statusOrInner: string = DEFAULT_STATUS_OR
): string {
  return buildTradePostsStatusAndTradeCategoryOnlyAndFilter(tradeCategoryIds, statusOrInner);
}

/**
 * `trade_category_id` 청크 OR (홈·마켓 피드 동일).
 */
export function buildTradePostsStatusAndTradeCategoryOnlyAndFilter(
  tradeCategoryIds: string[],
  statusOrInner: string = DEFAULT_STATUS_OR
): string {
  const cleaned = [...new Set(tradeCategoryIds.map((x) => x.trim()).filter(Boolean))];
  if (cleaned.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < cleaned.length; i += POSTGREST_TRADE_CATEGORY_IN_CHUNK_SIZE) {
    const csv = cleaned.slice(i, i + POSTGREST_TRADE_CATEGORY_IN_CHUNK_SIZE);
    parts.push(`trade_category_id.in.(${csv})`);
  }
  return `(or(${statusOrInner}),or(${parts.join(",")}))`;
}
