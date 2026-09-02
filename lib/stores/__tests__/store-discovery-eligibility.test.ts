import { describe, expect, it } from "vitest";
import {
  resolveStoreDiscoveryBrowseDisplayStatus,
  resolveStoreDiscoveryEligibility,
  resolveStoreDiscoveryHomeDisplayStatus,
} from "@/lib/stores/store-discovery-eligibility";

const openHours = {
  auto_business_hours: {
    enabled: true,
    schedule_enforced: true,
    timezone: "Asia/Manila",
    open: "00:00",
    close: "23:59",
  },
};

const breakHours = {
  ...openHours,
  break_hours: {
    start: "12:00",
    end: "13:00",
  },
};

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    business_hours_json: openHours,
    is_open: true,
    point_commerce_blocked: false,
    delivery_available: true,
    distanceOutOfRange: false,
    ...overrides,
  };
}

describe("resolveStoreDiscoveryEligibility", () => {
  it("E1: orderable + delivery + serviceable → highest band", () => {
    const r = resolveStoreDiscoveryEligibility(baseInput());
    expect(r.state).toBe("orderable_deliverable");
    expect(r.rank).toBe(0);
  });

  it("E2: open + delivery_available=false → below deliverable", () => {
    const deliverable = resolveStoreDiscoveryEligibility(baseInput());
    const disabled = resolveStoreDiscoveryEligibility(baseInput({ delivery_available: false }));
    expect(disabled.state).toBe("open_delivery_disabled");
    expect(disabled.rank).toBeGreaterThan(deliverable.rank);
  });

  it("E3: open + out_of_range → below serviceable deliverable", () => {
    const deliverable = resolveStoreDiscoveryEligibility(baseInput());
    const oor = resolveStoreDiscoveryEligibility(baseInput({ distanceOutOfRange: true }));
    expect(oor.state).toBe("open_out_of_range");
    expect(oor.rank).toBeGreaterThan(deliverable.rank);
  });

  it("E4: resting → lower band", () => {
    const noonManila = new Date("2026-08-23T04:30:00.000Z");
    const r = resolveStoreDiscoveryEligibility(
      baseInput({
        business_hours_json: breakHours,
        now: noonManila,
      })
    );
    expect(r.state).toBe("resting");
    expect(r.inBreak).toBe(true);
    expect(r.rank).toBeGreaterThan(2);
  });

  it("E5: retired point_commerce_blocked does not change eligibility", () => {
    const blocked = resolveStoreDiscoveryEligibility(baseInput({ point_commerce_blocked: true }));
    const open = resolveStoreDiscoveryEligibility(baseInput({ point_commerce_blocked: false }));
    expect(blocked.state).toBe(open.state);
    expect(blocked.rank).toBe(open.rank);
  });

  it("E6: closed → lowest operational band among visible stores", () => {
    const r = resolveStoreDiscoveryEligibility(baseInput({ is_open: false }));
    expect(r.state).toBe("closed");
    expect(r.rank).toBe(5);
  });

  it("preserves resting in browse display while home collapses to preparing/closed", () => {
    const noonManila = new Date("2026-08-23T04:30:00.000Z");
    const input = baseInput({ business_hours_json: breakHours, now: noonManila });
    expect(resolveStoreDiscoveryBrowseDisplayStatus(input)).toBe("resting");
    expect(resolveStoreDiscoveryHomeDisplayStatus(input)).toBe("preparing");
  });
});
