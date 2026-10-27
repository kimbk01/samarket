/**
 * 메신저 거래 방 헤더 아래 「거래 행동 줄」 노출 판정.
 * P-1 (2026-10-27, Owner 승인 v3 · Marketplace 방식): 판매자 상태는 판매중 ⇄ 판매완료 두 가지뿐이고
 * 예약·문의중·구매자 거래완료 확인·후기는 필수가 아니다 → 판매자에게만 「판매완료로 변경 / 다시 판매중으로」 한 줄.
 * 구매자에게는 행동 줄을 보이지 않는다(판매완료 여부는 헤더·시스템 메시지로 안다).
 */
export type MessengerTradeActionStripKind = "seller_sold_toggle" | null;

export function resolveMessengerTradeActionStripKind(input: {
  viewerUserId: string;
  sellerId: string;
  hasProduct: boolean;
}): MessengerTradeActionStripKind {
  const viewer = input.viewerUserId.trim();
  if (!viewer || !input.hasProduct) return null;
  return input.sellerId === viewer ? "seller_sold_toggle" : null;
}
