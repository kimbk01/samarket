/**
 * Phase 2-3 — Badge Lifecycle Transition Matrix
 *
 * Unit = unread **rooms** (not messages), plus orphan missed_call events.
 * "Message arrive" deltas assume the room was previously NOT in the unread set
 * (mark-read / clean first). Additional messages in an already-unread room → Δ0.
 *
 * DO NOT: Bell · Native impl · Heal · Legacy delete · RoomUnread redesign
 */

export const BADGE_TRANSITION_MATRIX_AUTHORITY = "domain_badge_transition_v1" as const;

export type BadgeSurfaceDelta = Readonly<{
  appIcon: number;
  bottom: number;
  trade: number;
  customer: number;
  owner: number;
  missedCall: number;
}>;

export type BadgeTransitionEventId =
  | "general_message_first_unread"
  | "group_message_first_unread"
  | "trade_message_first_unread"
  | "customer_order_message_first_unread"
  | "owner_order_message_first_unread"
  | "additional_message_same_unread_room"
  | "mark_read_clears_room"
  | "leave_group_clears_active_unread_room"
  | "rejoin_preserves_pre_leave_unread"
  | "orphan_missed_call_create"
  | "orphan_missed_call_clear"
  | "authority_rebuild_noop"
  | "logout_clears_to_zero"
  | "login_rebuild_from_facts";

export type BadgeTransitionSpec = Readonly<{
  event: BadgeTransitionEventId;
  /** Human label */
  label: string;
  expectedDelta: BadgeSurfaceDelta;
  notes?: string;
}>;

const Z: BadgeSurfaceDelta = {
  appIcon: 0,
  bottom: 0,
  trade: 0,
  customer: 0,
  owner: 0,
  missedCall: 0,
};

function d(partial: Partial<BadgeSurfaceDelta>): BadgeSurfaceDelta {
  return { ...Z, ...partial };
}

/** Canonical Transition Matrix (product). */
export const BADGE_TRANSITION_MATRIX: readonly BadgeTransitionSpec[] = [
  {
    event: "general_message_first_unread",
    label: "General message → room enters unread set",
    expectedDelta: d({ appIcon: 1, bottom: 1 }),
  },
  {
    event: "group_message_first_unread",
    label: "Group message → room enters unread set",
    expectedDelta: d({ appIcon: 1, bottom: 1 }),
  },
  {
    event: "trade_message_first_unread",
    label: "Trade message → room enters unread set",
    expectedDelta: d({ appIcon: 1, trade: 1 }),
  },
  {
    event: "customer_order_message_first_unread",
    label: "Customer order message → room enters unread set",
    expectedDelta: d({ appIcon: 1, customer: 1 }),
  },
  {
    event: "owner_order_message_first_unread",
    label: "Owner order message → room enters unread set",
    expectedDelta: d({ appIcon: 1, owner: 1 }),
  },
  {
    event: "additional_message_same_unread_room",
    label: "Peer message in already-unread room (message+1, room set unchanged)",
    expectedDelta: Z,
    notes: "Hub/App Icon unit is rooms; Explain counts must stay flat",
  },
  {
    event: "mark_read_clears_room",
    label: "Mark-read clears last unread in room → room leaves set",
    expectedDelta: d({ appIcon: -1 }), // bottom/trade/customer/owner filled by runtime domain
    notes: "Domain-specific axis also −1; enforced in runtime with domain hint",
  },
  {
    event: "leave_group_clears_active_unread_room",
    label: "Leave removes room from active unread set",
    expectedDelta: d({ appIcon: -1, bottom: -1 }),
  },
  {
    event: "rejoin_preserves_pre_leave_unread",
    label: "Rejoin restores pre-leave unread rooms (Case 2); leave-interval excluded",
    expectedDelta: Z,
    notes: "After leave+leave-msgs+rejoin with pre-leave unread N: AppIcon/Bottom include N again vs while-left",
  },
  {
    event: "orphan_missed_call_create",
    label: "Orphan missed_call event create",
    expectedDelta: d({ appIcon: 1, missedCall: 1 }),
  },
  {
    event: "orphan_missed_call_clear",
    label: "Orphan missed_call read/clear",
    expectedDelta: d({ appIcon: -1, missedCall: -1 }),
  },
  {
    event: "authority_rebuild_noop",
    label: "Poll / reconnect / cold-start rebuild without fact change",
    expectedDelta: Z,
  },
  {
    event: "logout_clears_to_zero",
    label: "Logout wipes surface authority to 0 (client)",
    expectedDelta: Z,
    notes: "Client epoch wipe — Runtime documents path; digits forced 0",
  },
  {
    event: "login_rebuild_from_facts",
    label: "Login rebuilds from RoomUnread facts via same Writer",
    expectedDelta: Z,
    notes: "Rebuild identity with server facts — same Apply commit",
  },
] as const;

export type BadgeExplainSnap = Readonly<{
  appIcon: number;
  bottom: number;
  trade: number;
  customer: number;
  owner: number;
  missedCall: number;
  general: number;
  group: number;
}>;

export function snapFromExplain(matrix: {
  appIcon: {
    total: number;
    general: { count: number };
    group: { count: number };
    trade: { count: number };
    customerOrder: { count: number };
    ownerOrder: { count: number };
    missedCall: { count: number };
  };
  bottom: { total: number };
  trade: { count: number };
  customer: { count: number };
  owner: { count: number };
}): BadgeExplainSnap {
  return {
    appIcon: matrix.appIcon.total,
    bottom: matrix.bottom.total,
    trade: matrix.trade.count,
    customer: matrix.customer.count,
    owner: matrix.owner.count,
    missedCall: matrix.appIcon.missedCall.count,
    general: matrix.appIcon.general.count,
    group: matrix.appIcon.group.count,
  };
}

export function deltaExplain(before: BadgeExplainSnap, after: BadgeExplainSnap): BadgeSurfaceDelta {
  return {
    appIcon: after.appIcon - before.appIcon,
    bottom: after.bottom - before.bottom,
    trade: after.trade - before.trade,
    customer: after.customer - before.customer,
    owner: after.owner - before.owner,
    missedCall: after.missedCall - before.missedCall,
  };
}

export function assertDeltaMatches(
  actual: BadgeSurfaceDelta,
  expected: BadgeSurfaceDelta,
  opts?: { allowAppIconDomainCoupling?: "bottom" | "trade" | "customer" | "owner" }
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const keys: (keyof BadgeSurfaceDelta)[] = [
    "appIcon",
    "bottom",
    "trade",
    "customer",
    "owner",
    "missedCall",
  ];
  for (const k of keys) {
    if (actual[k] !== expected[k]) {
      errors.push(`${k}: actual=${actual[k]} expected=${expected[k]}`);
    }
  }
  // Optional: mark_read domain coupling — expected.appIcon=-1 and one domain=-1
  if (opts?.allowAppIconDomainCoupling && expected.appIcon === -1) {
    /* handled by caller with specialized expected */
  }
  return { ok: errors.length === 0, errors };
}

export function expectedMarkReadDelta(
  domain: "general" | "group" | "trade" | "customer" | "owner"
): BadgeSurfaceDelta {
  switch (domain) {
    case "general":
    case "group":
      return d({ appIcon: -1, bottom: -1 });
    case "trade":
      return d({ appIcon: -1, trade: -1 });
    case "customer":
      return d({ appIcon: -1, customer: -1 });
    case "owner":
      return d({ appIcon: -1, owner: -1 });
  }
}

export function getTransitionSpec(event: BadgeTransitionEventId): BadgeTransitionSpec {
  const row = BADGE_TRANSITION_MATRIX.find((r) => r.event === event);
  if (!row) throw new Error(`unknown_transition:${event}`);
  return row;
}
