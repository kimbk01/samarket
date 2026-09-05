import { describe, expect, it } from "vitest";
import {
  classifyOwnerOrderStalePending,
  OWNER_STALE_PENDING_DAY_MS,
  OWNER_STALE_PENDING_ORPHAN_MS,
  OWNER_STALE_PENDING_SOFT_MS,
} from "@/lib/business/owner-order-stale-pending";

describe("classifyOwnerOrderStalePending", () => {
  const now = Date.parse("2026-09-05T12:00:00.000Z");

  it("ignores non-pending", () => {
    const r = classifyOwnerOrderStalePending({
      orderStatus: "accepted",
      createdAt: new Date(now - OWNER_STALE_PENDING_ORPHAN_MS).toISOString(),
      nowMs: now,
    });
    expect(r.class).toBe("none");
  });

  it("marks soft attention after 3 minutes", () => {
    const r = classifyOwnerOrderStalePending({
      orderStatus: "pending",
      createdAt: new Date(now - OWNER_STALE_PENDING_SOFT_MS - 1000).toISOString(),
      nowMs: now,
    });
    expect(r.class).toBe("attention_pending");
  });

  it("marks day-stale after 24h without hiding age", () => {
    const r = classifyOwnerOrderStalePending({
      orderStatus: "pending",
      createdAt: new Date(now - OWNER_STALE_PENDING_DAY_MS - 1000).toISOString(),
      nowMs: now,
    });
    expect(r.class).toBe("stale_pending");
    expect(r.ageHours).toBeGreaterThanOrEqual(24);
  });

  it("classifies multi-week pending as orphan (e.g. 1422h)", () => {
    const ageMs = 1422 * 60 * 60 * 1000;
    const r = classifyOwnerOrderStalePending({
      orderStatus: "pending",
      createdAt: new Date(now - ageMs).toISOString(),
      nowMs: now,
    });
    expect(r.class).toBe("orphan_pending");
    expect(r.ageHours).toBe(1422);
    expect(ageMs).toBeGreaterThan(OWNER_STALE_PENDING_ORPHAN_MS);
  });
});
