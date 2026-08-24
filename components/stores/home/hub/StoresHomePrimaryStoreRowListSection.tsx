"use client";

import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeStoreCardList } from "@/components/stores/home/hub/StoresHomeStoreCard";
import { StoresHomeStoreHorizontalCard } from "@/components/stores/home/presentation/StoresHomeStoreHorizontalCard";
import { StoresHomeStoreTeaserCard } from "@/components/stores/home/presentation/StoresHomeStoreTeaserCard";
import { StoresHomeTimesaleRowCardList } from "@/components/stores/home/presentation/StoresHomeTimesaleRowCard";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { STORES_HOME_RAIL_SCROLL } from "@/lib/stores/stores-home-ui";
import { storeHomeFeedItemToShelfEntry } from "@/lib/stores/product/stores-home-store-to-shelf-entry";
import { resolveHomeShelfStoreImage } from "@/lib/stores/product/stores-home-shelf-image-resolve";
import type { StoresHomeShelfImageSource } from "@/lib/stores/product/stores-home-shelf-product-config";
import type {
  StoresHomeShelfAdIntegration,
  StoresHomeShelfCouponIntegration,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import type {
  StoresHomeShelfBadgeMode,
  StoresHomeShelfBenefitLineMode,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import {
  resolveHomeShelfCardBenefit,
  type StoresHomeInsertionBenefitMaps,
} from "@/lib/stores/product/stores-home-shelf-card-benefit";

/**
 * CONTRACT — `/stores` hero 아래 **즉시** 마운트되는 매장 row 목록.
 * Shell copy/CTA/presentation/image/benefit은 HOME shelf CMS authority만 소비한다.
 */
export function StoresHomePrimaryStoreRowListSection({
  stores,
  hydratedByStoreId,
  getPhase,
  registerListItem,
  title,
  subtitle,
  actionHref,
  actionLabel,
  presentation = "timesale_vertical",
  locale = "ko",
  imageSource = "auto",
  benefitMaps,
  benefitLabels,
  couponIntegration = "off",
  adIntegration = "off",
  badgeMode = "standard",
  benefitLineMode = "auto",
}: {
  stores: StoreHomeFeedItem[];
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
  title: string;
  subtitle?: string | null;
  actionHref?: string | null;
  actionLabel?: string;
  presentation?: StoresHomePresentationPatternId;
  locale?: AppLanguageCode;
  imageSource?: StoresHomeShelfImageSource;
  benefitMaps?: StoresHomeInsertionBenefitMaps;
  benefitLabels?: Parameters<typeof resolveHomeShelfCardBenefit>[0]["labels"];
  couponIntegration?: StoresHomeShelfCouponIntegration;
  adIntegration?: StoresHomeShelfAdIntegration;
  badgeMode?: StoresHomeShelfBadgeMode;
  benefitLineMode?: StoresHomeShelfBenefitLineMode;
}) {
  if (stores.length === 0) return null;

  const horizontal =
    presentation === "store_horizontal" || presentation === "store_teaser_horizontal";
  const emptyMaps: StoresHomeInsertionBenefitMaps = {
    adsByStoreId: new Map(),
    couponsByStoreId: new Map(),
  };
  const maps = benefitMaps ?? emptyMaps;
  const labels = benefitLabels ?? {
    sponsored: "Sponsored",
    coupon: "Coupon",
    couponDiscount: (d: string) => d,
    couponMinOrder: (a: string) => a,
    adHeadline: (h: string) => h,
  };

  return (
    <div data-stores-home-primary-row-list data-stores-home-presentation={presentation}>
      <StoresHomeSectionShell
        title={title}
        subtitle={subtitle}
        actionHref={actionHref}
        actionLabel={actionLabel}
      >
        {presentation === "timesale_vertical" ?
          <StoresHomeTimesaleRowCardList
            stores={stores}
            locale={locale}
            registerListItem={registerListItem}
            imageSource={imageSource}
            benefitMaps={maps}
            benefitLabels={labels}
            couponIntegration={couponIntegration}
            adIntegration={adIntegration}
            badgeMode={badgeMode}
            benefitLineMode={benefitLineMode}
          />
        : horizontal ?
          <div className={STORES_HOME_RAIL_SCROLL}>
            {stores.map((store) => {
              const entry = storeHomeFeedItemToShelfEntry(store);
              const imageUrl = resolveHomeShelfStoreImage(store, imageSource);
              const benefit = resolveHomeShelfCardBenefit({
                storeId: store.id,
                couponIntegration,
                adIntegration,
                badgeMode,
                benefitLineMode,
                maps,
                labels,
              });
              return presentation === "store_teaser_horizontal" ?
                  <StoresHomeStoreTeaserCard
                    key={store.id}
                    entry={entry}
                    imageUrl={imageUrl}
                    loadingImage={false}
                    benefit={benefit}
                  />
                : <StoresHomeStoreHorizontalCard
                    key={store.id}
                    entry={entry}
                    imageUrl={imageUrl}
                    loadingImage={false}
                    benefit={benefit}
                  />;
            })}
          </div>
        : (
          <StoresHomeStoreCardList
            stores={stores}
            hydratedByStoreId={hydratedByStoreId}
            getPhase={getPhase}
            registerListItem={registerListItem}
          />
        )}
      </StoresHomeSectionShell>
    </div>
  );
}
