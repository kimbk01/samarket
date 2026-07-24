/**
 * Immutable domain envelope for room / call / push routing.
 * SSOT identity keys: lib/chat-domain/room-identity.ts (long-form).
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { isChatDomain } from "@/lib/chat-domain/chat-domain";

export type RoomDomainEnvelope = {
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  roomId: string;
};

/**
 * Call-session insert requires a proven room snapshot (no invent / no peer guess).
 * Template literal identities are documentation-level; runtime still validates via regex.
 */
export type CanonicalCallRoomContext =
  | {
      chatDomain: "general_direct";
      roomId: string;
      domainIdentityKey: string;
    }
  | {
      chatDomain: "group";
      roomId: string;
      domainIdentityKey: string;
      groupId: string;
    }
  | {
      chatDomain: "trade";
      roomId: string;
      domainIdentityKey: string;
      itemId: string;
      sellerId: string;
      buyerId: string;
    }
  | {
      chatDomain: "store_order";
      roomId: string;
      domainIdentityKey: string;
      orderId: string;
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

/** Canonical identity format for a known chat domain (call_sessions / rooms SSOT). */
export function isCanonicalDomainIdentityKey(domain: ChatDomain, key: string): boolean {
  const identity = key.trim();
  if (!identity) return false;
  if (domain === "general_direct") {
    const m = /^general_direct:([^:]+):([^:]+)$/.exec(identity);
    if (!m) return false;
    const a = m[1];
    const b = m[2];
    if (!a || !b || a === b) return false;
    return [a, b].sort()[0] === a;
  }
  if (domain === "group") return /^group:[^:\s]+$/.test(identity);
  if (domain === "trade") {
    if (identity.startsWith("trade:legacy:") || identity === "trade:legacy") return false;
    const m = /^trade:([^:]+):([^:]+):([^:]+)$/.exec(identity);
    if (!m) return false;
    const [, item, seller, buyer] = m;
    return !!(item && seller && buyer && seller !== buyer && item !== "legacy");
  }
  if (domain === "store_order") return /^store_order:[^:\s]+$/.test(identity);
  return false;
}

/**
 * Proven envelope from room columns only — used for call_sessions insert.
 * Does NOT invent from room_type / direct_key / peer pair.
 */
export function provenCanonicalRoomDomainEnvelopeFromDbRow(row: {
  id?: unknown;
  chat_domain?: unknown;
  domain_identity_key?: unknown;
  domain_identity?: unknown;
}): RoomDomainEnvelope | null {
  const roomId = trim(row.id);
  if (!roomId) return null;
  const domainRaw = trim(row.chat_domain);
  if (!isChatDomain(domainRaw)) return null;
  const key = trim(row.domain_identity_key) || trim(row.domain_identity);
  if (!isCanonicalDomainIdentityKey(domainRaw, key)) return null;
  return { chatDomain: domainRaw, domainIdentityKey: key, roomId };
}

export function toCanonicalCallRoomContext(envelope: RoomDomainEnvelope): CanonicalCallRoomContext | null {
  const { chatDomain, domainIdentityKey, roomId } = envelope;
  if (!isCanonicalDomainIdentityKey(chatDomain, domainIdentityKey)) return null;
  if (chatDomain === "general_direct") {
    return { chatDomain, roomId, domainIdentityKey };
  }
  if (chatDomain === "group") {
    const groupId = domainIdentityKey.slice("group:".length);
    if (!groupId) return null;
    return { chatDomain, roomId, domainIdentityKey, groupId };
  }
  if (chatDomain === "trade") {
    const m = /^trade:([^:]+):([^:]+):([^:]+)$/.exec(domainIdentityKey);
    if (!m) return null;
    return {
      chatDomain,
      roomId,
      domainIdentityKey,
      itemId: m[1],
      sellerId: m[2],
      buyerId: m[3],
    };
  }
  if (chatDomain === "store_order") {
    const orderId = domainIdentityKey.slice("store_order:".length);
    if (!orderId) return null;
    return { chatDomain, roomId, domainIdentityKey, orderId };
  }
  return null;
}

/**
 * Build envelope from a `community_messenger_rooms` row.
 * Returns null when domain cannot be proven (do not invent general_direct).
 * May recover group/store_order from room_type/direct_key for non-insert readers.
 * Call-session insert MUST use {@link provenCanonicalRoomDomainEnvelopeFromDbRow}.
 */
export function roomDomainEnvelopeFromDbRow(row: {
  id?: unknown;
  chat_domain?: unknown;
  domain_identity_key?: unknown;
  domain_identity?: unknown;
  room_type?: unknown;
  direct_key?: unknown;
}): RoomDomainEnvelope | null {
  const proven = provenCanonicalRoomDomainEnvelopeFromDbRow(row);
  if (proven) return proven;

  const roomId = trim(row.id);
  if (!roomId) return null;

  const roomType = trim(row.room_type);
  if (roomType === "private_group" || roomType === "open_group") {
    const key = `group:${roomId}`;
    if (isCanonicalDomainIdentityKey("group", key)) {
      return { chatDomain: "group", domainIdentityKey: key, roomId };
    }
  }
  const dk = trim(row.direct_key);
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) {
    const orderId = dk.split(":").slice(1).join(":").trim();
    if (orderId) {
      const key = `store_order:${orderId}`;
      if (isCanonicalDomainIdentityKey("store_order", key)) {
        return { chatDomain: "store_order", domainIdentityKey: key, roomId };
      }
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
