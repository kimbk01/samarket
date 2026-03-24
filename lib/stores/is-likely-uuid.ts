/** 시뮬 주문 id(`sim_…`)와 구분해 실 DB `store_orders.id`(UUID)로 추정될 때 마이페이지 안내용 */
export function isLikelyUuid(id: string): boolean {
  const s = id.trim();
  if (!s || s.startsWith("sim_")) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
