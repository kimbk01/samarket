/**
 * UI-3 — Customer ad surface contracts (HOME gap cards, hero, search).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DELIVERY_AD_CUSTOMER_AD_TAG_CLASS } from "@/lib/stores/advertising/delivery-ad-design-board-contract";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("UI-3 customer ad surfaces", () => {
  it("C1 — gap HOME cards show sponsored tag when benefit.sponsored", () => {
    for (const file of [
      "components/stores/home/presentation/StoresHomeStoreTeaserCard.tsx",
      "components/stores/home/presentation/StoresHomeBrandCircularCard.tsx",
    ]) {
      const src = read(file);
      expect(src).toContain("DeliveryAdCustomerAdTag");
      expect(src).toContain("benefit?.sponsored");
      expect(src).toContain("store_insertion_sponsored");
    }
  });

  it("C1 — existing HOME paid cards preserve ad tag", () => {
    for (const file of [
      "components/stores/home/presentation/StoresHomeTimesaleRowCard.tsx",
      "components/stores/home/presentation/StoresHomeStoreHorizontalCard.tsx",
      "components/stores/home/presentation/StoresHomeHighRatingFoodCard.tsx",
      "components/stores/home/presentation/StoresHomeFoodRailCard.tsx",
    ]) {
      expect(read(file)).toContain("DeliveryAdCustomerAdTag");
    }
  });

  it("C1 wiring — composition slot passes sponsored benefit for paid rest stores", () => {
    const slot = read("components/stores/home/hub/StoresHomeCompositionSlotSection.tsx");
    expect(slot).toContain("sponsored: true");
    expect(slot).toContain("orderHomeRestStoresForPaidInsertion");
  });

  it("C2 — category row card ad tag contract", () => {
    const category = read("components/stores/browse/StoreBrowseCategoryRowCard.tsx");
    expect(category).toContain("DeliveryAdCustomerAdTag");
    expect(category).toContain("campaignBenefit?.sponsored");
  });

  it("C3 — hero banner uses DeliveryAdBanner + ad label", () => {
    const hero = read("components/stores/home/hub/StoresHomeHeroBanner.tsx");
    expect(hero).toContain("DeliveryAdBanner");
    expect(hero).toContain("store_insertion_sponsored");
  });

  it("C4 — search results banner slot before store list", () => {
    const search = read("components/delivery/search/DeliverySearchResults.tsx");
    const bannerIdx = search.indexOf("DeliveryAdBanner");
    const storesIdx = search.indexOf("ui_delivery_search_stores_heading");
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(storesIdx).toBeGreaterThan(bannerIdx);
    expect(search).toContain('data-delivery-ad-inventory="STORES_SEARCH_TOP"');
  });

  it("Customer ad tag uses design-board orange class", () => {
    expect(read("components/stores/advertising/DeliveryAdCustomerAdTag.tsx")).toContain(
      "DELIVERY_AD_CUSTOMER_AD_TAG_CLASS"
    );
    expect(DELIVERY_AD_CUSTOMER_AD_TAG_CLASS).toContain("#FF8A00");
  });
});
