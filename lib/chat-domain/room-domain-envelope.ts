/**
 * Immutable domain envelope for room / call / push routing.
 * SSOT identity keys: lib/chat-domain/room-identity.ts (long-form).
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type RoomDomainEnvelope = {
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  roomId: string;
};

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isCommerceDirectKey(dk: string): boolean {
  return (
    dk.startsWith("trade_pc:") ||
    dk.startsWith("trade_item:") ||
    dk.startsWith("store_order:") ||
    dk.startsWith("trade_order:")
  );
}

/**
 * Build envelope from a `community_messenger_rooms` row.
 * Returns null when domain cannot be proven (do not invent general_direct).
 */
export function roomDomainEnvelopeFromDbRow(row: {
  id?: unknown;
  chat_domain?: unknown;
  domain_identity_key?: unknown;
  domain_identity?: unknown;
  room_type?: unknown;
  direct_key?: unknown;
}): RoomDomainEnvelope | null {
  const roomId = trim(row.id);
  if (!roomId) return null;
  const domain = trim(row.chat_domain) as ChatDomain | "";
  const key = trim(row.domain_identity_key) || trim(row.domain_identity);
  if (
    (domain === "general_direct" ||
      domain === "group" ||
      domain === "trade" ||
      domain === "store_order") &&
    key
  ) {
    return { chatDomain: domain, domainIdentityKey: key, roomId };
  }
  const roomType = trim(row.room_type);
  if (roomType === "private_group" || roomType === "open_group") {
    return { chatDomain: "group", domainIdentityKey: `group:${roomId}`, roomId };
  }
  const dk = trim(row.direct_key);
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) {
    const orderId = dk.split(":").slice(1).join(":").trim();
    if (orderId) {
      return { chatDomain: "store_order", domainIdentityKey: `store_order:${orderId}`, roomId };
    }
  }
  if (isCommerceDirectKey(dk) && (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:"))) {
    /** Trade identity needs item×seller×buyer — refuse to invent from ledger key alone. */
    return null;
  }
  return null;
}

/** Flatten envelope into notification / FCM meta (snake + camel for native parsers). */
export function domainEnvelopeToPushMeta(envelope: RoomDomainEnvelope): Record<string, string> {
  return {
    chat_domain: envelope.chatDomain,
    chatDomain: envelope.chatDomain,
    domain_identity_key: envelope.domainIdentityKey,
    domainIdentityKey: envelope.domainIdentityKey,
    room_id: envelope.roomId,
    roomId: envelope.roomId,
  };
}
