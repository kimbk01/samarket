import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  resolveTradeChatListListingState,
  type TradeChatListTranslate,
} from "@/lib/community-messenger/trade-chat-list/trade-chat-list-resolve";

/** 상단 1줄 필터 — 전체 / 진행중 / 완료 */
export type TradeChatProgressFilter = "all" | "active" | "completed";

const ACTIVE_STATES: SellerListingState[] = ["inquiry", "negotiating", "reserved"];

export function tradeChatListingMatchesProgressFilter(
  listingState: SellerListingState,
  filter: TradeChatProgressFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return listingState === "completed";
  return ACTIVE_STATES.includes(listingState);
}

export function filterTradeChatListItems(args: {
  items: UnifiedRoomListItem[];
  progressFilter: TradeChatProgressFilter;
  t: TradeChatListTranslate;
}): UnifiedRoomListItem[] {
  const { items, progressFilter, t } = args;
  if (progressFilter === "all") return items;
  return items.filter((item) => {
    const state = resolveTradeChatListListingState(item.room, t);
    return tradeChatListingMatchesProgressFilter(state, progressFilter);
  });
}

export type TradeChatFilterChipOption = {
  id: TradeChatProgressFilter;
  labelKey: MessageKey;
};

export const TRADE_CHAT_PROGRESS_FILTER_CHIPS: readonly TradeChatFilterChipOption[] = [
  { id: "all", labelKey: "cm_trade_chat_filter_all" },
  { id: "active", labelKey: "cm_trade_chat_filter_active" },
  { id: "completed", labelKey: "cm_trade_chat_filter_completed" },
] as const;

export function activeTradeChatFilterSummaryLabel(args: {
  progressFilter: TradeChatProgressFilter;
  t: TradeChatListTranslate;
}): string | null {
  const { progressFilter, t } = args;
  if (progressFilter === "all") return null;
  const chip = TRADE_CHAT_PROGRESS_FILTER_CHIPS.find((c) => c.id === progressFilter);
  return chip ? t(chip.labelKey) : null;
}

export {
  resolveTradeChatListListingState,
  resolveTradeChatListViewerRole,
} from "@/lib/community-messenger/trade-chat-list/trade-chat-list-resolve";

export type { CommunityMessengerRoomSummary };
