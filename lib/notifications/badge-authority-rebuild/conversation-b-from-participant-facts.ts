/**
 * Gate 3 Step 5/12 — Map participant unread Facts → Conversation B room inputs.
 * Loaders remain Fact producers; authority is resolveMemberConversationAuthority.
 *
 * Step 12: NEVER invent `*:room:{uuid}`. Missing identity → omit key (quarantine in resolver).
 */
import type { MemberConversationRoomInput } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import {
  isRoomUuidFallbackIdentityKey,
  normalizeConversationRoomsForAuthority,
} from "@/lib/notifications/badge-authority-rebuild/canonical-conversation-room-identity";

export type ParticipantUnreadRoomBags = Readonly<{
  memberId: string;
  generalDirect: ReadonlyArray<{
    roomId: string;
    unreadMessageCount: number;
    domainIdentityKey?: string;
    peerUserId?: string;
    latestMessageId?: string | null;
  }>;
  group: ReadonlyArray<{
    roomId: string;
    unreadMessageCount: number;
    domainIdentityKey?: string;
    groupId?: string;
    latestMessageId?: string | null;
  }>;
  trade: ReadonlyArray<{
    roomId: string;
    unreadMessageCount: number;
    domainIdentityKey?: string;
    listingId?: string;
    sellerId?: string;
    counterpartyId?: string;
    latestMessageId?: string | null;
  }>;
  customerOrder: ReadonlyArray<{
    roomId: string;
    unreadMessageCount: number;
    domainIdentityKey?: string;
    orderId?: string;
    latestMessageId?: string | null;
  }>;
  /** Explicitly excluded from B — must not be passed into customerOrder. */
  ownerOrder?: ReadonlyArray<{ roomId: string; unreadMessageCount: number }>;
}>;

function cleanIdentity(key: string | undefined): string | undefined {
  const k = String(key ?? "").trim();
  if (!k || isRoomUuidFallbackIdentityKey(k)) return undefined;
  return k;
}

/** Loaders already drop empty last_message phantoms; unread facts imply a tip exists. */
function tipId(unreadMessageCount: number, latestMessageId?: string | null): string | null {
  const explicit = String(latestMessageId ?? "").trim();
  if (explicit) return explicit;
  return unreadMessageCount > 0 ? "last_message" : null;
}

/**
 * Build raw room inputs (no invent). Prefer passing through `normalizeConversationRoomsForAuthority`
 * or `resolveMemberConversationAuthority` which quarantine incomplete rows.
 */
export function conversationRoomInputsFromParticipantFacts(
  bags: ParticipantUnreadRoomBags
): MemberConversationRoomInput[] {
  const memberId = bags.memberId.trim();
  const out: MemberConversationRoomInput[] = [];

  for (const r of bags.generalDirect) {
    out.push({
      roomId: r.roomId,
      chatDomain: "general_direct",
      unreadMessageCount: r.unreadMessageCount,
      latestMessageId: tipId(r.unreadMessageCount, r.latestMessageId),
      domainIdentityKey: cleanIdentity(r.domainIdentityKey),
      peerUserId: r.peerUserId,
      memberId,
    });
  }
  for (const r of bags.group) {
    const gid = String(r.groupId ?? r.roomId ?? "").trim();
    out.push({
      roomId: r.roomId,
      chatDomain: "group",
      unreadMessageCount: r.unreadMessageCount,
      latestMessageId: tipId(r.unreadMessageCount, r.latestMessageId),
      // group:{groupId} with groupId=roomId is canonical for this product.
      domainIdentityKey: cleanIdentity(r.domainIdentityKey) ?? (gid ? `group:${gid}` : undefined),
      groupId: gid || undefined,
      memberId,
    });
  }
  for (const r of bags.trade) {
    out.push({
      roomId: r.roomId,
      chatDomain: "trade",
      unreadMessageCount: r.unreadMessageCount,
      latestMessageId: tipId(r.unreadMessageCount, r.latestMessageId),
      domainIdentityKey: cleanIdentity(r.domainIdentityKey),
      listingId: r.listingId,
      sellerId: r.sellerId,
      counterpartyId: r.counterpartyId,
      memberId,
    });
  }
  for (const r of bags.customerOrder) {
    const key = cleanIdentity(r.domainIdentityKey);
    const orderFromKey =
      key && key.startsWith("store_order:")
        ? key.slice("store_order:".length).split(":")[0]?.trim()
        : "";
    const orderId = String(r.orderId ?? orderFromKey ?? "").trim() || undefined;
    out.push({
      roomId: r.roomId,
      chatDomain: "store_order_customer",
      unreadMessageCount: r.unreadMessageCount,
      latestMessageId: tipId(r.unreadMessageCount, r.latestMessageId),
      domainIdentityKey: key,
      orderId,
      memberId,
    });
  }
  void bags.ownerOrder;
  return out;
}

/** Fact bags → B-eligible rooms + quarantine diagnostics. */
export function conversationRoomsFromParticipantFactsNormalized(bags: ParticipantUnreadRoomBags): {
  rooms: MemberConversationRoomInput[];
  identityIncompleteCount: number;
  quarantined: ReturnType<typeof normalizeConversationRoomsForAuthority>["quarantined"];
} {
  const raw = conversationRoomInputsFromParticipantFacts(bags);
  const normalized = normalizeConversationRoomsForAuthority(bags.memberId, raw);
  return {
    rooms: normalized.rooms,
    identityIncompleteCount: normalized.identityIncompleteCount,
    quarantined: normalized.quarantined,
  };
}
