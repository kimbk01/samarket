import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import type { SoCustomerListDto } from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";

/**
 * Home hub pillar preview and Domain list 1행 must share this order.
 * lastMessageAt desc, roomId asc — then hub.latestRoomId + hub.previewText = rows[0].
 */

export function stabilizeTradeListDto(body: TradeListDto): TradeListDto {
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
      // Realtime list patch + hub pillar SSOT: hub.previewText must follow rows[0].
      previewText: (top?.previewText ?? body.hub.previewText ?? "").trim(),
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
