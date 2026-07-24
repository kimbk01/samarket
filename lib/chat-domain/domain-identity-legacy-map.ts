/**
 * Phase C — legacy direct_key / room_type ↔ planned domain columns.
 * Runtime SSOT identity = `lib/chat-domain/room-identity.ts` (long-form keys).
 * DO NOT re-infer domain at list time after columns are populated.
 * docs/community-messenger/2026-07-23-four-domain-phase-c.md
 */

import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  generalDirectRoomIdentity,
  groupRoomIdentity,
  storeOrderRoomIdentity,
  tradeRoomIdentity,
} from "@/lib/chat-domain/room-identity";

export type PlannedRoomDomainColumns = {
  chat_domain: ChatDomain;
  domain_identity: string;
};

/** GD: DB `direct_key` is sorted pair without domain prefix. Accept long-form + legacy `gd:`. */
export function legacyGeneralDirectKeyFromIdentity(domainIdentity: string): string | null {
  const id = domainIdentity.trim();
  let rest = "";
  if (id.startsWith("general_direct:")) {
    rest = id.slice("general_direct:".length);
  } else if (id.startsWith("gd:")) {
    rest = id.slice(3);
  } else {
    return null;
  }
  const parts = rest.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]].sort().join(":");
}

export function plannedColumnsForGeneralDirect(userA: string, userB: string): PlannedRoomDomainColumns {
  const id = generalDirectRoomIdentity(userA, userB);
  return {
    chat_domain: id.domain,
    domain_identity: id.identityKey,
  };
}

export function plannedColumnsForGroup(roomId: string): PlannedRoomDomainColumns {
  const id = groupRoomIdentity(roomId);
  return {
    chat_domain: id.domain,
    domain_identity: id.identityKey,
  };
}

export function plannedColumnsForTrade(
  itemId: string,
  sellerId: string,
  buyerId: string,
): PlannedRoomDomainColumns {
  const id = tradeRoomIdentity({ itemId, sellerId, buyerId });
  return {
    chat_domain: id.domain,
    domain_identity: id.identityKey,
  };
}

export function plannedColumnsForStoreOrderRoom(orderId: string): PlannedRoomDomainColumns {
  const id = storeOrderRoomIdentity(orderId);
  return {
    chat_domain: id.domain,
    domain_identity: id.identityKey,
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
