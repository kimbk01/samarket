/**
 * Normalize / stabilize trade list DTO for cache paint.
 * Recomputes viewerRole from seller/buyer identity — never defaults to buyer.
 */
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import type { SoCustomerListDto } from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import { sortTradeListRows } from "@/lib/messenger/trade/list-sort-filter";
import { selectLatestRowByActivityAt } from "@/lib/messenger/contracts/latest-activity-selector";
import { resolveTradeViewerRole } from "@/lib/messenger/trade/viewer-role";
import { parseTradeIdentityKey } from "@/lib/messenger/trade/identity";

export type StabilizeTradeListResult = {
  dto: TradeListDto;
  droppedInvalidCount: number;
  reconstructedRoleCount: number;
  needsBackgroundRefetch: boolean;
};

type TradeListRow = TradeListDto["rows"][number];
type StabilizedTradeRow = TradeListRow & {
  sellerUserId: string;
  buyerUserId: string;
  viewerRole: "seller" | "buyer";
};

function resolvePartiesForRow(row: TradeListRow): {
  sellerUserId: string;
  buyerUserId: string;
  itemId: string;
} | null {
  const seller = (row.sellerUserId ?? "").trim();
  const buyer = (row.buyerUserId ?? "").trim();
  const itemId = (row.itemId ?? "").trim();
  if (seller && buyer && itemId) {
    return { sellerUserId: seller, buyerUserId: buyer, itemId };
  }
  try {
    const parsed = parseTradeIdentityKey((row.domainIdentityKey ?? "").trim());
    return {
      sellerUserId: parsed.sellerUserId,
      buyerUserId: parsed.counterpartyUserId,
      itemId: parsed.itemId || itemId,
    };
  } catch {
    return null;
  }
}

/**
 * Drop invalid rows; recompute viewerRole from parties + viewerUserId.
 * DO NOT use `viewerRole ?? "buyer"`.
 */
export function stabilizeTradeListDto(body: TradeListDto): StabilizeTradeListResult {
  const viewerUserId = (body.viewerUserId ?? "").trim();
  let droppedInvalidCount = 0;
  let reconstructedRoleCount = 0;
  const kept: StabilizedTradeRow[] = [];

  for (const r of body.rows) {
    const parties = resolvePartiesForRow(r);
    if (!parties || !viewerUserId) {
      droppedInvalidCount += 1;
      console.warn("[TRADE_PARTICIPANT_MISMATCH]", {
        reason: "missing_parties_or_viewer",
        roomId: r.roomId,
        viewerUserId: viewerUserId || null,
      });
      continue;
    }
    const role = resolveTradeViewerRole({
      viewerUserId,
      sellerId: parties.sellerUserId,
      buyerId: parties.buyerUserId,
    });
    if (!role) {
      droppedInvalidCount += 1;
      console.warn("[TRADE_PARTICIPANT_MISMATCH]", {
        reason: "viewer_not_party",
        roomId: r.roomId,
        viewerUserId,
        sellerId: parties.sellerUserId,
        buyerId: parties.buyerUserId,
      });
      continue;
    }
    const hadRole = r.viewerRole === "seller" || r.viewerRole === "buyer";
    if (!hadRole || r.viewerRole !== role) {
      reconstructedRoleCount += 1;
    }
    kept.push({
      ...r,
      itemId: parties.itemId || r.itemId,
      sellerUserId: parties.sellerUserId,
      buyerUserId: parties.buyerUserId,
      viewerRole: role,
      needsResponse: r.needsResponse ?? r.unreadCount > 0,
    });
  }

  const rows = sortTradeListRows(kept);
  const unreadRoomCount = rows.filter((r) => r.unreadCount > 0).length;
  const activityLatest = selectLatestRowByActivityAt(rows, (r) => ({
    activityAt: r.lastMessageAt,
    tieKey: r.roomId,
  }));
  const dto: TradeListDto = {
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

  return {
    dto,
    droppedInvalidCount,
    reconstructedRoleCount,
    needsBackgroundRefetch: droppedInvalidCount > 0,
  };
}

/** Backward-compatible wrapper — returns DTO only (callers that ignore diagnostics). */
export function stabilizeTradeListDtoOnly(body: TradeListDto): TradeListDto {
  return stabilizeTradeListDto(body).dto;
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
      x.viewerRole !== y.viewerRole ||
      x.sellerUserId !== y.sellerUserId ||
      x.buyerUserId !== y.buyerUserId
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
