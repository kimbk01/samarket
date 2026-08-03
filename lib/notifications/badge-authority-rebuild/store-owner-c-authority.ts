/**
 * Gate 3 Step 7 — Store Owner Authority (C).
 *
 * recipient = store:{storeId}
 * C_operational = unfinished Action Required items
 * C_chat        = unread owner order-chat room count
 *
 * Surfaces (activeStoreId only):
 *   Owner Ops FAB/Hub  ← C_operational (orders ± inquiry per product split)
 *   Owner Chat FAB/Hub ← C_chat
 *   Owner order row    ← ops row + that room unreadMessageCount
 *
 * NEVER enters Member Bell A, Member Conversation B, or Member App Icon.
 */
import { storeBadgeIdentity } from "@/lib/notifications/badge-authority-rebuild/badge-recipient-identity";
import { rejectUserIdentityForCStore } from "@/lib/notifications/badge-authority-rebuild/c-store-authority-contract";
import {
  resolveCStoreInquiryActionCount,
  resolveCStoreOrderActionCount,
  resolveOwnerOperationAttentionCountForStore,
  type StoreOperationCCounts,
} from "@/lib/notifications/badge-authority-rebuild/store-operation-c-projection";
import {
  resolveOwnerChatUnreadRoomCountForStore,
  resolveOwnerRoomUnreadMessageCount,
} from "@/lib/notifications/badge-authority-rebuild/store-communication-b-projection";
import type { MemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import type { MemberNotificationAAuthority } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import type { MemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

export const STORE_OWNER_C_AUTHORITY = "store_owner_c_authority_v1" as const;

export type StoreOwnerChatRoomInput = Readonly<{
  roomId: string;
  storeId: string;
  unreadMessageCount: number;
  orderId?: string | null;
  domainIdentityKey?: string | null;
  leftAt?: string | null;
  deletedAt?: string | null;
}>;

export type StoreOwnerCAuthority = Readonly<{
  authority: typeof STORE_OWNER_C_AUTHORITY;
  storeKey: `store:${string}`;
  storeId: string;
  cOperational: number;
  cChat: number;
  /** pending+refund+cancel (inquiry separate). */
  ownerFabOrders: number;
  /** open inquiry tickets. */
  ownerFabStore: number;
  /** = cChat (unread owner rooms). */
  ownerFabOrderChat: number;
  /** Admin ops hub digit = full C_operational. */
  adminHubOperational: number;
  /** Admin chat hub digit = C_chat. */
  adminHubChat: number;
  rooms: readonly {
    roomId: string;
    orderId: string | null;
    unreadMessageCount: number;
    domainIdentityKey: string | null;
  }[];
  authorityVersion: string;
  computedAt: string;
}>;

export type StoreOwnerCSurfaces = Readonly<{
  ownerFabOrders: number;
  ownerFabStore: number;
  ownerFabOrderChat: number;
  adminHubOperational: number;
  adminHubChat: number;
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function contentKey(parts: {
  storeKey: string;
  cOperational: number;
  cChat: number;
  roomKeys: readonly string[];
}): string {
  const rooms = [...parts.roomKeys].map((x) => x.trim()).filter(Boolean).sort().join(",");
  return `${parts.storeKey}|op${parts.cOperational}|ch${parts.cChat}|r:${rooms}`;
}

export function buildStoreOwnerCAuthorityVersion(input: {
  revision: number;
  contentKey: string;
}): string {
  return `c1|${nonNeg(input.revision)}|${input.contentKey}`;
}

/**
 * Canonical Owner C for one store.
 * Invalid / empty storeId → null (never fall back to owner userId).
 */
export function resolveStoreOwnerAuthority(input: {
  storeId: string;
  operational: StoreOperationCCounts;
  chatRooms?: readonly StoreOwnerChatRoomInput[];
  /** Optional pre-aggregated room count (must match chatRooms when both provided). */
  ownerChatUnreadRooms?: number;
  revision?: number;
  computedAt?: string;
}): StoreOwnerCAuthority | null {
  const id = storeBadgeIdentity(input.storeId);
  if (!id.ok || id.identity.scope !== "store") return null;
  const storeId = id.identity.storeId;
  const storeKey = id.identity.key;

  const cOperational = resolveOwnerOperationAttentionCountForStore(storeId, input.operational);
  const ownerFabOrders = resolveCStoreOrderActionCount(input.operational);
  const ownerFabStore = resolveCStoreInquiryActionCount(input.operational);

  const roomsIn: StoreOwnerChatRoomInput[] = [];
  for (const r of input.chatRooms ?? []) {
    if (String(r.storeId ?? "").trim() !== storeId) continue;
    if (r.leftAt != null && String(r.leftAt).trim() !== "") continue;
    if (r.deletedAt != null && String(r.deletedAt).trim() !== "") continue;
    const unread = nonNeg(r.unreadMessageCount);
    if (unread <= 0) continue;
    const roomId = String(r.roomId ?? "").trim();
    if (!roomId) continue;
    roomsIn.push(r);
  }
  const roomRows = roomsIn.map((r) => ({
    roomId: String(r.roomId).trim(),
    orderId: r.orderId != null ? String(r.orderId).trim() || null : null,
    unreadMessageCount: nonNeg(r.unreadMessageCount),
    domainIdentityKey: r.domainIdentityKey != null ? String(r.domainIdentityKey).trim() || null : null,
  }));
  const fromRooms = roomRows.length;
  const cChat =
    input.ownerChatUnreadRooms != null
      ? nonNeg(input.ownerChatUnreadRooms)
      : fromRooms;

  const ck = contentKey({
    storeKey,
    cOperational,
    cChat,
    roomKeys: roomRows.map((r) => r.domainIdentityKey ?? r.roomId),
  });
  const computedAt = input.computedAt ?? new Date().toISOString();

  return {
    authority: STORE_OWNER_C_AUTHORITY,
    storeKey,
    storeId,
    cOperational,
    cChat,
    ownerFabOrders,
    ownerFabStore,
    ownerFabOrderChat: cChat,
    adminHubOperational: cOperational,
    adminHubChat: cChat,
    rooms: roomRows,
    authorityVersion: buildStoreOwnerCAuthorityVersion({
      revision: nonNeg(input.revision),
      contentKey: ck,
    }),
    computedAt,
  };
}

export function projectOwnerSurfacesFromAuthority(
  auth: StoreOwnerCAuthority
): StoreOwnerCSurfaces {
  return {
    ownerFabOrders: auth.ownerFabOrders,
    ownerFabStore: auth.ownerFabStore,
    ownerFabOrderChat: auth.ownerFabOrderChat,
    adminHubOperational: auth.adminHubOperational,
    adminHubChat: auth.adminHubChat,
  };
}

/** Row: message unread for one owner room (never hub Σ). */
export function projectOwnerOrderRowUnread(
  auth: StoreOwnerCAuthority,
  roomId: string
): number {
  const rid = String(roomId ?? "").trim();
  const row = auth.rooms.find((r) => r.roomId === rid);
  return row ? nonNeg(row.unreadMessageCount) : 0;
}

/**
 * Multi-store map — never sum across stores for a member digit.
 */
export function resolveStoreOwnerAuthoritiesByStore(input: {
  storeIds: readonly string[];
  operationalByStoreId: Readonly<Record<string, StoreOperationCCounts>>;
  chatRoomsByStoreId?: Readonly<Record<string, readonly StoreOwnerChatRoomInput[]>>;
  ownerChatUnreadByStoreId?: Readonly<Record<string, number>>;
  revision?: number;
}): Readonly<Record<string, StoreOwnerCAuthority>> {
  const out: Record<string, StoreOwnerCAuthority> = {};
  for (const raw of input.storeIds) {
    const auth = resolveStoreOwnerAuthority({
      storeId: raw,
      operational: input.operationalByStoreId[raw] ?? {
        pendingOrderActions: 0,
        refundActions: 0,
        cancelActions: 0,
        openInquiryActions: 0,
      },
      chatRooms: input.chatRoomsByStoreId?.[raw],
      ownerChatUnreadRooms: input.ownerChatUnreadByStoreId?.[raw],
      revision: input.revision,
    });
    if (auth) out[auth.storeId] = auth;
  }
  return out;
}

/** Forbidden: sum all stores into one Owner digit. */
export function forbidSumOwnerCAcrossStores(
  _byStore: Readonly<Record<string, StoreOwnerCAuthority>>
): null {
  return null;
}

export function activeStoreOwnerAuthority(
  byStore: Readonly<Record<string, StoreOwnerCAuthority>>,
  activeStoreId: string | null | undefined
): StoreOwnerCAuthority | null {
  const sid = String(activeStoreId ?? "").trim();
  if (!sid) return null;
  const id = storeBadgeIdentity(sid);
  if (!id.ok || id.identity.scope !== "store") return null;
  return byStore[id.identity.storeId] ?? null;
}

/** Owner push may enter only the matching store admin surface. */
export function assertOwnerPushRecipientStore(input: {
  recipientStoreId: string | null | undefined;
  targetStoreId: string | null | undefined;
}): { ok: true } | { ok: false; reason: "OWNER_PUSH_STORE_MISMATCH" | "OWNER_PUSH_REQUIRES_STORE" } {
  const recipient = storeBadgeIdentity(String(input.recipientStoreId ?? "").trim());
  const target = storeBadgeIdentity(String(input.targetStoreId ?? "").trim());
  if (
    !recipient.ok ||
    !target.ok ||
    recipient.identity.scope !== "store" ||
    target.identity.scope !== "store"
  ) {
    return { ok: false, reason: "OWNER_PUSH_REQUIRES_STORE" };
  }
  if (recipient.identity.storeId !== target.identity.storeId) {
    return { ok: false, reason: "OWNER_PUSH_STORE_MISMATCH" };
  }
  return { ok: true };
}

/** userId must never be C recipient. */
export function assertOwnerCForbidsUserIdentity(userId: string): {
  ok: false;
  reason: "C_STORE_FORBIDS_USER_IDENTITY";
} {
  return rejectUserIdentityForCStore(userId);
}

/**
 * New store order / owner_intake must not enter Member A.
 * Pure check against A eligibility.
 */
export function assertNewOrderExcludedFromMemberA(row: {
  id?: string | null;
  type?: string | null;
  category?: string | null;
  unread?: boolean | null;
  read_at?: string | null;
  dedupe_key?: string | null;
  display_payload?: unknown;
  meta?: unknown;
}): { ok: true; inA: false } | { ok: false; reason: "NEW_ORDER_LEAKED_INTO_A" } {
  if (isMemberNotificationAUnread(row)) {
    return { ok: false, reason: "NEW_ORDER_LEAKED_INTO_A" };
  }
  return { ok: true, inA: false };
}

/** Owner chat rooms must not appear in Member Conversation B. */
export function assertOwnerChatExcludedFromMemberB(input: {
  memberB: MemberConversationAuthority;
  ownerRoomIds: readonly string[];
}): { ok: true } | { ok: false; reason: "OWNER_CHAT_LEAKED_INTO_MEMBER_B" } {
  const owner = new Set(input.ownerRoomIds.map((x) => String(x).trim()).filter(Boolean));
  for (const r of input.memberB.rooms) {
    if (owner.has(r.roomId)) {
      return { ok: false, reason: "OWNER_CHAT_LEAKED_INTO_MEMBER_B" };
    }
    if (r.chatDomain === "store_order_customer") continue;
  }
  return { ok: true };
}

/** Owner C must not change Member App Icon total (App Icon = A+B only). */
export function assertOwnerCExcludedFromMemberAppIcon(input: {
  appIcon: MemberAppIconAuthority;
  ownerC: StoreOwnerCAuthority;
}): { ok: true } | { ok: false; reason: "OWNER_C_INFLATED_APP_ICON" } {
  const expected =
    input.appIcon.memberNotificationUnread + input.appIcon.memberConversationUnreadRooms;
  if (input.appIcon.appIconTotal !== expected) {
    return { ok: false, reason: "OWNER_C_INFLATED_APP_ICON" };
  }
  // C may be non-zero for the same human; it must not be folded into appIconTotal.
  void input.ownerC;
  return { ok: true };
}

/** Convenience: active-store chat digit from bag (existing B_store helper). */
export function resolveActiveStoreCChat(
  ownerOrderUnreadByStoreId: Readonly<Record<string, number>>,
  activeStoreId: string | null | undefined
): number {
  return resolveOwnerChatUnreadRoomCountForStore(ownerOrderUnreadByStoreId, activeStoreId);
}

export function resolveActiveStoreOwnerRowMessageCount(
  rowUnreadByRoomId: Readonly<Record<string, number>>,
  roomId: string
): number {
  return resolveOwnerRoomUnreadMessageCount(rowUnreadByRoomId, roomId);
}

/** Prove A event set ignores owner C (no shared storeKey as A memberKey). */
export function assertMemberAIgnoresStoreKey(
  a: MemberNotificationAAuthority,
  storeKey: `store:${string}`
): { ok: true } | { ok: false; reason: "A_USES_STORE_KEY" } {
  if (a.memberKey === (storeKey as unknown as `user:${string}`)) {
    return { ok: false, reason: "A_USES_STORE_KEY" };
  }
  if (String(a.memberKey).startsWith("store:")) {
    return { ok: false, reason: "A_USES_STORE_KEY" };
  }
  return { ok: true };
}
