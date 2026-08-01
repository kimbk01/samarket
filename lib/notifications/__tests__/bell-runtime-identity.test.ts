/**
 * Phase 3-4 — Bell Runtime Identity contracts.
 * DO NOT: Bell structure · Badge · RoomUnread · Heal · Legacy
 */
import { describe, expect, it } from "vitest";
import {
  BELL_IDENTITY_WIRES,
  BELL_RUNTIME_IDENTITY_AUTHORITY,
  assertBellIdentityWires,
  assertBellRuntimeIdentityEqual,
} from "@/lib/notifications/bell-runtime-identity";

describe("Phase 3-4 Bell Runtime Identity", () => {
  it("authority id", () => {
    expect(BELL_RUNTIME_IDENTITY_AUTHORITY).toBe("bell_runtime_identity_v1");
  });

  it("wires Header / Store / Inbox / Destination / Commit", () => {
    const surfaces = new Set(BELL_IDENTITY_WIRES.map((w) => w.surface));
    for (const s of ["bell_commit", "bell_store", "header_bell", "inbox_list", "destination"]) {
      expect(surfaces.has(s)).toBe(true);
    }
  });

  it("static wire scan PASS", () => {
    expect(assertBellIdentityWires()).toEqual(expect.objectContaining({ ok: true, errors: [] }));
  });

  it("five-way equality gate", () => {
    expect(
      assertBellRuntimeIdentityEqual({
        bellDigit: 2,
        explainTotal: 2,
        notificationEventCount: 2,
        inboxUnread: 2,
        destinationReachableCount: 2,
        explainEventIds: ["a", "b"],
      })
    ).toEqual({ ok: true, errors: [] });

    expect(
      assertBellRuntimeIdentityEqual({
        bellDigit: 2,
        explainTotal: 2,
        notificationEventCount: 2,
        inboxUnread: 1,
        destinationReachableCount: 2,
        explainEventIds: ["a", "b"],
      }).ok
    ).toBe(false);
  });
});
