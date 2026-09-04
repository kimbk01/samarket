"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeTimesaleRowCardList } from "@/components/stores/home/presentation/StoresHomeTimesaleRowCard";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import type {
  StoresHomeInsertionBenefitMaps,
} from "@/lib/stores/product/stores-home-shelf-card-benefit";
import type { StoresHomeShelfCouponIntegration } from "@/lib/stores/product/stores-home-shelf-product-catalog";
import type { resolveHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";

/** HOME store rows — A-VIS §3.1 timesale vertical (not CATEGORY card · not legacy menu strip). */
export function StoresHomeStoreCardList({
  stores,
  hydratedByStoreId: _hydratedByStoreId,
  getPhase: _getPhase,
  registerListItem,
  homeInsertions,
  feedStores,
  benefitMaps,
  benefitLabels,
  couponIntegration = "off",
}: {
  stores: StoreHomeFeedItem[];
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
  homeInsertions?: StoresHomeInsertionMeta;
  feedStores?: readonly StoreHomeFeedItem[];
  benefitMaps?: StoresHomeInsertionBenefitMaps;
  benefitLabels?: Parameters<typeof resolveHomeShelfCardBenefit>[0]["labels"];
  couponIntegration?: StoresHomeShelfCouponIntegration;
}) {
  const { language } = useI18n();
  return (
    <StoresHomeTimesaleRowCardList
      stores={stores}
      locale={language}
      registerListItem={registerListItem}
      homeInsertions={homeInsertions}
      feedStores={feedStores}
      benefitMaps={benefitMaps}
      benefitLabels={benefitLabels}
      couponIntegration={couponIntegration}
    />
  );
}
