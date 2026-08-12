/**
 * Phase 1 — Badge Authority Contract (pure).
 *
 * PRODUCT TARGET CONTRACT for A/B/C rebuild.
 * DO NOT import from product runtime badge writers / Projection Authority /
 * Native adapters / FCM dispatchers. Phase 2+ may adopt these helpers.
 *
 * HEAD baseline when locked: 1e2a560c1 (Phase B live; this file is not live).
 */

/** Authority axes — mutually exclusive for a single event attribution. */
export type BadgeAuthorityAxis = "A" | "B" | "C" | "none";

export type BadgeRecipientScope = "member" | "store";

export type MemberIdentityKey = `user:${string}`;
export type StoreIdentityKey = `store:${string}`;
export type BadgeRecipientIdentityKey = MemberIdentityKey | StoreIdentityKey;

/**
 * Canonical event kinds for classification contract tests.
 * Not a DB enum — product taxonomy for Phase 1.
 */
export type BadgeContractEventKind =
  | "general_message"
  | "group_message"
  | "trade_message"
  | "customer_to_store_message"
  | "store_to_customer_message"
  | "trade_status"
  | "customer_order_status"
  | "store_new_order"
  | "store_action_required"
  | "service_notice"
  | "security_alert"
  | "marketing_ephemeral"
  | "missed_call"
  | "completed_call_record";

/** Surface contribution after classification (0/1 flags per axis). */
export type BadgeEventAxisFlags = Readonly<{
  A: 0 | 1;
  B: 0 | 1;
  C: 0 | 1;
}>;

export type BadgeEventSurfaceFlags = Readonly<{
  bell: "A" | 0;
  appIcon: "A" | "B" | 0;
}>;

export type BadgeEventClassification = BadgeEventAxisFlags &
  BadgeEventSurfaceFlags &
  Readonly<{
    kind: BadgeContractEventKind;
    /** Default recipient scope for this kind (message B may be member or store). */
    defaultRecipientScope: BadgeRecipientScope | "none";
  }>;

/**
 * Locked classification table (§4).
 * One event contributes to at most one of A/B/C (exclusive).
 */
export const BADGE_EVENT_CLASSIFICATION_TABLE: Readonly<
  Record<BadgeContractEventKind, BadgeEventClassification>
> = {
  general_message: {
    kind: "general_message",
    A: 0,
    B: 1,
    C: 0,
    bell: 0,
    appIcon: "B",
    defaultRecipientScope: "member",
  },
  group_message: {
    kind: "group_message",
    A: 0,
    B: 1,
    C: 0,
    bell: 0,
    appIcon: "B",
    defaultRecipientScope: "member",
  },
  trade_message: {
    kind: "trade_message",
    A: 0,
    B: 1,
    C: 0,
    bell: 0,
    appIcon: "B",
    defaultRecipientScope: "member",
  },
  customer_to_store_message: {
    kind: "customer_to_store_message",
    A: 0,
    B: 1,
    C: 0,
    bell: 0,
    appIcon: "B",
    defaultRecipientScope: "store",
  },
  store_to_customer_message: {
    kind: "store_to_customer_message",
    A: 0,
    B: 1,
    C: 0,
    bell: 0,
    appIcon: "B",
    defaultRecipientScope: "member",
  },
  trade_status: {
    kind: "trade_status",
    A: 1,
    B: 0,
    C: 0,
    bell: "A",
    appIcon: "A",
    defaultRecipientScope: "member",
  },
  customer_order_status: {
    kind: "customer_order_status",
    A: 1,
    B: 0,
    C: 0,
    bell: "A",
    appIcon: "A",
    defaultRecipientScope: "member",
  },
  store_new_order: {
    kind: "store_new_order",
    A: 0,
    B: 0,
    C: 1,
    bell: 0,
    appIcon: 0,
    defaultRecipientScope: "store",
  },
  store_action_required: {
    kind: "store_action_required",
    A: 0,
    B: 0,
    C: 1,
    bell: 0,
    appIcon: 0,
    defaultRecipientScope: "store",
  },
  service_notice: {
    kind: "service_notice",
    A: 1,
    B: 0,
    C: 0,
    bell: "A",
    appIcon: "A",
    defaultRecipientScope: "member",
  },
  security_alert: {
    kind: "security_alert",
    A: 1,
    B: 0,
    C: 0,
    bell: "A",
    appIcon: "A",
    defaultRecipientScope: "member",
  },
  marketing_ephemeral: {
    kind: "marketing_ephemeral",
    A: 0,
    B: 0,
    C: 0,
    bell: 0,
    appIcon: 0,
    defaultRecipientScope: "none",
  },
  missed_call: {
    kind: "missed_call",
    A: 0,
    B: 1,
    C: 0,
    bell: 0,
    appIcon: "B",
    defaultRecipientScope: "member",
  },
  completed_call_record: {
    kind: "completed_call_record",
    A: 0,
    B: 0,
    C: 0,
    bell: 0,
    appIcon: 0,
    defaultRecipientScope: "none",
  },
};

/** Live Phase B paths that violate this contract (documented; not fixed in Phase 1). */
export const PHASE_B_DOCUMENTED_CONTRACT_VIOLATIONS = [
  "owner_intake_in_notification_attention_total",
  "owner_intake_counts_toward_bell",
  "store_new_order_written_as_user_id_notification_event",
  "owner_store_order_rooms_in_member_app_icon_chat_attention",
  "orphan_missed_call_in_notification_attention_as_bell_a",
] as const;

/** PRODUCT LOCK 2026-08-02 — not undecided. */
export const MEMBER_APP_ICON_EXCLUSIONS_LOCKED = [
  "B_store",
  "C_store",
  "owner_intake",
  "marketing_ephemeral",
] as const;

/** PRODUCT LOCK — Native App Icon must not carry store ops until owner-mode product. */
export const NATIVE_APP_ICON_BLOCKS_STORE_AXES = true as const;

export type PhaseBDocumentedContractViolation =
  (typeof PHASE_B_DOCUMENTED_CONTRACT_VIOLATIONS)[number];

/** Attention-key / meta markers that must never enter member A / Bell. */
export const OWNER_INTAKE_ATTENTION_KEY_PREFIX = "order_status:owner_intake:" as const;

export const OWNER_STORE_OPERATION_META_KINDS = [
  "store_order_created",
  "store_order_accept_reminder_30s",
  "store_order_accept_reminder_60s",
  "store_order_payment_completed",
  "store_order_buyer_cancelled",
  "store_order_sold_out",
  "store_order_refund_requested",
  "store_point_blocked",
  "store_point_deducted",
  "store_point_low",
  "store_point_charge_approved",
  "store_point_charge_rejected",
  "store_point_account_replied",
] as const;

export function classifyBadgeContractEvent(
  kind: BadgeContractEventKind
): BadgeEventClassification {
  return BADGE_EVENT_CLASSIFICATION_TABLE[kind];
}

export function axesAreExclusive(flags: BadgeEventAxisFlags): boolean {
  return flags.A + flags.B + flags.C <= 1;
}

export function memberIdentityKey(userId: string): MemberIdentityKey {
  const id = String(userId ?? "").trim();
  if (!id) throw new Error("member_identity_requires_user_id");
  return `user:${id}`;
}

export function storeIdentityKey(storeId: string): StoreIdentityKey {
  const id = String(storeId ?? "").trim();
  if (!id) throw new Error("store_identity_requires_store_id");
  return `store:${id}`;
}

export function isMemberIdentityKey(key: string): key is MemberIdentityKey {
  return /^user:[^:]+$/.test(key) && !key.startsWith("store:");
}

export function isStoreIdentityKey(key: string): key is StoreIdentityKey {
  return /^store:[^:]+$/.test(key);
}

/** user_id and store_id must never be interchangeable as identity keys. */
export function identitiesAreDistinct(
  memberUserId: string,
  storeId: string
): boolean {
  const u = String(memberUserId ?? "").trim();
  const s = String(storeId ?? "").trim();
  if (!u || !s) return true;
  // Compare as plain strings — template-literal brands never overlap by construction.
  return String(memberIdentityKey(u)) !== String(storeIdentityKey(s));
}

export function isOwnerIntakeAttentionKey(attentionKey: string): boolean {
  return String(attentionKey ?? "").startsWith(OWNER_INTAKE_ATTENTION_KEY_PREFIX);
}

export function isOwnerStoreOperationMetaKind(kind: string): boolean {
  return (OWNER_STORE_OPERATION_META_KINDS as readonly string[]).includes(
    String(kind ?? "").trim()
  );
}

/** Member A eligibility — owner_intake / chat / marketing / missed never qualify. */
export function isMemberAEligibleNotification(input: {
  recipientScope: BadgeRecipientScope;
  recipientIdentityKey: BadgeRecipientIdentityKey;
  persistsInInbox: boolean;
  readAt: string | null;
  deletedAt: string | null;
  attentionKey?: string | null;
  metaKind?: string | null;
  eventKind?: BadgeContractEventKind | null;
}): boolean {
  if (input.recipientScope !== "member") return false;
  if (!isMemberIdentityKey(input.recipientIdentityKey)) return false;
  if (!input.persistsInInbox) return false;
  if (input.readAt != null && String(input.readAt).trim() !== "") return false;
  if (input.deletedAt != null && String(input.deletedAt).trim() !== "") return false;
  if (input.attentionKey && isOwnerIntakeAttentionKey(input.attentionKey)) return false;
  if (input.metaKind && isOwnerStoreOperationMetaKind(input.metaKind)) return false;
  if (input.eventKind) {
    const c = classifyBadgeContractEvent(input.eventKind);
    if (c.A !== 1) return false;
  }
  return true;
}

/**
 * Unread room set — unique room ids only; message counts never enlarge the set size.
 * Read rooms must be absent from the set (caller removes).
 */
export function uniqueUnreadRoomCount(roomIds: readonly string[]): number {
  const seen = new Set<string>();
  for (const raw of roomIds) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    seen.add(id);
  }
  return seen.size;
}

/** Row unit = messages; hub/App Icon B unit = rooms. Named distinctly on purpose. */
export type UnreadMessageCount = number & { readonly __brand: "UnreadMessageCount" };
export type UnreadRoomCount = number & { readonly __brand: "UnreadRoomCount" };
export type UnreadNotificationCount = number & {
  readonly __brand: "UnreadNotificationCount";
};
export type UnresolvedMissedCallCount = number & {
  readonly __brand: "UnresolvedMissedCallCount";
};
export type OwnerActionRequiredCount = number & {
  readonly __brand: "OwnerActionRequiredCount";
};

export function asUnreadMessageCount(n: number): UnreadMessageCount {
  return Math.max(0, Math.floor(Number(n) || 0)) as UnreadMessageCount;
}

export function asUnreadRoomCount(n: number): UnreadRoomCount {
  return Math.max(0, Math.floor(Number(n) || 0)) as UnreadRoomCount;
}

export function asUnreadNotificationCount(n: number): UnreadNotificationCount {
  return Math.max(0, Math.floor(Number(n) || 0)) as UnreadNotificationCount;
}

export function asUnresolvedMissedCallCount(n: number): UnresolvedMissedCallCount {
  return Math.max(0, Math.floor(Number(n) || 0)) as UnresolvedMissedCallCount;
}

export function asOwnerActionRequiredCount(n: number): OwnerActionRequiredCount {
  return Math.max(0, Math.floor(Number(n) || 0)) as OwnerActionRequiredCount;
}

export type MemberBRoomBuckets = Readonly<{
  generalDirectRoomIds: readonly string[];
  groupRoomIds: readonly string[];
  tradeRoomIds: readonly string[];
  /** Customer-side store_order rooms only. */
  customerStoreOrderRoomIds: readonly string[];
}>;

export type StoreBRoomBuckets = Readonly<{
  storeId: string;
  /** Customer→store unread order chat rooms for this store. */
  ownerStoreOrderRoomIds: readonly string[];
}>;

export function memberBUnreadRoomCount(buckets: MemberBRoomBuckets): UnreadRoomCount {
  return asUnreadRoomCount(
    uniqueUnreadRoomCount([
      ...buckets.generalDirectRoomIds,
      ...buckets.groupRoomIds,
      ...buckets.tradeRoomIds,
      ...buckets.customerStoreOrderRoomIds,
    ])
  );
}

export function storeBUnreadRoomCount(buckets: StoreBRoomBuckets): UnreadRoomCount {
  return asUnreadRoomCount(uniqueUnreadRoomCount(buckets.ownerStoreOrderRoomIds));
}

/** B App Icon unit for a given recipient identity. */
export function bCommunicationItemCount(input: {
  unreadRoomCount: UnreadRoomCount | number;
  unresolvedMissedCallCount: UnresolvedMissedCallCount | number;
}): number {
  return (
    asUnreadRoomCount(input.unreadRoomCount) +
    asUnresolvedMissedCallCount(input.unresolvedMissedCallCount)
  );
}

/** Missed calls: at most one unresolved item per call_id. */
export function unresolvedMissedCallCountFromCallIds(
  callIds: readonly string[]
): UnresolvedMissedCallCount {
  return asUnresolvedMissedCallCount(uniqueUnreadRoomCount(callIds));
}

export function projectBellBadge(
  aMemberUnreadNotificationCount: UnreadNotificationCount | number
): number {
  return asUnreadNotificationCount(aMemberUnreadNotificationCount);
}

/**
 * Member App Icon = A + B(member communication only).
 * B_store and C_store are never included (PRODUCT LOCK 2026-08-02).
 * Native App Icon uses the same member total until a separate owner-mode product exists (BLOCK).
 */
export function projectMemberAppIconTotal(input: {
  aMemberUnreadNotificationCount: UnreadNotificationCount | number;
  memberUnreadRoomCount: UnreadRoomCount | number;
  unresolvedMissedCallCount: UnresolvedMissedCallCount | number;
  /** Forbidden inputs — if provided non-zero, projection must reject. */
  ownerOperationCount?: number;
  ownerStoreChatRoomCount?: number;
}): { ok: true; appIconTotal: number } | { ok: false; reason: string } {
  const c = Math.max(0, Math.floor(Number(input.ownerOperationCount) || 0));
  const ownerChat = Math.max(0, Math.floor(Number(input.ownerStoreChatRoomCount) || 0));
  if (c > 0) return { ok: false, reason: "C_forbidden_in_member_app_icon" };
  if (ownerChat > 0) {
    return { ok: false, reason: "store_owner_chat_B_forbidden_in_member_app_icon" };
  }
  const a = asUnreadNotificationCount(input.aMemberUnreadNotificationCount);
  const b = bCommunicationItemCount({
    unreadRoomCount: input.memberUnreadRoomCount,
    unresolvedMissedCallCount: input.unresolvedMissedCallCount,
  });
  return { ok: true, appIconTotal: a + b };
}

export function projectBottomChatBadge(input: {
  generalDirectUnreadRoomCount: UnreadRoomCount | number;
  groupUnreadRoomCount: UnreadRoomCount | number;
}): number {
  return (
    asUnreadRoomCount(input.generalDirectUnreadRoomCount) +
    asUnreadRoomCount(input.groupUnreadRoomCount)
  );
}

export function projectTradeHubBadge(tradeUnreadRoomCount: UnreadRoomCount | number): number {
  return asUnreadRoomCount(tradeUnreadRoomCount);
}

export function projectCustomerOrderHubBadge(
  customerStoreOrderUnreadRoomCount: UnreadRoomCount | number
): number {
  return asUnreadRoomCount(customerStoreOrderUnreadRoomCount);
}

export type OwnerStoreSurfaceProjection = Readonly<{
  storeIdentityKey: StoreIdentityKey;
  ownerChatUnreadRoomCount: UnreadRoomCount;
  ownerOperationAttentionCount: OwnerActionRequiredCount;
  /** Presentation-only — never authority for Bell / App Icon / DB / FCM. */
  ownerPresentationTotal: number;
}>;

export function projectOwnerStoreSurfaces(input: {
  storeId: string;
  ownerChatUnreadRoomCount: UnreadRoomCount | number;
  ownerOperationAttentionCount: OwnerActionRequiredCount | number;
}): OwnerStoreSurfaceProjection {
  const chat = asUnreadRoomCount(input.ownerChatUnreadRoomCount);
  const ops = asOwnerActionRequiredCount(input.ownerOperationAttentionCount);
  return {
    storeIdentityKey: storeIdentityKey(input.storeId),
    ownerChatUnreadRoomCount: chat,
    ownerOperationAttentionCount: ops,
    ownerPresentationTotal: chat + ops,
  };
}

/** Multi-store: B/C never summed across stores into one authority. */
export function projectOwnerSurfacesByStore(
  stores: ReadonlyArray<{
    storeId: string;
    ownerChatUnreadRoomCount: number;
    ownerOperationAttentionCount: number;
  }>
): ReadonlyMap<StoreIdentityKey, OwnerStoreSurfaceProjection> {
  const out = new Map<StoreIdentityKey, OwnerStoreSurfaceProjection>();
  for (const row of stores) {
    const proj = projectOwnerStoreSurfaces(row);
    out.set(proj.storeIdentityKey, proj);
  }
  return out;
}

export type MarkAllMemberAReadResult = Readonly<{
  aAfter: UnreadNotificationCount;
  bellAfter: number;
  appIconAComponentAfter: number;
  bUnchanged: true;
  cUnchanged: true;
}>;

export function applyMemberAMarkAllRead(input: {
  aBefore: number;
  bBefore: number;
  cBefore: number;
}): MarkAllMemberAReadResult & { bAfter: number; cAfter: number } {
  return {
    aAfter: asUnreadNotificationCount(0),
    bellAfter: 0,
    appIconAComponentAfter: 0,
    bUnchanged: true,
    cUnchanged: true,
    bAfter: input.bBefore,
    cAfter: input.cBefore,
  };
}

export type RoomReadDelta = Readonly<{
  roomRowMessageCountAfter: UnreadMessageCount;
  unreadRoomCountDelta: -1 | 0;
  appIconBDelta: -1 | 0;
}>;

/**
 * Reading one room with N messages → row 0, room count −1 (if was unread), App Icon B −1.
 * Never −N on hub/App Icon.
 */
export function applyCommunicationRoomRead(input: {
  unreadMessageCountBefore: number;
  roomWasUnread: boolean;
}): RoomReadDelta {
  const messages = asUnreadMessageCount(input.unreadMessageCountBefore);
  if (!input.roomWasUnread || messages === 0) {
    return {
      roomRowMessageCountAfter: asUnreadMessageCount(0),
      unreadRoomCountDelta: 0,
      appIconBDelta: 0,
    };
  }
  return {
    roomRowMessageCountAfter: asUnreadMessageCount(0),
    unreadRoomCountDelta: -1,
    appIconBDelta: -1,
  };
}

export function applyMissedCallSeen(input: {
  callId: string;
  alreadySeenCallIds: ReadonlySet<string>;
}): { unresolvedDelta: -1 | 0; appIconBDelta: -1 | 0 } {
  const id = String(input.callId ?? "").trim();
  if (!id || input.alreadySeenCallIds.has(id)) {
    return { unresolvedDelta: 0, appIconBDelta: 0 };
  }
  return { unresolvedDelta: -1, appIconBDelta: -1 };
}

export function applyOwnerOrderAccept(input: {
  aBefore: number;
  bBefore: number;
  cBefore: number;
}): { aAfter: number; bAfter: number; cAfter: number } {
  return {
    aAfter: input.aBefore,
    bAfter: input.bBefore,
    cAfter: Math.max(0, input.cBefore - 1),
  };
}

export type FcmPushKindContract =
  | "marketing_ephemeral"
  | "system_persistent"
  | "notice_persistent"
  | "store_operation"
  | "communication";

export type FcmBadgeEffectContract = "none" | "A" | "B_snapshot" | "C_store";

export function fcmContractForPushKind(kind: FcmPushKindContract): {
  persistsInInbox: boolean;
  badgeEffect: FcmBadgeEffectContract;
  isAuthority: false;
} {
  switch (kind) {
    case "marketing_ephemeral":
      return { persistsInInbox: false, badgeEffect: "none", isAuthority: false };
    case "system_persistent":
    case "notice_persistent":
      return { persistsInInbox: true, badgeEffect: "A", isAuthority: false };
    case "store_operation":
      return { persistsInInbox: false, badgeEffect: "C_store", isAuthority: false };
    case "communication":
      return { persistsInInbox: false, badgeEffect: "B_snapshot", isAuthority: false };
  }
}

/** Owner new-order deep link target contract. */
export function ownerNewOrderDeepLinkTarget(storeId: string, orderId: string): string {
  const s = String(storeId ?? "").trim();
  const o = String(orderId ?? "").trim();
  if (!s || !o) throw new Error("owner_deeplink_requires_store_and_order");
  return `/stores/owner/${s}/orders/${o}`;
}

export const BADGE_AUTHORITY_CONTRACT_VERSION =
  "badge_authority_rebuild_phase1_v1" as const;
