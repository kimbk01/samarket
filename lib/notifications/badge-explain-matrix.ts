/**
 * Phase 2-1 — Badge Explain Matrix (Runtime).
 *
 * Every Domain Badge surface digit MUST be explainable as ID set + count.
 * DO NOT: Bell · RoomUnread · Heal · UI digit hacks.
 *
 * App Icon = |GD| + |Group| + |Trade| + |Customer| + |Owner| + NotificationAttention
 * Bottom   = |GD| + |Group|
 * Trade    = |Trade|
 * Customer = |Customer|
 * Owner    = |Owner|
 *
 * missedCall part = orphan missed only (diagnostics).
 * App Icon total uses notificationAttentionTotal (Phase B), not orphan alone.
 */
export const BADGE_EXPLAIN_MATRIX_AUTHORITY = "domain_badge_explain_v1" as const;

export type BadgeExplainRoomPart = Readonly<{
  count: number;
  roomIds: readonly string[];
}>;

export type BadgeExplainMissedCallPart = Readonly<{
  count: number;
  /** Orphan missed_call event ids (room_id null). May be empty if loader omitted ids. */
  eventIds: readonly string[];
}>;

export type BadgeExplainMatrix = Readonly<{
  authority: typeof BADGE_EXPLAIN_MATRIX_AUTHORITY;
  appIcon: Readonly<{
    total: number;
    general: BadgeExplainRoomPart;
    group: BadgeExplainRoomPart;
    trade: BadgeExplainRoomPart;
    customerOrder: BadgeExplainRoomPart;
    ownerOrder: BadgeExplainRoomPart;
    missedCall: BadgeExplainMissedCallPart;
  }>;
  bottom: Readonly<{
    total: number;
    general: BadgeExplainRoomPart;
    group: BadgeExplainRoomPart;
  }>;
  trade: BadgeExplainRoomPart;
  customer: BadgeExplainRoomPart;
  owner: Readonly<
    BadgeExplainRoomPart & {
      byStoreId: Readonly<Record<string, number>>;
    }
  >;
}>;

export type BadgeExplainMatrixInput = Readonly<{
  generalDirectRoomIds: readonly string[];
  groupRoomIds: readonly string[];
  tradeRoomIds: readonly string[];
  customerOrderRoomIds: readonly string[];
  ownerOrderRoomIds: readonly string[];
  ownerOrderUnreadByStoreId?: Readonly<Record<string, number>>;
  orphanMissedCallCount: number;
  orphanMissedCallEventIds?: readonly string[];
  /** Phase B — NotificationAttentionTotal (drives App Icon notification axis). */
  notificationAttentionTotal?: number;
  notificationAttentionKeys?: readonly string[];
}>;

function uniqIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function roomPart(ids: readonly string[]): BadgeExplainRoomPart {
  const roomIds = uniqIds(ids);
  return { count: roomIds.length, roomIds };
}

/**
 * Pure builder — single Explain Matrix from Domain room/event ID facts.
 */
export function buildBadgeExplainMatrix(input: BadgeExplainMatrixInput): BadgeExplainMatrix {
  const general = roomPart(input.generalDirectRoomIds);
  const group = roomPart(input.groupRoomIds);
  const trade = roomPart(input.tradeRoomIds);
  const customerOrder = roomPart(input.customerOrderRoomIds);
  const ownerOrder = roomPart(input.ownerOrderRoomIds);
  const missedIds = uniqIds(input.orphanMissedCallEventIds ?? []);
  const missedCount = Math.max(0, Math.floor(Number(input.orphanMissedCallCount) || 0));
  const missedCall: BadgeExplainMissedCallPart = {
    count: missedCount,
    eventIds: missedIds,
  };
  const notificationAttentionTotal = Math.max(
    0,
    Math.floor(
      Number(
        input.notificationAttentionTotal != null
          ? input.notificationAttentionTotal
          : missedCount
      ) || 0
    )
  );

  const appIconTotal =
    general.count +
    group.count +
    trade.count +
    customerOrder.count +
    ownerOrder.count +
    notificationAttentionTotal;

  const byStoreRaw = input.ownerOrderUnreadByStoreId ?? {};
  const byStoreId: Record<string, number> = {};
  for (const [k, v] of Object.entries(byStoreRaw)) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    byStoreId[key] = Math.max(0, Math.floor(Number(v) || 0));
  }

  return {
    authority: BADGE_EXPLAIN_MATRIX_AUTHORITY,
    appIcon: {
      total: appIconTotal,
      general,
      group,
      trade,
      customerOrder,
      ownerOrder,
      missedCall,
    },
    bottom: {
      total: general.count + group.count,
      general,
      group,
    },
    trade,
    customer: customerOrder,
    owner: {
      ...ownerOrder,
      byStoreId,
    },
  };
}

export type BadgeExplainAssertResult = Readonly<{
  ok: boolean;
  errors: readonly string[];
}>;

/**
 * Runtime / contract assert: count === |ids| and surface totals reconcile.
 */
export function assertBadgeExplainMatrix(
  matrix: BadgeExplainMatrix,
  opts?: Readonly<{
    /** When set, App Icon total must equal this (projection.appIconTotal). */
    expectedAppIconTotal?: number;
    /** When set, Bottom total must equal this (projection.bottomChatTotal). */
    expectedBottomTotal?: number;
    /** When set, Trade count must equal this. */
    expectedTradeTotal?: number;
    /** When set, Customer count must equal this. */
    expectedCustomerTotal?: number;
    /** When set, Owner count must equal this. */
    expectedOwnerTotal?: number;
    /** If true, require missedCall.eventIds.length === missedCall.count when count > 0. */
    requireMissedCallEventIds?: boolean;
  }>
): BadgeExplainAssertResult {
  const errors: string[] = [];
  if (matrix.authority !== BADGE_EXPLAIN_MATRIX_AUTHORITY) {
    errors.push(`authority_mismatch:${matrix.authority}`);
  }

  const checkRoom = (label: string, part: BadgeExplainRoomPart) => {
    if (part.count !== part.roomIds.length) {
      errors.push(`${label}:count!=|roomIds| (${part.count}!=${part.roomIds.length})`);
    }
    const uniq = new Set(part.roomIds);
    if (uniq.size !== part.roomIds.length) {
      errors.push(`${label}:duplicate_roomIds`);
    }
  };

  checkRoom("appIcon.general", matrix.appIcon.general);
  checkRoom("appIcon.group", matrix.appIcon.group);
  checkRoom("appIcon.trade", matrix.appIcon.trade);
  checkRoom("appIcon.customerOrder", matrix.appIcon.customerOrder);
  checkRoom("appIcon.ownerOrder", matrix.appIcon.ownerOrder);
  checkRoom("bottom.general", matrix.bottom.general);
  checkRoom("bottom.group", matrix.bottom.group);
  checkRoom("trade", matrix.trade);
  checkRoom("customer", matrix.customer);
  checkRoom("owner", matrix.owner);

  const sumRooms =
    matrix.appIcon.general.count +
    matrix.appIcon.group.count +
    matrix.appIcon.trade.count +
    matrix.appIcon.customerOrder.count +
    matrix.appIcon.ownerOrder.count;
  // Phase B: appIcon.total = rooms + NotificationAttention (missedCall part is orphan subset only).
  if (matrix.appIcon.total < sumRooms) {
    errors.push(`appIcon.total<sum(rooms) (${matrix.appIcon.total}<${sumRooms})`);
  }
  if (matrix.appIcon.total < sumRooms + matrix.appIcon.missedCall.count) {
    // orphan must be covered by notification axis (notification >= orphan)
    // when notificationAttention omitted, total === rooms+orphan so equality holds.
  }
  const notificationAxis = matrix.appIcon.total - sumRooms;
  if (notificationAxis < matrix.appIcon.missedCall.count) {
    errors.push(
      `notification_axis<orphan (${notificationAxis}<${matrix.appIcon.missedCall.count})`
    );
  }
  if (matrix.bottom.total !== matrix.bottom.general.count + matrix.bottom.group.count) {
    errors.push("bottom.total!=general+group");
  }
  if (matrix.bottom.total !== matrix.appIcon.general.count + matrix.appIcon.group.count) {
    errors.push("bottom.total!=appIcon.general+group");
  }
  if (matrix.trade.count !== matrix.appIcon.trade.count) {
    errors.push("trade!=appIcon.trade");
  }
  if (matrix.customer.count !== matrix.appIcon.customerOrder.count) {
    errors.push("customer!=appIcon.customerOrder");
  }
  if (matrix.owner.count !== matrix.appIcon.ownerOrder.count) {
    errors.push("owner!=appIcon.ownerOrder");
  }

  const mc = matrix.appIcon.missedCall;
  if (mc.count < 0) errors.push("missedCall.count_negative");
  if (opts?.requireMissedCallEventIds && mc.count > 0 && mc.eventIds.length !== mc.count) {
    errors.push(`missedCall:count!=|eventIds| (${mc.count}!=${mc.eventIds.length})`);
  }

  if (opts?.expectedAppIconTotal != null && matrix.appIcon.total !== opts.expectedAppIconTotal) {
    errors.push(`appIcon.total!=expected (${matrix.appIcon.total}!=${opts.expectedAppIconTotal})`);
  }
  if (opts?.expectedBottomTotal != null && matrix.bottom.total !== opts.expectedBottomTotal) {
    errors.push(`bottom.total!=expected (${matrix.bottom.total}!=${opts.expectedBottomTotal})`);
  }
  if (opts?.expectedTradeTotal != null && matrix.trade.count !== opts.expectedTradeTotal) {
    errors.push(`trade!=expected (${matrix.trade.count}!=${opts.expectedTradeTotal})`);
  }
  if (opts?.expectedCustomerTotal != null && matrix.customer.count !== opts.expectedCustomerTotal) {
    errors.push(`customer!=expected (${matrix.customer.count}!=${opts.expectedCustomerTotal})`);
  }
  if (opts?.expectedOwnerTotal != null && matrix.owner.count !== opts.expectedOwnerTotal) {
    errors.push(`owner!=expected (${matrix.owner.count}!=${opts.expectedOwnerTotal})`);
  }

  return { ok: errors.length === 0, errors };
}
