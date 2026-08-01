/**
 * Phase 3-3 — Bell Lifecycle Transition Matrix
 *
 * Unit = eligible unread notification_events (Bell Contract B / Explain kinds).
 * Create deltas assume a new unread event (+1 digit / +1 inbox / +1 kind).
 * Read deltas clear that event (−1).
 *
 * DO NOT: Badge · RoomUnread · Event create-policy change · Heal · Legacy delete · digit hacks
 */
import type { BellExplainKindId } from "@/lib/notifications/bell-explain-matrix";

export const BELL_TRANSITION_MATRIX_AUTHORITY = "bell_transition_v1" as const;

export type BellSurfaceDelta = Readonly<{
  bell: number;
  inboxUnread: number;
  unreadEvents: number;
  generalMessage: number;
  groupMessage: number;
  tradeMessage: number;
  customerOrder: number;
  ownerOrder: number;
  tradeStatus: number;
  orderStatus: number;
  missedCall: number;
  systemAdmin: number;
}>;

export type BellTransitionEventId =
  | "general_message_create"
  | "group_message_create"
  | "trade_message_create"
  | "customer_order_message_create"
  | "owner_order_message_create"
  | "trade_status_create"
  | "order_status_create"
  | "missed_call_create"
  | "system_create"
  | "admin_create"
  | "event_mark_read"
  | "missed_call_clear"
  | "authority_rebuild_noop"
  | "logout_clears_bell_store"
  | "login_rebuild_from_events";

export type BellTransitionSpec = Readonly<{
  event: BellTransitionEventId;
  label: string;
  expectedDelta: BellSurfaceDelta;
  kind?: BellExplainKindId;
  notes?: string;
}>;

const Z: BellSurfaceDelta = {
  bell: 0,
  inboxUnread: 0,
  unreadEvents: 0,
  generalMessage: 0,
  groupMessage: 0,
  tradeMessage: 0,
  customerOrder: 0,
  ownerOrder: 0,
  tradeStatus: 0,
  orderStatus: 0,
  missedCall: 0,
  systemAdmin: 0,
};

function d(partial: Partial<BellSurfaceDelta>): BellSurfaceDelta {
  return { ...Z, ...partial };
}

function createKind(kind: BellExplainKindId): BellSurfaceDelta {
  return d({
    bell: 1,
    inboxUnread: 1,
    unreadEvents: 1,
    [kind]: 1,
  });
}

/** Canonical Bell Transition Matrix (product). */
export const BELL_TRANSITION_MATRIX: readonly BellTransitionSpec[] = [
  {
    event: "general_message_create",
    label: "General message event → Bell/Inbox +1",
    expectedDelta: createKind("generalMessage"),
    kind: "generalMessage",
  },
  {
    event: "group_message_create",
    label: "Group message event → Bell/Inbox +1",
    expectedDelta: createKind("groupMessage"),
    kind: "groupMessage",
  },
  {
    event: "trade_message_create",
    label: "Trade message event → Bell/Inbox +1",
    expectedDelta: createKind("tradeMessage"),
    kind: "tradeMessage",
  },
  {
    event: "customer_order_message_create",
    label: "Customer order message → Bell/Inbox +1",
    expectedDelta: createKind("customerOrder"),
    kind: "customerOrder",
  },
  {
    event: "owner_order_message_create",
    label: "Owner order message → Bell/Inbox +1",
    expectedDelta: createKind("ownerOrder"),
    kind: "ownerOrder",
  },
  {
    event: "trade_status_create",
    label: "Trade status event → Bell/Inbox +1",
    expectedDelta: createKind("tradeStatus"),
    kind: "tradeStatus",
  },
  {
    event: "order_status_create",
    label: "Order status event → Bell/Inbox +1",
    expectedDelta: createKind("orderStatus"),
    kind: "orderStatus",
  },
  {
    event: "missed_call_create",
    label: "Missed call event → Bell/Inbox +1 (call log retained)",
    expectedDelta: createKind("missedCall"),
    kind: "missedCall",
    notes: "Read clears Bell row; call session/log persistence is separate",
  },
  {
    event: "system_create",
    label: "System / community_activity → Bell/Inbox +1",
    expectedDelta: createKind("systemAdmin"),
    kind: "systemAdmin",
  },
  {
    event: "admin_create",
    label: "Admin notice → Bell/Inbox +1",
    expectedDelta: createKind("systemAdmin"),
    kind: "systemAdmin",
  },
  {
    event: "event_mark_read",
    label: "Mark-read ends event → Bell/Inbox −1 (kind filled by runtime)",
    expectedDelta: d({ bell: -1, inboxUnread: -1, unreadEvents: -1 }),
    notes: "Kind axis −1 enforced with kind hint in runtime",
  },
  {
    event: "missed_call_clear",
    label: "Missed call read/clear → Bell −1",
    expectedDelta: d({
      bell: -1,
      inboxUnread: -1,
      unreadEvents: -1,
      missedCall: -1,
    }),
  },
  {
    event: "authority_rebuild_noop",
    label: "Poll / reconnect / realtime rebuild without fact change",
    expectedDelta: Z,
  },
  {
    event: "logout_clears_bell_store",
    label: "Logout wipes Bell store to 0 (client)",
    expectedDelta: Z,
    notes: "resetNotificationBadgeCountForAuthEpoch → clear",
  },
  {
    event: "login_rebuild_from_events",
    label: "Login rebuilds Bell from events via same Writer",
    expectedDelta: Z,
  },
] as const;

export type BellLifecycleSnap = Readonly<{
  bell: number;
  inboxUnread: number;
  unreadEvents: number;
  generalMessage: number;
  groupMessage: number;
  tradeMessage: number;
  customerOrder: number;
  ownerOrder: number;
  tradeStatus: number;
  orderStatus: number;
  missedCall: number;
  systemAdmin: number;
}>;

export function snapFromBellExplain(matrix: {
  total: number;
  generalMessage: { count: number };
  groupMessage: { count: number };
  tradeMessage: { count: number };
  customerOrder: { count: number };
  ownerOrder: { count: number };
  tradeStatus: { count: number };
  orderStatus: { count: number };
  missedCall: { count: number };
  systemAdmin: { count: number };
}): BellLifecycleSnap {
  return {
    bell: matrix.total,
    inboxUnread: matrix.total,
    unreadEvents: matrix.total,
    generalMessage: matrix.generalMessage.count,
    groupMessage: matrix.groupMessage.count,
    tradeMessage: matrix.tradeMessage.count,
    customerOrder: matrix.customerOrder.count,
    ownerOrder: matrix.ownerOrder.count,
    tradeStatus: matrix.tradeStatus.count,
    orderStatus: matrix.orderStatus.count,
    missedCall: matrix.missedCall.count,
    systemAdmin: matrix.systemAdmin.count,
  };
}

export function deltaBellSnap(before: BellLifecycleSnap, after: BellLifecycleSnap): BellSurfaceDelta {
  return {
    bell: after.bell - before.bell,
    inboxUnread: after.inboxUnread - before.inboxUnread,
    unreadEvents: after.unreadEvents - before.unreadEvents,
    generalMessage: after.generalMessage - before.generalMessage,
    groupMessage: after.groupMessage - before.groupMessage,
    tradeMessage: after.tradeMessage - before.tradeMessage,
    customerOrder: after.customerOrder - before.customerOrder,
    ownerOrder: after.ownerOrder - before.ownerOrder,
    tradeStatus: after.tradeStatus - before.tradeStatus,
    orderStatus: after.orderStatus - before.orderStatus,
    missedCall: after.missedCall - before.missedCall,
    systemAdmin: after.systemAdmin - before.systemAdmin,
  };
}

export function assertBellDeltaMatches(
  actual: BellSurfaceDelta,
  expected: BellSurfaceDelta
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const keys = Object.keys(Z) as (keyof BellSurfaceDelta)[];
  for (const k of keys) {
    if (actual[k] !== expected[k]) {
      errors.push(`${k}: actual=${actual[k]} expected=${expected[k]}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function expectedMarkReadDelta(kind: BellExplainKindId): BellSurfaceDelta {
  return d({
    bell: -1,
    inboxUnread: -1,
    unreadEvents: -1,
    [kind]: -1,
  });
}

export function getBellTransitionSpec(event: BellTransitionEventId): BellTransitionSpec {
  const row = BELL_TRANSITION_MATRIX.find((r) => r.event === event);
  if (!row) throw new Error(`unknown_bell_transition:${event}`);
  return row;
}
