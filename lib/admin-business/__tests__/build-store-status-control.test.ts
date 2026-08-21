import { describe, expect, it } from "vitest";
import { buildStoreStatusControl } from "@/lib/admin-business/build-store-status-control";
import type { BusinessCcDeliverySnapshot } from "@/lib/admin-business/load-business-control-center-detail";

const emptyDelivery = (over: Partial<BusinessCcDeliverySnapshot> = {}): BusinessCcDeliverySnapshot => ({
  deliveryAvailable: true,
  pickupAvailable: true,
  isOpen: true,
  frontOpenForCommerce: true,
  inBreak: false,
  hoursLabel: "09:00 ~ 21:00",
  weekdaysLabel: "매일 09:00–21:00",
  autoHoursEnabled: true,
  scheduleEnforced: true,
  prepTimeMinutes: 20,
  breakRangeLabel: null,
  customerDeliveryFeeMode: "self",
  customerDeliveryFeePhp: 49,
  customerMinOrderPhp: 100,
  customerFreeDeliveryOverPhp: null,
  lat: 14.5,
  lng: 121.0,
  distancePolicyEnabled: true,
  applies: true,
  maxKm: 5,
  policySource: "global",
  storeOverrideMode: null,
  storeOverrideMaxKm: null,
  ...over,
});

describe("buildStoreStatusControl", () => {
  it("keeps separate axes (does not merge into one status)", () => {
    const rows = buildStoreStatusControl({
      approvalStatus: "approved",
      isVisible: true,
      sales: {
        allowed_to_sell: true,
        sales_status: "approved",
        approved_at: null,
        rejection_reason: null,
        suspension_reason: null,
      },
      delivery: emptyDelivery(),
      commerce: {
        isOpenForCommerce: true,
        inBreak: false,
        breakConfigured: false,
        breakRangeLabel: "",
      },
      hoursLabel: "09:00 ~ 21:00",
      suspendedReason: null,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual([
      "approval",
      "visibility",
      "sales",
      "front_open",
      "hours",
      "delivery_channel",
      "pickup_channel",
      "distance_policy",
      "sanction",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reflects closed commerce separately from approval", () => {
    const rows = buildStoreStatusControl({
      approvalStatus: "approved",
      isVisible: true,
      sales: {
        allowed_to_sell: true,
        sales_status: "approved",
        approved_at: null,
        rejection_reason: null,
        suspension_reason: null,
      },
      delivery: emptyDelivery({ frontOpenForCommerce: false, isOpen: false }),
      commerce: {
        isOpenForCommerce: false,
        inBreak: false,
        breakConfigured: false,
        breakRangeLabel: "",
      },
      hoursLabel: null,
      suspendedReason: null,
    });
    expect(rows.find((r) => r.id === "approval")?.value).toBe("approved");
    expect(rows.find((r) => r.id === "front_open")?.value).toBe("closed");
  });
});
