import {
  sellerListingStateMessageKey,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";
import type { TradeChatListTranslate } from "@/lib/community-messenger/trade-chat-list/view-model";

const BADGE_BASE =
  "inline-block max-w-full truncate whitespace-nowrap rounded-[6px] px-1.5 py-px sam-text-xxs font-semibold leading-none";

const BADGE_BY_STATE: Record<SellerListingState, string> = {
  inquiry: `${BADGE_BASE} bg-[#006241] text-white`,
  negotiating: `${BADGE_BASE} border border-[#006241] bg-white text-[#006241]`,
  reserved: `${BADGE_BASE} border border-[#FACC15] bg-[#FFF7E6] text-[#A16207]`,
  completed: `${BADGE_BASE} border border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280]`,
};

export function tradeChatListStatusBadgePresentation(
  listingState: SellerListingState,
  t: TradeChatListTranslate
): { label: string; className: string } {
  const key = sellerListingStateMessageKey(listingState);
  return {
    label: t(key),
    className: BADGE_BY_STATE[listingState],
  };
}
