/**
 * 2026-10-29 배달 샘플 — 홈 선반 카드 샘플 배지(실매장과 같은 카드 + 배지) · 「지금 주문 가능」도 실매장과 같은 기준 (Owner 2026-10-29).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import { storeMatchesHomeDataSource } from "@/lib/stores/product/stores-home-data-source";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function item(id: string, isSample: boolean): StoreHomeFeedItem {
  return {
    id, slug: id, nameKo: id, tagline: null, primarySlug: "restaurant", primaryNameKo: "음식", regionLabel: "Manila",
    status: "open", rating: 4.5, reviewCount: 10, deliveryAvailable: true, pickupAvailable: true, minOrderLabel: null,
    estPrepLabel: "20분", prepMinutes: 20, rideMinutes: 15, etaLabel: "약 25~35분", deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null, paymentMethodsLine: "", distanceKm: 1.2,
    featuredItems: [{ productId: `p-${id}`, name: "치킨", price: 500 }], profileImageUrl: null, isFeatured: false,
    isSample,
    commerce: {
      minOrderPhp: null, deliveryFeePhp: null, freeDeliveryOverPhp: null, deliveryCourierLabel: null, deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null, prepMinutes: 20, estPrepLabel: "20분", deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null, paymentMethodsConfig: null,
    },
    firstListedAt: null,
  };
}

describe("order_now treats samples like real stores (Owner 2026-10-29)", () => {
  it("one definition: data source and composer agree", () => {
    expect(storeMatchesHomeDataSource(item("real", false), "order_now")).toBe(true);
    expect(storeMatchesHomeDataSource(item("sample", true), "order_now")).toBe(true);
    const composition = composeStoresHomeFeed([item("sample", true), item("real", false)]);
    expect(composition.slot0Food.map((e) => e.storeId)).toEqual(["sample", "real"]);
    expect(read("lib/stores/stores-home-composer.ts")).toContain("storeMatchesHomeDataSource(s, source, nowMs)");
  });
});

describe("U-1 home shelf cards mark sample stores", () => {
  it("food entries carry isSample from the feed row", () => {
    const composition = composeStoresHomeFeed([item("sample", true), item("real", false)]);
    const entries = Object.values(composition).flat().filter((e) => e && typeof e === "object" && "productId" in e) as Array<{
      storeId: string; isSample?: boolean;
    }>;
    expect(entries.find((e) => e.storeId === "sample")?.isSample).toBe(true);
    expect(entries.find((e) => e.storeId === "real")?.isSample).toBe(false);
  });

  it("every home shelf card keeps the real-store content and adds the same sample badge as list cards", () => {
    for (const f of [
      "components/stores/home/presentation/StoresHomeFoodRailCard.tsx",
      "components/stores/home/presentation/StoresHomeHighRatingFoodCard.tsx",
      "components/stores/home/presentation/StoresHomeStoreHorizontalCard.tsx",
      "components/stores/home/presentation/StoresHomeStoreTeaserCard.tsx",
      "components/stores/home/presentation/StoresHomeBrandCircularCard.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toContain("{entry.isSample ? <StoresHomeSampleCardTag /> : null}");
      if (!f.endsWith("BrandCircularCard.tsx")) expect(src, f).toContain("entry.etaLabel ?");
    }
    const tag = read("components/stores/home/presentation/StoresHomeSampleCardTag.tsx");
    expect(tag).toContain('t("store_sample_badge")');
    expect(tag).toContain("bg-sam-warning-soft");
  });
});

describe("S-4 store detail bottom bar shows the order block reason", () => {
  it("blocked stores (sample, sales not approved) never read 「주문 가능해요」", () => {
    const strip = read("components/stores/StoreDetailBottomStrip.tsx");
    expect(strip).toContain("if (orderBlockedMessage) return orderBlockedMessage;");
    expect(read("components/stores/detail/StoreDetailCartChrome.tsx").match(/orderBlockedMessage=\{orderBlockedMessage\}/g)?.length).toBe(2);
    expect(read("components/stores/StoreDetailPublic.tsx")).toContain(
      "orderBlockedMessage={ownerOrderBlocked ? ownerOrderBlockedMessage : null}"
    );
  });
});
