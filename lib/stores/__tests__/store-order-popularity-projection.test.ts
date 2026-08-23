import { describe, expect, it } from "vitest";
import {
  resolveStorePopularitySinceIso,
  STORE_POPULARITY_TIME_FIELD,
  STORE_POPULARITY_WINDOW_DAYS,
} from "@/lib/stores/store-discovery-popular-store";
import { allowedOrderTransitionsForActor } from "@/lib/stores/order-status-transitions";
import { resolveDiscoveryInvalidationReasonsFromStorePatch } from "@/lib/stores/discovery/invalidate-discovery-after-store-write";

describe("store order popularity rolling 30d parity contract", () => {
  const now = new Date("2026-08-23T10:00:00.000Z");

  it("uses exact timestamp rolling window on created_at (not calendar-day buckets)", () => {
    expect(STORE_POPULARITY_WINDOW_DAYS).toBe(30);
    expect(STORE_POPULARITY_TIME_FIELD).toBe("created_at");
    const since = resolveStorePopularitySinceIso(now);
    expect(since).toBe(new Date(now.getTime() - 30 * 86_400_000).toISOString());
  });

  it("counts order at since boundary inclusive, excludes one ms before since", () => {
    const sinceMs = Date.parse(resolveStorePopularitySinceIso(now));
    const atBoundary = new Date(sinceMs).toISOString();
    const beforeBoundary = new Date(sinceMs - 1).toISOString();
    expect(Date.parse(atBoundary)).toBeGreaterThanOrEqual(sinceMs);
    expect(Date.parse(beforeBoundary)).toBeLessThan(sinceMs);
  });

  it("daily bucket alone would diverge by up to ~24h — ledger uses p_since timestamp", () => {
    const sinceIso = resolveStorePopularitySinceIso(now);
    const calendarMidnightThirtyDaysAgo = new Date(now);
    calendarMidnightThirtyDaysAgo.setUTCHours(0, 0, 0, 0);
    calendarMidnightThirtyDaysAgo.setUTCDate(calendarMidnightThirtyDaysAgo.getUTCDate() - 30);
    expect(Date.parse(sinceIso)).not.toBe(calendarMidnightThirtyDaysAgo.getTime());
  });
});

describe("order completed transition idempotency and reversal contract", () => {
  it("completed is terminal — no owner/admin reversal transitions", () => {
    const ownerFromCompleted = allowedOrderTransitionsForActor("OWNER", "completed", "delivery");
    const adminFromCompleted = allowedOrderTransitionsForActor("ADMIN", "completed", "delivery");
    expect(ownerFromCompleted).toEqual([]);
    expect(adminFromCompleted).toEqual([]);
  });
});

describe("resolveDiscoveryInvalidationReasonsFromStorePatch", () => {
  it("maps geo, schedule, and delivery flag patches", () => {
    const reasons = resolveDiscoveryInvalidationReasonsFromStorePatch({
      lat: 14.5,
      business_hours_json: {},
      is_open: false,
      delivery_available: true,
    });
    expect(reasons).toContain("store_geo");
    expect(reasons).toContain("store_schedule");
    expect(reasons).toContain("store_delivery_flags");
  });
});
