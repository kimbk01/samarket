/**
 * Phase 2-3 — Badge Lifecycle Transition Matrix contracts.
 * DO NOT: Bell · Native Badge impl · Heal · Legacy delete · RoomUnread redesign
 */
import { describe, expect, it } from "vitest";
import {
  BADGE_TRANSITION_MATRIX,
  BADGE_TRANSITION_MATRIX_AUTHORITY,
  assertDeltaMatches,
  deltaExplain,
  expectedMarkReadDelta,
  getTransitionSpec,
  snapFromExplain,
  type BadgeExplainSnap,
} from "@/lib/notifications/badge-lifecycle-transition-matrix";

describe("Phase 2-3 Badge Transition Matrix", () => {
  it("authority id is domain_badge_transition_v1", () => {
    expect(BADGE_TRANSITION_MATRIX_AUTHORITY).toBe("domain_badge_transition_v1");
  });

  it("covers required product transition rows", () => {
    const ids = new Set(BADGE_TRANSITION_MATRIX.map((r) => r.event));
    for (const id of [
      "general_message_first_unread",
      "group_message_first_unread",
      "trade_message_first_unread",
      "customer_order_message_first_unread",
      "owner_order_message_first_unread",
      "additional_message_same_unread_room",
      "mark_read_clears_room",
      "leave_group_clears_active_unread_room",
      "orphan_missed_call_create",
      "orphan_missed_call_clear",
      "authority_rebuild_noop",
    ] as const) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("General / Group → AppIcon+1 Bottom+1; Trade/Customer/Owner isolate axes", () => {
    expect(getTransitionSpec("general_message_first_unread").expectedDelta).toEqual({
      appIcon: 1,
      bottom: 1,
      trade: 0,
      customer: 0,
      owner: 0,
      missedCall: 0,
    });
    expect(getTransitionSpec("trade_message_first_unread").expectedDelta).toEqual({
      appIcon: 1,
      bottom: 0,
      trade: 1,
      customer: 0,
      owner: 0,
      missedCall: 0,
    });
    expect(getTransitionSpec("customer_order_message_first_unread").expectedDelta).toEqual({
      appIcon: 1,
      bottom: 0,
      trade: 0,
      customer: 1,
      owner: 0,
      missedCall: 0,
    });
    expect(getTransitionSpec("owner_order_message_first_unread").expectedDelta).toEqual({
      appIcon: 1,
      bottom: 0,
      trade: 0,
      customer: 0,
      owner: 1,
      missedCall: 0,
    });
  });

  it("additional message in same unread room is Δ0 (room unit)", () => {
    expect(getTransitionSpec("additional_message_same_unread_room").expectedDelta).toEqual({
      appIcon: 0,
      bottom: 0,
      trade: 0,
      customer: 0,
      owner: 0,
      missedCall: 0,
    });
  });

  it("mark-read domain coupling", () => {
    expect(expectedMarkReadDelta("general")).toEqual({
      appIcon: -1,
      bottom: -1,
      trade: 0,
      customer: 0,
      owner: 0,
      missedCall: 0,
    });
    expect(expectedMarkReadDelta("trade")).toEqual({
      appIcon: -1,
      bottom: 0,
      trade: -1,
      customer: 0,
      owner: 0,
      missedCall: 0,
    });
    expect(expectedMarkReadDelta("customer")).toEqual({
      appIcon: -1,
      bottom: 0,
      trade: 0,
      customer: -1,
      owner: 0,
      missedCall: 0,
    });
    expect(expectedMarkReadDelta("owner")).toEqual({
      appIcon: -1,
      bottom: 0,
      trade: 0,
      customer: 0,
      owner: -1,
      missedCall: 0,
    });
  });

  it("deltaExplain + assertDeltaMatches", () => {
    const before: BadgeExplainSnap = {
      appIcon: 10,
      bottom: 4,
      trade: 2,
      customer: 3,
      owner: 1,
      missedCall: 0,
      general: 3,
      group: 1,
    };
    const after: BadgeExplainSnap = {
      ...before,
      appIcon: 11,
      bottom: 5,
      general: 4,
    };
    const delta = deltaExplain(before, after);
    expect(assertDeltaMatches(delta, getTransitionSpec("general_message_first_unread").expectedDelta)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("snapFromExplain maps matrix totals", () => {
    const snap = snapFromExplain({
      appIcon: {
        total: 7,
        general: { count: 2 },
        group: { count: 1 },
        trade: { count: 1 },
        customerOrder: { count: 2 },
        ownerOrder: { count: 1 },
        missedCall: { count: 0 },
      },
      bottom: { total: 3 },
      trade: { count: 1 },
      customer: { count: 2 },
      owner: { count: 1 },
    });
    expect(snap.appIcon).toBe(7);
    expect(snap.bottom).toBe(3);
    expect(snap.customer).toBe(2);
  });
});
