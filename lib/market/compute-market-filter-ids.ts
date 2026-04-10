/**
 * 마켓 피드: 상위 카테고리 + 하위 주제 + ?topic= 에 따른 trade_category_id 목록.
 * `MarketCategoryFeed` · `/api/categories/market-bootstrap` 에서 동일 로직 유지.
 */

export function computeMarketFilterIds(params: {
  parentCategoryId: string;
  children: { id: string; slug?: string | null }[];
  /** `?topic=` 값 (이미 NFC 정규화된 문자열 권장) */
  topicParam: string;
}): string[] {
  const { parentCategoryId, children, topicParam } = params;
  if (!children.length) return [parentCategoryId];
  if (!topicParam.trim()) {
    return [parentCategoryId, ...children.map((c) => c.id)];
  }
  const topicChild = children.find((c) => {
    const slug = c.slug?.trim().normalize("NFC");
    return (slug && slug === topicParam) || c.id === topicParam;
  });
  if (topicChild) return [topicChild.id];
  return [parentCategoryId, ...children.map((c) => c.id)];
}
