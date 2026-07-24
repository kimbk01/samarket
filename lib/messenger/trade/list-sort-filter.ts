/**
 * Trade list role filter + sort — one authority list, selector only.
 */
import type { TradeViewerRole } from "@/lib/messenger/trade/viewer-role";

export type TradeListRoleFilter = "all" | "selling" | "buying";

export type TradeListSortableRow = {
  roomId: string;
  unreadCount: number;
  lastMessageAt: string;
  needsResponse?: boolean;
  hasPendingAction?: boolean;
  viewerRole: TradeViewerRole;
};

export function tradeListRowMatchesRoleFilter(
  viewerRole: TradeViewerRole,
  filter: TradeListRoleFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "selling") return viewerRole === "seller";
  return viewerRole === "buyer";
}

export function filterTradeListRowsByRole<T extends TradeListSortableRow>(
  rows: ReadonlyArray<T>,
  filter: TradeListRoleFilter
): T[] {
  if (filter === "all") return [...rows];
  return rows.filter((r) => tradeListRowMatchesRoleFilter(r.viewerRole, filter));
}

/**
 * needsResponse → unread → pending action → lastActivity desc → roomId asc
 */
export function compareTradeListSortKeys(a: TradeListSortableRow, b: TradeListSortableRow): number {
  const aNeeds = a.needsResponse === true ? 1 : a.unreadCount > 0 ? 1 : 0;
  const bNeeds = b.needsResponse === true ? 1 : b.unreadCount > 0 ? 1 : 0;
  if (bNeeds !== aNeeds) return bNeeds - aNeeds;
  if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
  const aPend = a.hasPendingAction ? 1 : 0;
  const bPend = b.hasPendingAction ? 1 : 0;
  if (bPend !== aPend) return bPend - aPend;
  const ta = Date.parse(a.lastMessageAt) || 0;
  const tb = Date.parse(b.lastMessageAt) || 0;
  if (tb !== ta) return tb - ta;
  return a.roomId.localeCompare(b.roomId);
}

export function sortTradeListRows<T extends TradeListSortableRow>(rows: ReadonlyArray<T>): T[] {
  return [...rows].sort(compareTradeListSortKeys);
}
