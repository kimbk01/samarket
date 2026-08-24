import { describe, expect, it } from "vitest";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { isWithinProductScheduleWindow } from "@/lib/stores/product/stores-product-schedule-window";

describe("isWithinProductScheduleWindow", () => {
  it("always on when both ends empty", () => {
    expect(isWithinProductScheduleWindow(null, null)).toBe(true);
    expect(isWithinProductScheduleWindow("", "")).toBe(true);
  });

  it("respects start/end ISO window", () => {
    const now = Date.parse("2026-08-24T12:00:00.000Z");
    expect(
      isWithinProductScheduleWindow("2026-08-24T00:00:00.000Z", "2026-08-24T23:00:00.000Z", now)
    ).toBe(true);
    expect(
      isWithinProductScheduleWindow("2026-08-25T00:00:00.000Z", "2026-08-26T00:00:00.000Z", now)
    ).toBe(false);
  });
});

describe("resolveBrowseScopePolicy primary cascade", () => {
  it("primary OFF forces secondary OFF even when sub row enabled", () => {
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow: {
        scopeKey: "restaurant",
        primarySlug: "restaurant",
        subSlug: null,
        enabled: false,
        displayTitleKo: "식당",
        displayTitleEn: "Restaurant",
        adEnabled: false,
        couponEnabled: false,
        maxInsertion: null,
        intervalEveryN: 8,
        presentationMode: "card_benefit_integrated",
        scheduleStart: null,
        scheduleEnd: null,
      },
      subRow: {
        scopeKey: "restaurant/korean",
        primarySlug: "restaurant",
        subSlug: "korean",
        enabled: true,
        displayTitleKo: "한식",
        displayTitleEn: "Korean",
        adEnabled: "inherit",
        couponEnabled: "inherit",
        maxInsertion: "inherit",
        intervalEveryN: "inherit",
        presentationMode: "inherit",
        scheduleStart: "inherit",
        scheduleEnd: "inherit",
      },
    });
    expect(resolved.enabled).toBe(false);
  });
});
