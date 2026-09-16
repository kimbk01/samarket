import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORE_DELIVERY_RADIUS_KM,
  formatStoreDeliveryRadiusKmForInput,
  parseConfiguredStoreDeliveryRadiusKm,
  parseStoreDeliveryRadiusKmForWrite,
  resolveEffectiveStoreDeliveryRadiusKm,
  resolveStoreDeliveryRadiusKmPatch,
} from "@/lib/delivery/store-delivery-radius";

describe("store-delivery-radius SSOT", () => {
  it("NULL → effective DEFAULT 10", () => {
    expect(resolveEffectiveStoreDeliveryRadiusKm(null)).toBe(DEFAULT_STORE_DELIVERY_RADIUS_KM);
    expect(resolveEffectiveStoreDeliveryRadiusKm(undefined)).toBe(DEFAULT_STORE_DELIVERY_RADIUS_KM);
    expect(formatStoreDeliveryRadiusKmForInput(null)).toBe("10");
  });

  it("configured value wins", () => {
    expect(resolveEffectiveStoreDeliveryRadiusKm(60)).toBe(60);
    expect(resolveEffectiveStoreDeliveryRadiusKm(15.55)).toBe(15.6);
    expect(parseConfiguredStoreDeliveryRadiusKm(60)).toBe(60);
    expect(parseConfiguredStoreDeliveryRadiusKm(null)).toBeNull();
  });

  it("write validation rejects non-positive / non-finite", () => {
    expect(parseStoreDeliveryRadiusKmForWrite(0).ok).toBe(false);
    expect(parseStoreDeliveryRadiusKmForWrite(-1).ok).toBe(false);
    expect(parseStoreDeliveryRadiusKmForWrite("x").ok).toBe(false);
    expect(parseStoreDeliveryRadiusKmForWrite(12.34)).toEqual({ ok: true, value: 12.3 });
  });

  it("patch omits when NULL display default unchanged; persists explicit 10", () => {
    expect(resolveStoreDeliveryRadiusKmPatch(null, "10")).toEqual({ omit: true });
    expect(resolveStoreDeliveryRadiusKmPatch(null, "15")).toEqual({ ok: true, value: 15 });
    expect(resolveStoreDeliveryRadiusKmPatch(60, "60")).toEqual({ omit: true });
    expect(resolveStoreDeliveryRadiusKmPatch(60, "10")).toEqual({ ok: true, value: 10 });
  });
});
