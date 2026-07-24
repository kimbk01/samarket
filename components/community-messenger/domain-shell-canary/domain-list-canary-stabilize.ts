import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import type { SoCustomerListDto } from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import { sortTradeListRows } from "@/lib/messenger/trade/list-sort-filter";
import { selectLatestRowByActivityAt } from "@/lib/messenger/contracts/latest-activity-selector";

/**
 * Trade list: unread/needsResponse first, then lastMessageAt.
 * Hub latest = max activity (not necessarily rows[0] after unread sort).
 */

export function stabilizeTradeListDto(body: TradeListDto): TradeListDto {
  const rows = sortTradeListRows(
    body.rows.map((r) => ({
      ...r,
      viewerRole: r.viewerRole === "seller" || r.viewerRole === "buyer" ? r.viewerRole : "buyer",
      needsResponse: r.needsResponse ?? r.unreadCount > 0,
    }))
  );
  const unreadRoomCount = rows.filter((r) => r.unreadCount > 0).length;
  const activityLatest = selectLatestRowByActivityAt(rows, (r) => ({
    activityAt: r.lastMessageAt,
    tieKey: r.roomId,
  }));
  return {
    ...body,
    rows,
    hub: {
      ...body.hub,
      roomCount: rows.length,
      unreadRoomCount,
      latestRoomId: activityLatest?.roomId ?? null,
      previewText: (activityLatest?.previewText ?? body.hub.previewText ?? "").trim(),
    },
  };
}

export function stabilizeSoCustomerListDto(body: SoCustomerListDto): SoCustomerListDto {
  const rows = [...body.rows].sort((a, b) => {
    const ta = Date.parse(a.lastMessageAt) || 0;
    const tb = Date.parse(b.lastMessageAt) || 0;
    if (tb !== ta) return tb - ta;
    return a.roomId.localeCompare(b.roomId);
  });
  const unreadRoomCount = rows.filter((r) => r.unreadCount > 0).length;
  const top = rows[0];
  return {
    ...body,
    rows,
    hub: {
      ...body.hub,
      roomCount: rows.length,
      unreadRoomCount,
      latestRoomId: top?.roomId ?? null,
      previewText: (top?.previewText ?? body.hub.previewText ?? "").trim(),
    },
  };
}

/** Remount revalidate 결과가 화면과 같으면 setDto 스킵 (리스트 락). */
export function domainTradeListPaintEqual(a: TradeListDto | null, b: TradeListDto): boolean {
  if (!a || a.viewerUserId !== b.viewerUserId) return false;
  if (a.rows.length !== b.rows.length) return false;
  if (a.hub.unreadRoomCount !== b.hub.unreadRoomCount) return false;
  for (let i = 0; i < a.rows.length; i++) {
    const x = a.rows[i]!;
    const y = b.rows[i]!;
    if (
      x.roomId !== y.roomId ||
      x.unreadCount !== y.unreadCount ||
      x.lastMessageAt !== y.lastMessageAt ||
      (x.previewText ?? "") !== (y.previewText ?? "") ||
      (x.statusBadge ?? "") !== (y.statusBadge ?? "") ||
      x.viewerRole !== y.viewerRole
    ) {
      return false;
    }
  }
  return true;
}

export function domainSoCustomerListPaintEqual(
  a: SoCustomerListDto | null,
  b: SoCustomerListDto
): boolean {
  if (!a || a.viewerUserId !== b.viewerUserId) return false;
  if (a.rows.length !== b.rows.length) return false;
  if (a.hub.unreadRoomCount !== b.hub.unreadRoomCount) return false;
  for (let i = 0; i < a.rows.length; i++) {
    const x = a.rows[i]!;
    const y = b.rows[i]!;
    if (
      x.roomId !== y.roomId ||
      x.unreadCount !== y.unreadCount ||
      x.lastMessageAt !== y.lastMessageAt ||
      (x.previewText ?? "") !== (y.previewText ?? "")
    ) {
      return false;
    }
  }
  return true;
}
