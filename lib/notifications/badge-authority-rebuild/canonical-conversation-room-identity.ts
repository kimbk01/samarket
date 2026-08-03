/**
 * Gate 3 Step 12 — Canonical Conversation Room Identity resolver.
 *
 * `*:room:{uuid}` is NEVER promoted to Conversation B / Owner C authority.
 * Incomplete rooms → quarantine (excluded from parent/row B counts).
 */

import {
  generalDirectRoomIdentity,
  groupRoomIdentity,
  storeOrderRoomIdentity,
  tradeRoomIdentity,
} from "@/lib/chat-domain/room-identity";
import type {
  MemberConversationBDomain,
  MemberConversationRoomInput,
} from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";

export const CANONICAL_CONVERSATION_ROOM_IDENTITY =
  "canonical_conversation_room_identity_v1" as const;

export type ConversationIdentityQuarantineReason =
  | "MISSING_CHAT_DOMAIN"
  | "MISSING_DOMAIN_IDENTITY_FIELDS"
  | "ROOM_UUID_FALLBACK"
  | "OWNER_MEMBER_SCOPE_AMBIGUOUS"
  | "TRADE_PARTICIPANT_AMBIGUOUS"
  | "ORDER_SCOPE_AMBIGUOUS"
  | "OWNER_IN_MEMBER_B"
  | "IDENTITY_DOMAIN_MISMATCH";

export type CanonicalConversationIdentityStatus =
  | "canonical"
  | "adapted"
  | "quarantined";

export type CanonicalConversationRoomIdentityResult = Readonly<{
  status: CanonicalConversationIdentityStatus;
  chatDomain: MemberConversationBDomain | null;
  domainIdentityKey: string | null;
  roomId: string;
  reason: ConversationIdentityQuarantineReason | "OK" | "ADAPTED";
}>;

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeDomain(
  raw: string
): MemberConversationBDomain | "store_order_owner" | null {
  const d = trim(raw);
  if (d === "general_direct") return "general_direct";
  if (d === "group") return "group";
  if (d === "trade") return "trade";
  if (d === "store_order_customer" || d === "store_order") return "store_order_customer";
  if (d === "store_order_owner") return "store_order_owner";
  return null;
}

/** Detect domain:room:{id} invent / UUID-as-identity fallback. */
export function isRoomUuidFallbackIdentityKey(key: string | null | undefined): boolean {
  const k = trim(key);
  if (!k) return false;
  if (/^(general_direct|group|trade|store_order):room:/i.test(k)) return true;
  // Bare room:uuid used as domain key
  if (/^room:[0-9a-f-]{8,}$/i.test(k)) return true;
  return false;
}

function looksCanonicalGeneral(key: string): boolean {
  // general_direct:{uuid}:{uuid}
  return /^general_direct:[^:]+:[^:]+$/.test(key) && !key.includes(":room:");
}

function looksCanonicalGroup(key: string): boolean {
  return /^group:[^:]+$/.test(key);
}

function looksCanonicalTrade(key: string): boolean {
  return /^trade:[^:]+:[^:]+:[^:]+$/.test(key) && !key.includes(":room:");
}

function looksCanonicalStoreOrder(key: string): boolean {
  return /^store_order:[^:]+$/.test(key) && !key.startsWith("store_order:room:");
}

function tryAdaptFromFields(
  domain: MemberConversationBDomain,
  row: MemberConversationRoomInput,
  memberId: string
): string | null {
  try {
    if (domain === "general_direct") {
      const peer = trim(row.peerUserId);
      if (!peer || !memberId) return null;
      return generalDirectRoomIdentity(memberId, peer).identityKey;
    }
    if (domain === "group") {
      const gid = trim(row.groupId) || trim(row.roomId);
      if (!gid) return null;
      return groupRoomIdentity(gid).identityKey;
    }
    if (domain === "trade") {
      const listingId = trim(row.listingId);
      const sellerId = trim(row.sellerId);
      const counterpartyId = trim(row.counterpartyId);
      if (!listingId || !sellerId || !counterpartyId) return null;
      return tradeRoomIdentity({
        itemId: listingId,
        sellerId,
        buyerId: counterpartyId,
      }).identityKey;
    }
    if (domain === "store_order_customer") {
      const orderId = trim(row.orderId);
      if (!orderId) return null;
      // orderId must not be a silent room UUID stand-in without store_order: prefix proof
      return storeOrderRoomIdentity(orderId).identityKey;
    }
  } catch {
    return null;
  }
  return null;
}

function domainMatchesKey(domain: MemberConversationBDomain, key: string): boolean {
  if (domain === "general_direct") return looksCanonicalGeneral(key);
  if (domain === "group") return looksCanonicalGroup(key);
  if (domain === "trade") return looksCanonicalTrade(key);
  if (domain === "store_order_customer") return looksCanonicalStoreOrder(key);
  return false;
}

/**
 * Normalize one room fact before Conversation B aggregation.
 */
export function resolveCanonicalConversationRoomIdentity(
  fact: MemberConversationRoomInput,
  memberId: string
): CanonicalConversationRoomIdentityResult {
  const roomId = trim(fact.roomId);
  const domain = normalizeDomain(String(fact.chatDomain ?? ""));

  if (!roomId) {
    return {
      status: "quarantined",
      chatDomain: null,
      domainIdentityKey: null,
      roomId: "",
      reason: "MISSING_DOMAIN_IDENTITY_FIELDS",
    };
  }

  if (!domain) {
    return {
      status: "quarantined",
      chatDomain: null,
      domainIdentityKey: null,
      roomId,
      reason: "MISSING_CHAT_DOMAIN",
    };
  }

  if (domain === "store_order_owner") {
    return {
      status: "quarantined",
      chatDomain: null,
      domainIdentityKey: null,
      roomId,
      reason: "OWNER_IN_MEMBER_B",
    };
  }

  const existing = trim(fact.domainIdentityKey);
  if (existing && isRoomUuidFallbackIdentityKey(existing)) {
    const adapted = tryAdaptFromFields(domain, fact, memberId);
    if (adapted) {
      return {
        status: "adapted",
        chatDomain: domain,
        domainIdentityKey: adapted,
        roomId,
        reason: "ADAPTED",
      };
    }
    return {
      status: "quarantined",
      chatDomain: domain,
      domainIdentityKey: null,
      roomId,
      reason: "ROOM_UUID_FALLBACK",
    };
  }

  if (existing && domainMatchesKey(domain, existing)) {
    return {
      status: "canonical",
      chatDomain: domain,
      domainIdentityKey: existing,
      roomId,
      reason: "OK",
    };
  }

  if (existing && !domainMatchesKey(domain, existing)) {
    // Wrong domain prefix or ambiguous — try adapt from fields; else quarantine
    const adapted = tryAdaptFromFields(domain, fact, memberId);
    if (adapted) {
      return {
        status: "adapted",
        chatDomain: domain,
        domainIdentityKey: adapted,
        roomId,
        reason: "ADAPTED",
      };
    }
    return {
      status: "quarantined",
      chatDomain: domain,
      domainIdentityKey: null,
      roomId,
      reason: "IDENTITY_DOMAIN_MISMATCH",
    };
  }

  const adapted = tryAdaptFromFields(domain, fact, memberId);
  if (adapted) {
    return {
      status: "adapted",
      chatDomain: domain,
      domainIdentityKey: adapted,
      roomId,
      reason: "ADAPTED",
    };
  }

  if (domain === "trade") {
    return {
      status: "quarantined",
      chatDomain: domain,
      domainIdentityKey: null,
      roomId,
      reason: "TRADE_PARTICIPANT_AMBIGUOUS",
    };
  }
  if (domain === "store_order_customer") {
    return {
      status: "quarantined",
      chatDomain: domain,
      domainIdentityKey: null,
      roomId,
      reason: "ORDER_SCOPE_AMBIGUOUS",
    };
  }

  return {
    status: "quarantined",
    chatDomain: domain,
    domainIdentityKey: null,
    roomId,
    reason: "MISSING_DOMAIN_IDENTITY_FIELDS",
  };
}

export type ConversationIdentityNormalizeBatch = Readonly<{
  rooms: MemberConversationRoomInput[];
  quarantined: ReadonlyArray<{
    roomId: string;
    reason: ConversationIdentityQuarantineReason;
  }>;
  identityIncompleteCount: number;
}>;

/** Filter + normalize inputs for resolveMemberConversationAuthority. */
export function normalizeConversationRoomsForAuthority(
  memberId: string,
  rooms: readonly MemberConversationRoomInput[]
): ConversationIdentityNormalizeBatch {
  const out: MemberConversationRoomInput[] = [];
  const quarantined: Array<{ roomId: string; reason: ConversationIdentityQuarantineReason }> = [];

  for (const row of rooms) {
    const resolved = resolveCanonicalConversationRoomIdentity(row, memberId);
    if (resolved.status === "quarantined" || !resolved.domainIdentityKey || !resolved.chatDomain) {
      quarantined.push({
        roomId: resolved.roomId || trim(row.roomId),
        reason: (resolved.reason === "OK" || resolved.reason === "ADAPTED"
          ? "MISSING_DOMAIN_IDENTITY_FIELDS"
          : resolved.reason) as ConversationIdentityQuarantineReason,
      });
      continue;
    }
    out.push({
      ...row,
      chatDomain: resolved.chatDomain,
      domainIdentityKey: resolved.domainIdentityKey,
      roomId: resolved.roomId,
      memberId: memberId,
    });
  }

  return {
    rooms: out,
    quarantined,
    identityIncompleteCount: quarantined.length,
  };
}
