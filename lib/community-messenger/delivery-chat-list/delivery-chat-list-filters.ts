import type { MessageKey } from "@/lib/i18n/messages";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import { isStoreOrderTerminalStatus } from "@/lib/stores/store-order-process-model";
import { resolveDeliveryChatListOrderStatusRaw } from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-resolve";

/** 거래 채팅과 동일 — 전체 / 진행중 / 완료 */
export type DeliveryChatProgressFilter = "all" | "active" | "completed";

export function deliveryChatOrderInCompletedBucket(orderStatusRaw: string): boolean {
  const raw = orderStatusRaw.trim();
  if (!raw) return false;
  return raw === "completed" || isStoreOrderTerminalStatus(raw);
}

export function deliveryChatOrderMatchesProgressFilter(
  orderStatusRaw: string,
  filter: DeliveryChatProgressFilter
): boolean {
  if (filter === "all") return true;
  const done = deliveryChatOrderInCompletedBucket(orderStatusRaw);
  if (filter === "completed") return done;
  return !done;
}

export function filterDeliveryChatListItems(args: {
  items: UnifiedRoomListItem[];
  progressFilter: DeliveryChatProgressFilter;
}): UnifiedRoomListItem[] {
  const { items, progressFilter } = args;
  if (progressFilter === "all") return items;
  return items.filter((item) => {
    const raw = resolveDeliveryChatListOrderStatusRaw(item.room);
    return deliveryChatOrderMatchesProgressFilter(raw, progressFilter);
  });
}

export type DeliveryChatFilterChipOption = {
  id: DeliveryChatProgressFilter;
  labelKey: MessageKey;
};

export const DELIVERY_CHAT_PROGRESS_FILTER_CHIPS: readonly DeliveryChatFilterChipOption[] = [
  { id: "all", labelKey: "cm_delivery_chat_filter_all" },
  { id: "active", labelKey: "cm_delivery_chat_filter_active" },
  { id: "completed", labelKey: "cm_delivery_chat_filter_completed" },
] as const;

export function activeDeliveryChatFilterSummaryLabel(args: {
  progressFilter: DeliveryChatProgressFilter;
  t: (key: MessageKey) => string;
}): string | null {
  const { progressFilter, t } = args;
  if (progressFilter === "all") return null;
  const chip = DELIVERY_CHAT_PROGRESS_FILTER_CHIPS.find((c) => c.id === progressFilter);
  return chip ? t(chip.labelKey) : null;
}
