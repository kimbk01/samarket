import { describe, expect, it } from "vitest";
import {
  clampStorePrepMinutes,
  formatStoreBrowseDeliveryFeeLine,
  formatStoreBrowseDeliveryFeeStrikePhp,
  parseCommerceExtrasFromHoursJson,
  parsePrepMinutesLegacyFromEstPrepLabel,
  resolveChargedDeliveryFeePhp,
} from "../store-commerce-extras";
import { buildBrowseStoreListEtaLabel } from "../store-delivery-eta-label";

describe("parsePrepMinutesLegacyFromEstPrepLabel", () => {
  it("range uses midpoint", () => {
    expect(parsePrepMinutesLegacyFromEstPrepLabel("20~40분")).toBe(30);
  });
  it("single minute", () => {
    expect(parsePrepMinutesLegacyFromEstPrepLabel("25분")).toBe(25);
  });
});

describe("clampStorePrepMinutes", () => {
  it("clamps", () => {
    expect(clampStorePrepMinutes(0)).toBe(1);
    expect(clampStorePrepMinutes(500)).toBe(180);
  });
});

describe("parseCommerceExtrasFromHoursJson", () => {
  it("reads prep_time_minutes", () => {
    const x = parseCommerceExtrasFromHoursJson({ prep_time_minutes: 42, est_prep_label: "99분" });
    expect(x.prepMinutes).toBe(42);
    expect(x.estPrepLabel).toBe("42분");
  });

  it("reads delivery_ride_display_manual with cap", () => {
    const long = "a".repeat(100);
    const x = parseCommerceExtrasFromHoursJson({ delivery_ride_display_manual: long });
    expect(x.deliveryRideDisplayManual?.length).toBe(80);
    expect(x.deliveryRideDisplayManual?.startsWith("aaa")).toBe(true);
  });

  it("explicit courier clears fee", () => {
    const x = parseCommerceExtrasFromHoursJson({
      delivery_fee_mode: "courier",
      delivery_fee_php: 99,
      delivery_courier_label: "Lalamove",
    });
    expect(x.deliveryFeeMode).toBe("courier");
    expect(x.deliveryCourierLabel).toBe("Lalamove");
    expect(x.deliveryFeePhp).toBeNull();
  });

  it("legacy fee and courier prefers self hides label", () => {
    const x = parseCommerceExtrasFromHoursJson({
      delivery_fee_php: 50,
      delivery_courier_label: "Grab",
    });
    expect(x.deliveryFeeMode).toBe("self");
    expect(x.deliveryFeePhp).toBe(50);
    expect(x.deliveryCourierLabel).toBeNull();
  });
});

describe("resolveChargedDeliveryFeePhp", () => {
  it("courier is always zero", () => {
    const extras = parseCommerceExtrasFromHoursJson({
      delivery_fee_mode: "courier",
      delivery_courier_label: "X",
    });
    expect(resolveChargedDeliveryFeePhp(extras, 9999, "local_delivery")).toBe(0);
  });

  it("self respects free threshold", () => {
    const extras = parseCommerceExtrasFromHoursJson({
      delivery_fee_mode: "self",
      delivery_fee_php: 40,
      free_delivery_over_php: 500,
    });
    expect(resolveChargedDeliveryFeePhp(extras, 100, "local_delivery")).toBe(40);
    expect(resolveChargedDeliveryFeePhp(extras, 600, "local_delivery")).toBe(0);
  });

  it("self_free_promo always zero charge and ignores free_over in parse", () => {
    const extras = parseCommerceExtrasFromHoursJson({
      delivery_fee_mode: "self_free_promo",
      delivery_fee_strike_reference_php: 2700,
      free_delivery_over_php: 500,
      delivery_fee_php: 50,
    });
    expect(extras.deliveryFeeMode).toBe("self_free_promo");
    expect(extras.deliveryFeeStrikeReferencePhp).toBe(2700);
    expect(extras.freeDeliveryOverPhp).toBeNull();
    expect(extras.deliveryFeePhp).toBeNull();
    expect(resolveChargedDeliveryFeePhp(extras, 9999, "local_delivery")).toBe(0);
  });
});

describe("formatStoreBrowseDeliveryFeeLine", () => {
  it("formats courier and self", () => {
    const courier = parseCommerceExtrasFromHoursJson({
      delivery_fee_mode: "courier",
      delivery_courier_label: "라라무브",
    });
    expect(formatStoreBrowseDeliveryFeeLine(courier, { deliveryAvailable: true }, "ko")).toBe(
      "배달비: 라라무브"
    );
    const self = parseCommerceExtrasFromHoursJson({
      delivery_fee_mode: "self",
      delivery_fee_php: 1200,
    });
    expect(formatStoreBrowseDeliveryFeeLine(self, { deliveryAvailable: true }, "ko")).toBe(
      "배달비 ₱1,200"
    );
    const promo = parseCommerceExtrasFromHoursJson({
      delivery_fee_mode: "self_free_promo",
      delivery_fee_strike_reference_php: 100,
    });
    expect(formatStoreBrowseDeliveryFeeLine(promo, { deliveryAvailable: true }, "ko")).toBe(
      "배달비 무료 적용 중"
    );
    expect(formatStoreBrowseDeliveryFeeStrikePhp(promo, { deliveryAvailable: true })).toBe(100);
  });
});

describe("buildBrowseStoreListEtaLabel", () => {
  it("shows manual delivery slot when route context present", () => {
    const extras = parseCommerceExtrasFromHoursJson({ prep_time_minutes: 20 });
    const label = buildBrowseStoreListEtaLabel(
      extras,
      null,
      {
        deliveryAvailable: true,
        routeContextPresent: true,
        manualRideDisplay: "30분 안팎",
      },
      "ko"
    );
    expect(label).toBe("조리 약 20분 · 배달 30분 안팎");
  });
});
