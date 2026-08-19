import { describe, expect, it } from "vitest";
import { resolveTradeDetailCtaPolicy } from "@/lib/trade/category-form/cta-policy";
import { hydrateTradeCategoryFieldsFromSnapshot } from "@/lib/trade/category-form/edit-hydrator";

describe("trade detail CTA policy", () => {
  it("allows chat whenever category has chat (no price-offer gate)", () => {
    const p = resolveTradeDetailCtaPolicy({
      isOwnPost: false,
      postStatusLower: "active",
      categoryHasChat: true,
      isJobsDetailUi: false,
      jobDirection: "unknown",
      listingKind: "",
      existingTradeRoomId: null,
    });
    expect(p.uiTradeChatEnabled).toBe(true);
    expect(p.primary.kind).toBe("chat");
  });

  it("merges hire apply into primary chat path", () => {
    const p = resolveTradeDetailCtaPolicy({
      isOwnPost: false,
      postStatusLower: "active",
      categoryHasChat: true,
      isJobsDetailUi: true,
      jobDirection: "hiring",
      listingKind: "hire",
      existingTradeRoomId: null,
    });
    expect(p.showJobApplyBtn).toBe(true);
    expect(p.jobHireMergedApplyChatBtn).toBe(true);
    expect(p.primary.kind).toBe("job_apply_chat");
  });

  it("rent-car buyer primary is inquire chat (no booking CTA)", () => {
    const p = resolveTradeDetailCtaPolicy({
      isOwnPost: false,
      postStatusLower: "active",
      categoryHasChat: true,
      isJobsDetailUi: false,
      jobDirection: "unknown",
      listingKind: "",
      existingTradeRoomId: null,
      compositionProfileId: "rent-car",
    });
    expect(p.primary.kind).toBe("chat");
    expect(p.primary.labelKey).toBe("trade_detail_inquire_cta");
  });
});

describe("edit hydrator Field Library", () => {
  it("reads real-estate legacy size_sq via floor_area", () => {
    const h = hydrateTradeCategoryFieldsFromSnapshot({
      meta: {
        deal_type: "임대",
        estate_type: "콘도",
        size_sq: "42",
        room_count: "2",
        bathroom_count: "1",
        building_name: "Tower",
      },
    });
    expect(h.areaSqm).toBe("42");
    expect(h.roomCount).toBe("2");
    expect(h.buildingName).toBe("Tower");
    expect(h.dealType).toBe("임대");
  });

  it("reads used-car combined car_model", () => {
    const h = hydrateTradeCategoryFieldsFromSnapshot({
      meta: {
        car_trade: "sell",
        car_model: "Toyota Vios",
        car_year: "2020",
        mileage: "12000",
        transmission: "automatic",
      },
    });
    expect(h.carModel).toBe("Toyota Vios");
    expect(h.carYear).toBe("2020");
    expect(h.usedCarTrade).toBe("sell");
    expect(h.transmission).toBe("automatic");
  });

  it("reads rent-car Field Library fields for EDIT == WRITE", () => {
    const h = hydrateTradeCategoryFieldsFromSnapshot({
      meta: {
        car_model: "Toyota Vios",
        car_year: "2021",
        daily_price: "2500",
        mileage_cap: "200",
        with_driver: true,
        pickup_location: "Cebu IT Park",
        available_from: "2026-09-01",
        deposit: "5000",
      },
      post: { price: 2500 },
    });
    expect(h.carModel).toBe("Toyota Vios");
    expect(h.carYear).toBe("2021");
    expect(h.dailyPrice).toMatch(/2,?500/);
    expect(h.mileageCap).toBe("200");
    expect(h.withDriver).toBe(true);
    expect(h.pickupLocation).toBe("Cebu IT Park");
    expect(h.availableFrom).toBe("2026-09-01");
    expect(h.deposit).toMatch(/5,?000/);
  });
});
