import { describe, expect, it } from "vitest";
import { allowedOrderTransitionsForActor } from "@/lib/stores/order-status-transitions";
import {
  ownerStoreOperationalWriteBlock,
  ownerStoreProfileWriteBlock,
} from "@/lib/stores/owner-product-gate";
import {
  STORE_ORDER_ACCEPT_TIMEOUT_MINUTES,
  STORE_ORDER_AUTOMATION_FROM_ISO,
  isStoreOrderInAutomationScope,
  storeOrderAcceptTimeoutCutoffIso,
} from "@/lib/stores/store-order-lifecycle-automation";
import { isValidOwnerOrdersHistoryCursor } from "@/lib/delivery/owner/owner-store-orders-list-snapshot";

describe("SYSTEM accept_timeout (ORD-03)", () => {
  it("only cancels pending", () => {
    expect(
      allowedOrderTransitionsForActor("SYSTEM", "pending", "local_delivery", { systemPurpose: "accept_timeout" })
    ).toEqual(["cancelled"]);
    for (const st of ["accepted", "preparing", "cancel_requested", "completed"]) {
      expect(
        allowedOrderTransitionsForActor("SYSTEM", st, "local_delivery", { systemPurpose: "accept_timeout" })
      ).toEqual([]);
    }
  });
});

describe("lifecycle automation scope (D-5)", () => {
  it("excludes orders created before the automation cutoff", () => {
    expect(isStoreOrderInAutomationScope("2026-09-24T13:49:06Z")).toBe(false);
    expect(isStoreOrderInAutomationScope(STORE_ORDER_AUTOMATION_FROM_ISO)).toBe(true);
    expect(isStoreOrderInAutomationScope(null)).toBe(false);
  });

  it("timeout cutoff is now minus the accept window", () => {
    const now = Date.parse("2026-10-21T00:30:00.000Z");
    expect(storeOrderAcceptTimeoutCutoffIso(now)).toBe(
      new Date(now - STORE_ORDER_ACCEPT_TIMEOUT_MINUTES * 60_000).toISOString()
    );
  });
});

describe("owner write gates (IA-03 / DEF-71)", () => {
  it("operational writes are approved-only; suspended reports store_suspended", () => {
    expect(ownerStoreOperationalWriteBlock("approved")).toBeNull();
    expect(ownerStoreOperationalWriteBlock("suspended")?.error).toBe("store_suspended");
    for (const st of ["pending", "under_review", "revision_requested", "rejected", "", null]) {
      expect(ownerStoreOperationalWriteBlock(st)?.error).toBe("store_not_approved");
    }
  });

  it("profile writes allow onboarding, block suspended/rejected", () => {
    for (const st of ["approved", "pending", "under_review", "revision_requested"]) {
      expect(ownerStoreProfileWriteBlock(st)).toBeNull();
    }
    expect(ownerStoreProfileWriteBlock("suspended")?.error).toBe("store_suspended");
    expect(ownerStoreProfileWriteBlock("rejected")?.error).toBe("store_not_approved");
  });
});

describe("owner orders history cursor (ORD-05)", () => {
  it("accepts RPC cursor format and rejects malformed input", () => {
    expect(
      isValidOwnerOrdersHistoryCursor("2026-09-24T13:49:06.755914Z|0b9f2c1e-1111-4111-8111-111111111111")
    ).toBe(true);
    expect(
      isValidOwnerOrdersHistoryCursor("2026-09-24T13:49:06.755914+00:00|0b9f2c1e-1111-4111-8111-111111111111")
    ).toBe(true);
    expect(isValidOwnerOrdersHistoryCursor("nope")).toBe(false);
    expect(isValidOwnerOrdersHistoryCursor("2026-09-24T13:49:06Z|not-a-uuid")).toBe(false);
    expect(isValidOwnerOrdersHistoryCursor("2026-09-24T13:49:06Z|0b9f2c1e-1111-4111-8111-111111111111|x")).toBe(false);
  });
});
