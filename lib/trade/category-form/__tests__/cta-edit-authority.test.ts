import { describe, expect, it } from "vitest";
import { resolveTradeDetailCtaPolicy } from "@/lib/trade/category-form/cta-policy";
import { hydrateTradeCategoryFieldsFromSnapshot } from "@/lib/trade/category-form/edit-hydrator";

describe("trade detail CTA policy", () => {
  it("gates chat on price offer until accepted", () => {
    const gated = resolveTradeDetailCtaPolicy({
      isOwnPost: false,
      postStatusLower: "active",
      categoryHasChat: true,
      buyerPriceOfferFlowActive: true,
      hasAcceptedOffer: false,
      isJobsDetailUi: false,
      jobDirection: "unknown",
      listingKind: "",
      existingTradeRoomId: null,
      priceOfferGatesChat: true,
    });
    expect(gated.uiTradeChatEnabled).toBe(false);

    const accepted = resolveTradeDetailCtaPolicy({
      ...gated,
      isOwnPost: false,
      postStatusLower: "active",
      categoryHasChat: true,
      buyerPriceOfferFlowActive: true,
      hasAcceptedOffer: true,
      isJobsDetailUi: false,
      jobDirection: "unknown",
      listingKind: "",
      existingTradeRoomId: null,
      priceOfferGatesChat: true,
    });
    expect(accepted.uiTradeChatEnabled).toBe(true);
    expect(accepted.primary.kind).toBe("chat");
  });

  it("merges hire apply into primary chat path", () => {
    const p = resolveTradeDetailCtaPolicy({
      isOwnPost: false,
      postStatusLower: "active",
      categoryHasChat: true,
      buyerPriceOfferFlowActive: false,
      hasAcceptedOffer: false,
      isJobsDetailUi: true,
      jobDirection: "hiring",
      listingKind: "hire",
      existingTradeRoomId: null,
      priceOfferGatesChat: false,
    });
    expect(p.showJobApplyBtn).toBe(true);
    expect(p.jobHireMergedApplyChatBtn).toBe(true);
    expect(p.primary.kind).toBe("job_apply_chat");
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
});
