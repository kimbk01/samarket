/**
 * Gate 3 Step 5 — Canonical Member Conversation Authority (B).
 *
 * B = B_general + B_group + B_trade + B_order
 * Room row = unreadMessageCount
 * Parent / hub = count(rooms where unreadMessageCount > 0)
 *
 * DO NOT include: owner order rooms, A events, orphan missed, store ops.
 * DO NOT wire App Icon / Native here (Step 6).
 */
import { memberBadgeIdentity } from "@/lib/notifications/badge-authority-rebuild/badge-authority-identity";
import {
  resolveCanonicalConversationRoomIdentity,
} from "@/lib/notifications/badge-authority-rebuild/canonical-conversation-room-identity";

export const MEMBER_CONVERSATION_B_AUTHORITY =
  "member_conversation_b_authority_v1" as const;

export type MemberConversationBDomain =
  | "general_direct"
  | "group"
  | "trade"
  | "store_order_customer";

export type MemberConversationRoomInput = Readonly<{
  roomId: string;
  chatDomain: MemberConversationBDomain | "store_order_owner" | string;
  /** Gate 2 domain identity; if omitted, derived when enough fields present. */
  domainIdentityKey?: string | null;
  unreadMessageCount: number;
  lastReadMessageId?: string | null;
  latestMessageId?: string | null;
  /** Participant member; required for membership filter when set. */
  memberId?: string | null;
  leftAt?: string | null;
  deletedAt?: string | null;
  /** Optional identity parts when domainIdentityKey missing. */
  peerUserId?: string | null;
  groupId?: string | null;
  listingId?: string | null;
  sellerId?: string | null;
  counterpartyId?: string | null;
  orderId?: string | null;
  /** Room-bound missed markers (timeline) — still B via room unread only. */
  includesRoomBoundMissedCall?: boolean;
}>;

export type MemberConversationRoomAuthority = Readonly<{
  roomId: string;
  chatDomain: MemberConversationBDomain;
  domainIdentityKey: string;
  unreadMessageCount: number;
  lastReadMessageId: string | null;
  latestMessageId: string | null;
}>;

export type MemberConversationAuthority = Readonly<{
  authority: typeof MEMBER_CONVERSATION_B_AUTHORITY;
  memberKey: `user:${string}`;
  generalUnreadRooms: number;
  groupUnreadRooms: number;
  tradeUnreadRooms: number;
  orderUnreadRooms: number;
  totalUnreadRooms: number;
  rooms: readonly MemberConversationRoomAuthority[];
  authorityVersion: string;
  computedAt: string;
}>;

export type MemberConversationBSurfaces = Readonly<{
  bottomChat: number;
  tradeHub: number;
  orderHub: number;
  /** Full member B (no App Icon wiring). */
  conversationB: number;
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function isBlank(v: unknown): boolean {
  return v == null || String(v).trim() === "";
}

function normalizeDomain(
  raw: string
): MemberConversationBDomain | "store_order_owner" | null {
  const d = String(raw ?? "").trim();
  if (d === "general_direct") return "general_direct";
  if (d === "group") return "group";
  if (d === "trade") return "trade";
  if (d === "store_order_customer" || d === "store_order") return "store_order_customer";
  if (d === "store_order_owner") return "store_order_owner";
  return null;
}

/**
 * Gate 3 Step 12 — never returns `*:room:{uuid}` invent keys.
 * Uses canonical resolver (canonical | adapted | null when quarantined).
 */
export function buildConversationDomainIdentityKey(
  row: MemberConversationRoomInput,
  memberId: string
): string | null {
  const resolved = resolveCanonicalConversationRoomIdentity(row, memberId);
  if (resolved.status === "quarantined") return null;
  return resolved.domainIdentityKey;
}

function isEligibleRoom(
  row: MemberConversationRoomInput,
  memberId: string
): boolean {
  const domain = normalizeDomain(String(row.chatDomain ?? ""));
  if (!domain || domain === "store_order_owner") return false;
  if (!isBlank(row.leftAt)) return false;
  if (!isBlank(row.deletedAt)) return false;
  const rowMember = String(row.memberId ?? "").trim();
  if (rowMember && memberId.trim() && rowMember !== memberId.trim()) return false;
  if (!String(row.roomId ?? "").trim()) return false;
  if (!buildConversationDomainIdentityKey(row, memberId)) return false;
  return true;
}

/**
 * Canonical B from room facts (already scoped / joined).
 * Dedupes by domainIdentityKey (first non-zero unread wins; later duplicates skipped).
 */
export function resolveMemberConversationAuthority(
  memberId: string,
  rooms: readonly MemberConversationRoomInput[],
  opts?: { computedAt?: string }
): MemberConversationAuthority {
  const computedAt = opts?.computedAt ?? new Date().toISOString();
  const member = memberBadgeIdentity(memberId);
  const memberKey: `user:${string}` =
    member.ok && member.identity.scope === "member"
      ? member.identity.key
      : `user:${String(memberId ?? "").trim()}`;

  const chosen = new Map<string, MemberConversationRoomAuthority>();
  const order: string[] = [];

  for (const row of rooms) {
    if (!isEligibleRoom(row, memberId)) continue;
    const domain = normalizeDomain(String(row.chatDomain ?? "")) as MemberConversationBDomain;
    const domainIdentityKey = buildConversationDomainIdentityKey(row, memberId)!;
    const unreadMessageCount = nonNeg(row.unreadMessageCount);
    if (chosen.has(domainIdentityKey)) continue;
    const room: MemberConversationRoomAuthority = {
      roomId: String(row.roomId).trim(),
      chatDomain: domain === "store_order_customer" ? "store_order_customer" : domain,
      domainIdentityKey,
      unreadMessageCount,
      lastReadMessageId: row.lastReadMessageId != null ? String(row.lastReadMessageId) : null,
      latestMessageId: row.latestMessageId != null ? String(row.latestMessageId) : null,
    };
    chosen.set(domainIdentityKey, room);
    order.push(domainIdentityKey);
  }

  const authRooms = order.map((k) => chosen.get(k)!);
  let generalUnreadRooms = 0;
  let groupUnreadRooms = 0;
  let tradeUnreadRooms = 0;
  let orderUnreadRooms = 0;
  for (const r of authRooms) {
    if (r.unreadMessageCount <= 0) continue;
    // Phantom: unread_count>0 but no tip message — not a B room.
    if (isBlank(r.latestMessageId)) continue;
    if (r.chatDomain === "general_direct") generalUnreadRooms += 1;
    else if (r.chatDomain === "group") groupUnreadRooms += 1;
    else if (r.chatDomain === "trade") tradeUnreadRooms += 1;
    else if (r.chatDomain === "store_order_customer") orderUnreadRooms += 1;
  }
  const totalUnreadRooms =
    generalUnreadRooms + groupUnreadRooms + tradeUnreadRooms + orderUnreadRooms;

  const tip = authRooms.find((r) => r.unreadMessageCount > 0);
  const authorityVersion = `${computedAt}#b${totalUnreadRooms}#${tip?.domainIdentityKey ?? ""}#${
    tip?.unreadMessageCount ?? 0
  }`;

  return {
    authority: MEMBER_CONVERSATION_B_AUTHORITY,
    memberKey,
    generalUnreadRooms,
    groupUnreadRooms,
    tradeUnreadRooms,
    orderUnreadRooms,
    totalUnreadRooms,
    rooms: authRooms,
    authorityVersion,
    computedAt,
  };
}

export function projectSurfacesFromConversationAuthority(
  auth: MemberConversationAuthority
): MemberConversationBSurfaces {
  /** Bottom Chat = 일반+그룹+거래+주문(고객) unread room count (not message sum). */
  return {
    bottomChat:
      auth.generalUnreadRooms +
      auth.groupUnreadRooms +
      auth.tradeUnreadRooms +
      auth.orderUnreadRooms,
    tradeHub: auth.tradeUnreadRooms,
    orderHub: auth.orderUnreadRooms,
    conversationB: auth.totalUnreadRooms,
  };
}

/** Parent never equals Σ unread messages. */
export function sumUnreadMessages(auth: MemberConversationAuthority): number {
  return auth.rooms.reduce((acc, r) => acc + nonNeg(r.unreadMessageCount), 0);
}

/**
 * Pure apply: recipient receives a new message in a room (canonical store confirmed).
 * Sender's own message must not call this for the sender memberId.
 */
export function applyIncomingMessageToConversationRooms(
  memberId: string,
  rooms: readonly MemberConversationRoomInput[],
  patch: {
    roomId: string;
    messageId: string;
    senderId: string;
    chatDomain: MemberConversationBDomain;
    domainIdentityKey?: string | null;
    peerUserId?: string | null;
    groupId?: string | null;
    listingId?: string | null;
    sellerId?: string | null;
    counterpartyId?: string | null;
    orderId?: string | null;
  }
): MemberConversationRoomInput[] {
  if (patch.senderId.trim() === memberId.trim()) {
    return rooms.map((r) => ({ ...r }));
  }
  const next = rooms.map((r) => ({ ...r }));
  const idx = next.findIndex((r) => String(r.roomId).trim() === patch.roomId.trim());
  if (idx >= 0) {
    const cur = next[idx]!;
    next[idx] = {
      ...cur,
      unreadMessageCount: nonNeg(cur.unreadMessageCount) + 1,
      latestMessageId: patch.messageId,
    };
    return next;
  }
  next.push({
    roomId: patch.roomId,
    chatDomain: patch.chatDomain,
    domainIdentityKey: patch.domainIdentityKey,
    unreadMessageCount: 1,
    latestMessageId: patch.messageId,
    lastReadMessageId: null,
    memberId,
    peerUserId: patch.peerUserId,
    groupId: patch.groupId,
    listingId: patch.listingId,
    sellerId: patch.sellerId,
    counterpartyId: patch.counterpartyId,
    orderId: patch.orderId,
  });
  return next;
}

/**
 * Pure apply: server read ACK success → room unread N→0 (idempotent).
 */
export function applyReadAckToConversationRooms(
  rooms: readonly MemberConversationRoomInput[],
  patch: {
    roomId: string;
    lastReadMessageId: string;
    /** When false, no mutation (ACK failed / timeline not mounted). */
    serverAckOk: boolean;
  }
): MemberConversationRoomInput[] {
  if (!patch.serverAckOk) return rooms.map((r) => ({ ...r }));
  return rooms.map((r) => {
    if (String(r.roomId).trim() !== patch.roomId.trim()) return { ...r };
    return {
      ...r,
      unreadMessageCount: 0,
      lastReadMessageId: patch.lastReadMessageId,
    };
  });
}

/**
 * Missed XOR helper: orphan call ids must not appear as B room identities.
 * Room-bound missed contributes only via room unreadMessageCount.
 */
export function assertMissedCallXorWithConversationB(input: {
  orphanMissedCallIds: readonly string[];
  authority: MemberConversationAuthority;
  /** call ids that are represented only as room timeline unread (optional). */
  roomBoundMissedCallIdsInRooms?: readonly string[];
}): { ok: true } | { ok: false; reason: string } {
  const orphan = new Set(
    input.orphanMissedCallIds.map((x) => String(x).trim()).filter(Boolean)
  );
  for (const id of input.roomBoundMissedCallIdsInRooms ?? []) {
    if (orphan.has(String(id).trim())) {
      return { ok: false, reason: "MISSED_CALL_IN_A_AND_B" };
    }
  }
  for (const room of input.authority.rooms) {
    // Orphan ids must never be used as room identity keys
    if (orphan.has(room.domainIdentityKey) || orphan.has(room.roomId)) {
      return { ok: false, reason: "ORPHAN_MISSED_AS_B_ROOM" };
    }
  }
  return { ok: true };
}
