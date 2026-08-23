import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { enrichBrowseStoresWithPlatformPopular } from "@/lib/stores/enrich-browse-stores-platform-popular";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { loadStorePopularProductStatsBatch } from "@/lib/stores/load-store-popular-product-stats-batch";

vi.mock("@/lib/stores/load-commerce-settings", () => ({
  loadCommerceSettings: vi.fn(),
}));

vi.mock("@/lib/stores/load-store-popular-product-stats-batch", () => ({
  loadStorePopularProductStatsBatch: vi.fn(),
}));

function browseStore(id: string): BrowseStoreListItem {
  return {
    id,
    slug: `slug-${id}`,
    nameKo: "Store",
    tagline: null,
    primarySlug: "food",
    subSlug: "all",
    primaryNameKo: "Food",
    subNameKo: "All",
    regionLabel: "R",
    status: "open",
    rating: 4.5,
    reviewCount: 10,
    deliveryAvailable: true,
    pickupAvailable: true,
    visitAvailable: true,
    featuredItems: [],
    profileImageUrl: null,
    heroBannerImageUrl: null,
    isFeatured: false,
    estPrepLabel: "",
    prepMinutes: null,
    rideMinutes: null,
    etaLabel: "",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    minOrderLabel: null,
    commerce: {
      minOrderPhp: null,
      deliveryFeePhp: null,
      freeDeliveryOverPhp: null,
      deliveryCourierLabel: null,
      deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null,
      prepMinutes: null,
      estPrepLabel: "",
      deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null,
      paymentMethodsConfig: null,
    },
  };
}

describe("enrichBrowseStoresWithPlatformPopular (P1-B3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCommerceSettings).mockResolvedValue({
      autoCompleteDays: 7,
      settlementFeeBp: 0,
      settlementDelayDays: 0,
      popularMenuWindowDays: 30,
      popularMenuMinQty: 1,
      popularMenuTopN: 3,
      popularMenuRecommendedMax: 6,
    });
  });

  it("attaches rank1 when catalog active; rank1 missing → rank2", async () => {
    vi.mocked(loadStorePopularProductStatsBatch).mockResolvedValue({
      status: "ok",
      byStoreId: new Map([
        [
          "s1",
          [
            {
              storeId: "s1",
              productId: "p1",
              totalQty: 50,
              lastOrderedAt: "2026-01-01",
              popularRank: 1,
            },
            {
              storeId: "s1",
              productId: "p2",
              totalQty: 10,
              lastOrderedAt: "2026-01-02",
              popularRank: 2,
            },
          ],
        ],
      ]),
    });

    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [
                {
                  id: "p2",
                  store_id: "s1",
                  title: "Rank2 Active",
                  price: 200,
                  thumbnail_url: null,
                },
              ],
              error: null,
            })),
          })),
        })),
      })),
    };

    const stores = [browseStore("s1")];
    const result = await enrichBrowseStoresWithPlatformPopular(sb as never, stores);

    expect(result.popularProductStatsStatus).toBe("ok");
    expect(stores[0].platformPopularProduct?.productId).toBe("p2");
    expect(stores[0].platformPopularProduct?.name).toBe("Rank2 Active");
    expect(stores[0].featuredItems).toEqual([]);
  });

  it("stats batch error → omit field, browse-safe", async () => {
    vi.mocked(loadStorePopularProductStatsBatch).mockResolvedValue({
      status: "error",
      byStoreId: new Map(),
    });

    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [
                {
                  id: "p1",
                  store_id: "s1",
                  title: "A",
                  price: 100,
                  thumbnail_url: null,
                },
              ],
              error: null,
            })),
          })),
        })),
      })),
    };

    const stores = [browseStore("s1")];
    await enrichBrowseStoresWithPlatformPopular(sb as never, stores);

    expect(stores[0].platformPopularProduct).toBeUndefined();
  });

  it("empty page → no queries", async () => {
    const result = await enrichBrowseStoresWithPlatformPopular({} as never, []);
    expect(result.queryCount).toBe(0);
    expect(loadStorePopularProductStatsBatch).not.toHaveBeenCalled();
  });
});
