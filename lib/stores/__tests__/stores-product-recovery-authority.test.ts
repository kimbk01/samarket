import { describe, expect, it } from "vitest";
import {
  isBrowseScopeSubOverrideRow,
  resolveBrowseScopePolicy,
  type StoresBrowseScopePolicyRow,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { resolveHomeShelfShowAllHref } from "@/lib/stores/product/stores-home-shelf-product-config";
import { resolveHomeShelfStoreImage } from "@/lib/stores/product/stores-home-shelf-image-resolve";
import {
  buildHomeInsertionBenefitMaps,
  resolveHomeShelfCardBenefit,
} from "@/lib/stores/product/stores-home-shelf-card-benefit";
import { STORES_HOME_SHELF_PRODUCT_CATALOG } from "@/lib/stores/product/stores-home-shelf-product-catalog";
import { resolveHomeShelfProductCatalog } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

describe("HOME + CATEGORY product recovery authority", () => {
  it("resolves shelf title/subtitle/showAll from catalog defaults", () => {
    const shelves = resolveHomeShelfProductCatalog([]);
    const orderNow = shelves.find((s) => s.shelfId === "order_now");
    expect(orderNow?.titleKo).toBe("지금 주문 가능");
    expect(orderNow?.productConfig.showAllEnabled).toBe(true);
    expect(resolveHomeShelfShowAllHref(orderNow!.productConfig.showAllRouteKey)).toMatch(
      /\/stores\/browse/
    );
  });

  it("maps presentation dispatch owners from catalog without dual defaults", () => {
    const available = STORES_HOME_SHELF_PRODUCT_CATALOG.filter((s) => s.composerSlot);
    expect(available.length).toBeGreaterThan(5);
    for (const shelf of available) {
      expect(shelf.defaultPresentation).toBeTruthy();
      expect(shelf.defaultProductConfig.entityType).toMatch(/product|store|brand/);
    }
  });

  it("resolves store imageSource authority", () => {
    const store = {
      id: "s1",
      profileImageUrl: "https://cdn.example/profile.jpg",
      featuredItems: [{ productId: "p1", name: "A", price: 1, imageUrl: "https://cdn.example/product.jpg" }],
    } as unknown as StoreHomeFeedItem;
    expect(resolveHomeShelfStoreImage(store, "store_profile")).toContain("profile");
    expect(resolveHomeShelfStoreImage(store, "representative_product")).toContain("product");
  });

  it("binds coupon/ad onto card benefit (not separate rail)", () => {
    const maps = buildHomeInsertionBenefitMaps({
      paidAds: [
        {
          id: "ad1",
          storeId: "s1",
          title: "Ad",
          headline: "Sponsored deal",
          bodyCopy: null,
          imageUrl: null,
          placement: "home",
        },
      ],
      coupons: [
        {
          id: "c1",
          storeId: "s1",
          title: "Coupon",
          discountType: "percent",
          discountValue: 10,
          minOrderAmount: 100,
          termsCopy: null,
        },
      ],
    });
    const benefit = resolveHomeShelfCardBenefit({
      storeId: "s1",
      couponIntegration: "both",
      adIntegration: "both",
      badgeMode: "both",
      benefitLineMode: "auto",
      maps,
      labels: {
        sponsored: "Sponsored",
        coupon: "Coupon",
        couponDiscount: (d) => `${d} off`,
        couponMinOrder: (a) => `min ${a}`,
        adHeadline: (h) => h,
      },
    });
    expect(benefit?.imageBadgeLabel).toBe("Coupon");
    expect(benefit?.benefitLine).toContain("10%");
    expect(benefit?.sponsored).toBe(true);
  });

  it("treats pure inherit stubs as non-overrides", () => {
    const stub: StoresBrowseScopePolicyRow = {
      scopeKey: "restaurant/korean",
      primarySlug: "restaurant",
      subSlug: "korean",
      enabled: true,
      displayTitleKo: null,
      displayTitleEn: null,
      adEnabled: "inherit",
      couponEnabled: "inherit",
      maxInsertion: null,
      intervalEveryN: null,
      presentationMode: "inherit",
      scheduleStart: null,
      scheduleEnd: null,
      productConfig: {},
    };
    expect(isBrowseScopeSubOverrideRow(stub)).toBe(false);

    const primary: StoresBrowseScopePolicyRow = {
      scopeKey: "restaurant",
      primarySlug: "restaurant",
      subSlug: null,
      enabled: true,
      displayTitleKo: "식당",
      displayTitleEn: "Restaurant",
      adEnabled: true,
      couponEnabled: false,
      maxInsertion: 3,
      intervalEveryN: 5,
      presentationMode: "card_benefit_integrated",
      scheduleStart: null,
      scheduleEnd: null,
    };
    const inherited = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow: primary,
      subRow: stub,
    });
    expect(inherited.adEnabled).toBe(true);
    expect(inherited.intervalEveryN).toBe(5);
    expect(inherited.displayTitleKo).toBe("식당");
  });

  it("applies secondary override without changing primary resolve", () => {
    const primary: StoresBrowseScopePolicyRow = {
      scopeKey: "restaurant",
      primarySlug: "restaurant",
      subSlug: null,
      enabled: true,
      displayTitleKo: "식당",
      displayTitleEn: "Restaurant",
      adEnabled: false,
      couponEnabled: false,
      maxInsertion: null,
      intervalEveryN: 8,
      presentationMode: "card_benefit_integrated",
      scheduleStart: null,
      scheduleEnd: null,
    };
    const override: StoresBrowseScopePolicyRow = {
      scopeKey: "restaurant/korean",
      primarySlug: "restaurant",
      subSlug: "korean",
      enabled: true,
      displayTitleKo: "한식 커스텀",
      displayTitleEn: "Korean custom",
      adEnabled: true,
      couponEnabled: "inherit",
      maxInsertion: 2,
      intervalEveryN: 4,
      presentationMode: "card_benefit_integrated",
      scheduleStart: null,
      scheduleEnd: null,
    };
    const sub = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow: primary,
      subRow: override,
    });
    const all = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: null,
      primaryRow: primary,
      subRow: null,
    });
    expect(sub.adEnabled).toBe(true);
    expect(sub.displayTitleKo).toBe("한식 커스텀");
    expect(sub.intervalEveryN).toBe(4);
    expect(all.adEnabled).toBe(false);
    expect(all.displayTitleKo).toBe("식당");
  });

  it("preserves organic id order in insertion plan shape contract", async () => {
    const { planStoresBrowseInsertions } = await import(
      "@/lib/stores/composition/stores-composition-insertion-live"
    );
    const organic = ["a", "b", "c", "d"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [],
      coupons: [],
      policy: [
        {
          surface: "browse",
          slot: "organic_discovery_list",
          contentType: "store",
          enabled: true,
          order: 0,
          interval: { consumed: false, reason: "NOT_CONSUMED" },
          max: null,
          titleAuthority: "none",
        },
        {
          surface: "browse",
          slot: "future_ad_insertion",
          contentType: "ad",
          enabled: false,
          order: 1,
          interval: { consumed: false, reason: "NOT_CONSUMED" },
          max: null,
          titleAuthority: "none",
        },
        {
          surface: "browse",
          slot: "future_coupon_insertion",
          contentType: "coupon",
          enabled: false,
          order: 2,
          interval: { consumed: false, reason: "NOT_CONSUMED" },
          max: null,
          titleAuthority: "none",
        },
      ],
    });
    expect(plan.organicIds).toEqual(organic);
    expect(plan.rows.filter((r) => r.kind === "organic").map((r) => r.storeId)).toEqual(organic);
  });
});
