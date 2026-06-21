import { resolveCommerceChatListPresentation } from "@/lib/community-messenger/commerce-chat-list-presentation";
import { messengerTradeViewerRoleFromContextMeta } from "@/lib/community-messenger/messenger-trade-viewer-role";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  SELLER_LISTING_LABEL,
  sellerListingStateMessageKey,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";
import type { MessageKey } from "@/lib/i18n/messages";

export type TradeChatListTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function resolveTradeChatListListingState(
  room: CommunityMessengerRoomSummary,
  t: TradeChatListTranslate
): SellerListingState {
  const presentation = resolveCommerceChatListPresentation(room);
  if (presentation.statusLabelKey === "chats_trade_list_sold_completed_label") {
    return "completed";
  }

  const ctx = room.contextMeta?.kind === "trade" ? room.contextMeta : null;
  const itemStateLabel = ctx?.itemStateLabel?.trim() ?? "";
  if (!itemStateLabel) return "inquiry";

  const candidates: SellerListingState[] = ["inquiry", "negotiating", "reserved", "completed"];
  for (const state of candidates) {
    const key = sellerListingStateMessageKey(state);
    if (itemStateLabel === t(key) || itemStateLabel === SELLER_LISTING_LABEL[state]) {
      return state;
    }
  }
  return "inquiry";
}

export function resolveTradeChatListViewerRole(
  room: CommunityMessengerRoomSummary,
  viewerUserId: string | null | undefined
): "seller" | "buyer" | null {
  const fromMeta = messengerTradeViewerRoleFromContextMeta(
    room.contextMeta?.kind === "trade" ? room.contextMeta : null
  );
  if (fromMeta) return fromMeta;

  const uid = typeof viewerUserId === "string" ? viewerUserId.trim() : "";
  if (!uid) return null;
  const ctx = room.contextMeta?.kind === "trade" ? room.contextMeta : null;
  if (!ctx) return null;
  const sellerId = ctx.sellerId?.trim() ?? "";
  const buyerId = ctx.buyerId?.trim() ?? "";
  if (sellerId && sellerId === uid) return "seller";
  if (buyerId && buyerId === uid) return "buyer";
  return null;
}

export function resolveTradeChatListStatusLabel(
  room: CommunityMessengerRoomSummary,
  listingState: SellerListingState,
  t: TradeChatListTranslate
): string {
  const presentation = resolveCommerceChatListPresentation(room);
  if (presentation.statusLabelKey) return t(presentation.statusLabelKey);
  return t(sellerListingStateMessageKey(listingState));
}
