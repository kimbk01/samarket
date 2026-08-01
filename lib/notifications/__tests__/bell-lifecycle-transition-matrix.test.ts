/**
 * Phase 3-3 — Bell Lifecycle Transition Matrix contracts.
 * DO NOT: Badge · RoomUnread · Heal · Legacy · digit hacks
 */
import { describe, expect, it } from "vitest";
import {
  BELL_TRANSITION_MATRIX,
  BELL_TRANSITION_MATRIX_AUTHORITY,
  assertBellDeltaMatches,
  deltaBellSnap,
  expectedMarkReadDelta,
  getBellTransitionSpec,
  snapFromBellExplain,
} from "@/lib/notifications/bell-lifecycle-transition-matrix";

describe("Phase 3-3 Bell Transition Matrix", () => {
  it("authority id", () => {
    expect(BELL_TRANSITION_MATRIX_AUTHORITY).toBe("bell_transition_v1");
  });

  it("covers required create kinds + read + missed + rebuild", () => {
    const ids = new Set(BELL_TRANSITION_MATRIX.map((r) => r.event));
    for (const id of [
      "general_message_create",
      "group_message_create",
      "trade_message_create",
      "customer_order_message_create",
      "owner_order_message_create",
      "trade_status_create",
      "order_status_create",
      "missed_call_create",
      "missed_call_clear",
      "system_create",
      "admin_create",
      "event_mark_read",
      "authority_rebuild_noop",
    ] as const) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("General create → Bell+1 Inbox+1 kind+1", () => {
    expect(getBellTransitionSpec("general_message_create").expectedDelta).toEqual({
      bell: 1,
      inboxUnread: 1,
      unreadEvents: 1,
      generalMessage: 1,
      groupMessage: 0,
      tradeMessage: 0,
      customerOrder: 0,
      ownerOrder: 0,
      tradeStatus: 0,
      orderStatus: 0,
      missedCall: 0,
      systemAdmin: 0,
    });
  });

  it("mark-read kind coupling", () => {
    expect(expectedMarkReadDelta("orderStatus")).toEqual({
      bell: -1,
      inboxUnread: -1,
      unreadEvents: -1,
      generalMessage: 0,
      groupMessage: 0,
      tradeMessage: 0,
      customerOrder: 0,
      ownerOrder: 0,
      tradeStatus: 0,
      orderStatus: -1,
      missedCall: 0,
      systemAdmin: 0,
    });
  });

  it("delta + assert", () => {
    const before = snapFromBellExplain({
      total: 2,
      generalMessage: { count: 2 },
      groupMessage: { count: 0 },
      tradeMessage: { count: 0 },
      customerOrder: { count: 0 },
      ownerOrder: { count: 0 },
      tradeStatus: { count: 0 },
      orderStatus: { count: 0 },
      missedCall: { count: 0 },
      systemAdmin: { count: 0 },
    });
    const after = { ...before, bell: 3, inboxUnread: 3, unreadEvents: 3, generalMessage: 3 };
    const delta = deltaBellSnap(before, after);
    expect(
      assertBellDeltaMatches(delta, getBellTransitionSpec("general_message_create").expectedDelta)
    ).toEqual({ ok: true, errors: [] });
  });
});
