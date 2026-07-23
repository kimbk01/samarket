/**
 * Phase C — legacy direct_key / room_type ↔ freeze domain_identity.
 * DO NOT use as runtime Domain SSOT after columns are populated (fail-closed on mismatch).
 * docs/community-messenger/2026-07-23-four-domain-phase-c.md
 */

import {
  buildGeneralDirectIdentity,
  buildGroupIdentity,
  buildStoreOrderRoomIdentity,
  buildTradeIdentity,
  type ChatDomain,
} from "@/lib/chat-domain/four-domain-freeze";

export type PlannedRoomDomainColumns = {
  chat_domain: ChatDomain;
  domain_identity: string;
};

/** GD: DB today stores sorted pair without `gd:` prefix. */
export function legacyGeneralDirectKeyFromIdentity(domainIdentity: string): string | null {
  const id = domainIdentity.trim();
  if (!id.startsWith("gd:")) return null;
  const rest = id.slice(3);
  const parts = rest.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]].sort().join(":");
}

export function plannedColumnsForGeneralDirect(userA: string, userB: string): PlannedRoomDomainColumns {
  return {
    chat_domain: "general_direct",
    domain_identity: buildGeneralDirectIdentity(userA, userB),
  };
}

export function plannedColumnsForGroup(roomId: string): PlannedRoomDomainColumns {
  return {
    chat_domain: "group",
    domain_identity: buildGroupIdentity(roomId),
  };
}

export function plannedColumnsForTrade(
  itemId: string,
  sellerId: string,
  buyerId: string,
): PlannedRoomDomainColumns {
  return {
    chat_domain: "trade",
    domain_identity: buildTradeIdentity(itemId, sellerId, buyerId),
  };
}

export function plannedColumnsForStoreOrderRoom(orderId: string): PlannedRoomDomainColumns {
  return {
    chat_domain: "store_order",
    domain_identity: buildStoreOrderRoomIdentity(orderId),
  };
}

/**
 * Classify legacy row → planned columns when possible.
 * Returns null when trade needs item×seller×buyer join (do not guess from trade_pc id).
 */
export function inferPlannedColumnsFromLegacyRoom(row: {
  id: string;
  room_type: string | null | undefined;
  direct_key: string | null | undefined;
}): PlannedRoomDomainColumns | null {
  const roomType = (row.room_type ?? "").trim();
  const dk = (row.direct_key ?? "").trim();
  const id = row.id.trim();
  if (!id) return null;

  if (roomType === "private_group" || roomType === "open_group") {
    return plannedColumnsForGroup(id);
  }

  if (roomType === "direct" && dk) {
    if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) {
      const orderId = dk.split(":").slice(1).join(":").trim();
      if (!orderId) return null;
      return plannedColumnsForStoreOrderRoom(orderId);
    }
    if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) {
      return null;
    }
    const parts = dk.split(":");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return plannedColumnsForGeneralDirect(parts[0], parts[1]);
    }
  }
  return null;
}
