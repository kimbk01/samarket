import { describe, expect, it } from "vitest";
import { mapExternalDeliveryPartnerStatus } from "@/lib/stores/external-delivery-partner-status-map";

describe("mapExternalDeliveryPartnerStatus", () => {
  it("pickup fulfillment skips delivery mapping", () => {
    const r = mapExternalDeliveryPartnerStatus("generic", "in_transit", "delivering", "pickup");
    expect(r).toEqual({ kind: "skip", reason: "pickup_fulfillment_no_delivery" });
  });

  it("maps in_transit to delivering", () => {
    const r = mapExternalDeliveryPartnerStatus("generic", "in_transit", "ready_for_pickup", "local_delivery");
    expect(r).toEqual({ kind: "map", target: "delivering" });
  });

  it("delivered from delivering → arrived", () => {
    const r = mapExternalDeliveryPartnerStatus("generic", "delivered", "delivering", "local_delivery");
    expect(r).toEqual({ kind: "map", target: "arrived" });
  });

  it("delivered from arrived → completed", () => {
    const r = mapExternalDeliveryPartnerStatus("generic", "delivered", "arrived", "shipping");
    expect(r).toEqual({ kind: "map", target: "completed" });
  });

  it("unknown status skips", () => {
    const r = mapExternalDeliveryPartnerStatus("generic", "weird", "delivering", "local_delivery");
    expect(r).toEqual({ kind: "skip", reason: "unknown_partner_status" });
  });
});
