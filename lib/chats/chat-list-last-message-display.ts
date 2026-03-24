import type { ChatRoom } from "@/lib/types/chat";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

/** 채팅에서 판매자 단계 변경 시 삽입되는 시스템 안내 접두 */
const LISTING_CHANGE_NOTICE_RE = /^제품의 상태가 .+으로 변경되었습니다\.?$/;

/**
 * 거래 채팅 목록: 글/거래는 완료됐는데 DB last_message_preview 가
 * 이전 단계(예약중 등) 시스템 안내로 남은 경우 표시만 보정합니다.
 */
export function tradeChatListLastMessageDisplay(room: ChatRoom): string {
  const raw = (room.lastMessage ?? "").trim();
  const product = room.product;
  const listingState = normalizeSellerListingState(
    room.tradeStatus ?? product?.sellerListingState,
    product?.status
  );
  const postStatus = (product?.status ?? "").toLowerCase();
  const tradeDone = postStatus === "sold" || listingState === "completed";

  if (!tradeDone || !raw) return raw;
  if (!LISTING_CHANGE_NOTICE_RE.test(raw)) return raw;
  if (raw.includes("거래완료")) return raw;
  return "거래가 완료되었습니다.";
}
