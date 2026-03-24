import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

export function reservedBuyerIdFromPost(post: Record<string, unknown> | null | undefined): string | null {
  const v = post?.reserved_buyer_id;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** 예약이 잡혀 있고, 이 채팅방의 구매자가 예약자가 아닌 경우 → 신규 메시지 차단 */
export function shouldBlockItemTradeMessagingForReservation(
  post: Record<string, unknown> | null | undefined,
  roomBuyerId: string | null | undefined
): boolean {
  const rid = reservedBuyerIdFromPost(post);
  if (!rid) return false;
  const listing = normalizeSellerListingState(
    post?.seller_listing_state as string | undefined,
    post?.status as string | undefined
  );
  if (listing !== "reserved") return false;
  const bid = typeof roomBuyerId === "string" ? roomBuyerId.trim() : "";
  if (!bid) return false;
  return bid !== rid;
}

/** 구매자가 상세에서 채팅하기 시도 시 — 예약자가 아니면 차단 */
export function shouldBlockNewItemChatForBuyer(
  post: Record<string, unknown> | null | undefined,
  buyerId: string | null | undefined
): boolean {
  return shouldBlockItemTradeMessagingForReservation(post, buyerId);
}
