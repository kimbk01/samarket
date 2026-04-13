/**
 * 마켓 피드: 상위 카테고리 + 하위 주제 + ?topic= 에 따른 trade_category_id 목록.
 * `MarketCategoryFeed` · `/api/categories/market-bootstrap` 에서 동일 로직 유지.
 *
 * `activeChildren` 은 **루트 아래 모든 깊이의 활성 trade 하위 id/slug**(show_in_home_chips 와 무관).
 * 직계만 넣으면 리프 UUID 로 저장된 글이 마켓 탭에서 빠지고, `/home` 전체 피드와만 불일치함.
 */

export function computeMarketFilterIds(params: {
  parentCategoryId: string;
  /** 직계 활성 하위 전체 — 칩 노출용 목록과 동일하면 안 됨 */
  activeChildren: { id: string; slug?: string | null }[];
  /** `?topic=` 값 (이미 NFC 정규화된 문자열 권장) */
  topicParam: string;
}): string[] {
  const { parentCategoryId, activeChildren, topicParam } = params;
  if (!activeChildren.length) return [parentCategoryId];
  if (!topicParam.trim()) {
    return [parentCategoryId, ...activeChildren.map((c) => c.id)];
  }
  const topicChild = activeChildren.find((c) => {
    const slug = c.slug?.trim().normalize("NFC");
    return (slug && slug === topicParam) || c.id === topicParam;
  });
  if (topicChild) return [topicChild.id];
  return [parentCategoryId, ...activeChildren.map((c) => c.id)];
}
