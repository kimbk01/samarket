"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeFoodCard } from "@/components/stores/home/hub/StoresHomeFoodCard";
import { StoresHomePrimaryStoreRowListSection } from "@/components/stores/home/hub/StoresHomePrimaryStoreRowListSection";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeStoreCardList } from "@/components/stores/home/hub/StoresHomeStoreCard";
import { StoresHomeHighRatingFoodCard } from "@/components/stores/home/presentation/StoresHomeHighRatingFoodCard";
import { StoresHomeBrandCircularCard } from "@/components/stores/home/presentation/StoresHomeBrandCircularCard";
import { StoresHomeStoreHorizontalCard } from "@/components/stores/home/presentation/StoresHomeStoreHorizontalCard";
import { StoresHomeStoreTeaserCard } from "@/components/stores/home/presentation/StoresHomeStoreTeaserCard";
import { StoresHomeTimesaleRowCardList } from "@/components/stores/home/presentation/StoresHomeTimesaleRowCard";
import { DeliveryAdSponsoredBeacon } from "@/components/stores/advertising/DeliveryAdSponsoredBeacon";
import {
  resolveHomeShelfStoreImage,
} from "@/lib/stores/product/stores-home-shelf-image-resolve";
import {
  storeHomeFeedItemToShelfEntry,
} from "@/lib/stores/product/stores-home-store-to-shelf-entry";
import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import type { StoresHomeFeedComposition } from "@/lib/stores/stores-home-composer";
import { STORES_HOME_RAIL_SCROLL } from "@/lib/stores/stores-home-ui";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";
import { storesHomeShelfByComposerSlot } from "@/lib/stores/product/stores-home-shelf-product-catalog";
import {
  resolveHomeShelfForComposerSlot,
  resolveHomeShelfSubtitle,
  resolveHomeShelfTitle,
  type StoresHomeShelfResolvedConfig,
} from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { resolveHomeShelfShowAllHref } from "@/lib/stores/product/stores-home-shelf-product-config";
import {
  buildHomeInsertionBenefitMaps,
  orderHomeRestStoresForPaidInsertion,
  resolveHomeShelfCardBenefit,
} from "@/lib/stores/product/stores-home-shelf-card-benefit";
import { resolveHomeShelfFoodEntryImage } from "@/lib/stores/product/stores-home-shelf-image-resolve";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

function resolveShelfConfig(
  slot: StoresHomeCompositionSlotKey,
  shelves: readonly StoresHomeShelfResolvedConfig[] | undefined
): StoresHomeShelfResolvedConfig | null {
  const fromMeta = shelves?.find((s) => s.composerSlot === slot);
  if (fromMeta) return fromMeta;
  const def = storesHomeShelfByComposerSlot(slot);
  if (!def) return null;
  return resolveHomeShelfForComposerSlot(slot, [])!;
}

function renderFoodEntryCard(
  presentation: StoresHomeShelfResolvedConfig["presentation"],
  entry: StoresHomeFoodEntry,
  img: { imageUrl: string | null; loading: boolean },
  benefit: ReturnType<typeof resolveHomeShelfCardBenefit> | undefined,
  markStoreCardPerf?: boolean
) {
  const key = `${entry.storeId}-${entry.productId}`;
  switch (presentation) {
    case "store_horizontal":
      return (
        <StoresHomeStoreHorizontalCard
          key={key}
          entry={entry}
          imageUrl={img.imageUrl}
          loadingImage={img.loading}
          benefit={benefit}
        />
      );
    case "high_rating_horizontal":
      return (
        <StoresHomeHighRatingFoodCard
          key={key}
          entry={entry}
          imageUrl={img.imageUrl}
          loadingImage={img.loading}
          benefit={benefit}
        />
      );
    case "brand_circular":
      return (
        <StoresHomeBrandCircularCard
          key={key}
          entry={entry}
          imageUrl={img.imageUrl}
          loadingImage={img.loading}
          benefit={benefit}
        />
      );
    case "store_teaser_horizontal":
      return (
        <StoresHomeStoreTeaserCard
          key={key}
          entry={entry}
          imageUrl={img.imageUrl}
          loadingImage={img.loading}
          benefit={benefit}
        />
      );
    case "editorial_grid":
      return (
        <StoresHomeFoodCard
          key={key}
          entry={entry}
          imageUrl={img.imageUrl}
          loadingImage={img.loading}
          presentation="grid"
          benefit={benefit}
        />
      );
    case "food_horizontal":
    default:
      return (
        <StoresHomeFoodCard
          key={key}
          entry={entry}
          imageUrl={img.imageUrl}
          loadingImage={img.loading}
          markStoreCardPerf={markStoreCardPerf}
          benefit={benefit}
        />
      );
  }
}

function renderFoodRail(
  entries: readonly StoresHomeFoodEntry[],
  shelf: StoresHomeShelfResolvedConfig,
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>,
  benefitMaps: ReturnType<typeof buildHomeInsertionBenefitMaps>,
  benefitLabels: Parameters<typeof resolveHomeShelfCardBenefit>[0]["labels"],
  markFirst?: boolean
) {
  return (
    <div className={STORES_HOME_RAIL_SCROLL}>
      {entries.map((entry, idx) => {
        const ad = benefitMaps.adsByStoreId.get(entry.storeId);
        const img = resolveHomeShelfFoodEntryImage(
          entry,
          hydratedByStoreId.get(entry.storeId),
          shelf.productConfig.imageSource,
          ad?.imageUrl ?? null
        );
        const benefit = resolveHomeShelfCardBenefit({
          storeId: entry.storeId,
          couponIntegration: shelf.couponIntegration,
          adIntegration: shelf.adIntegration,
          badgeMode: shelf.productConfig.badgeMode,
          benefitLineMode: shelf.productConfig.benefitLineMode,
          maps: benefitMaps,
          labels: benefitLabels,
        });
        return renderFoodEntryCard(
          shelf.presentation,
          entry,
          img,
          benefit,
          markFirst && idx === 0
        );
      })}
    </div>
  );
}

export function StoresHomeCompositionSlotSection({
  slot,
  composition,
  hydratedByStoreId,
  getPhase,
  registerListItem,
  markFirstFoodCardPerf,
  shelfProduct,
  homeInsertions,
}: {
  slot: StoresHomeCompositionSlotKey;
  composition: StoresHomeFeedComposition;
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
  markFirstFoodCardPerf?: boolean;
  shelfProduct?: readonly StoresHomeShelfResolvedConfig[];
  homeInsertions?: StoresHomeInsertionMeta;
}) {
  const { t, language } = useI18n();
  const shelf = resolveShelfConfig(slot, shelfProduct);
  const benefitMaps = useMemo(
    () => buildHomeInsertionBenefitMaps(homeInsertions),
    [homeInsertions]
  );
  const benefitLabels = useMemo(
    () => ({
      sponsored: t("store_insertion_sponsored"),
      coupon: t("store_badge_coupon"),
      couponDiscount: (discount: string) => t("store_insertion_coupon_discount", { discount }),
      couponMinOrder: (amount: string) => t("store_insertion_coupon_min_order", { amount }),
      adHeadline: (headline: string) => headline,
    }),
    [t]
  );

  const title =
    shelf ? resolveHomeShelfTitle(shelf, language === "ko" ? "ko" : "en") : t("store_feed_stores_title");
  const subtitle = shelf ? resolveHomeShelfSubtitle(shelf, language === "ko" ? "ko" : "en") : null;
  const showAllHref =
    shelf?.productConfig.showAllEnabled && shelf.productConfig.showAllRouteKey !== "none"
      ? resolveHomeShelfShowAllHref(shelf.productConfig.showAllRouteKey)
      : null;
  const showAllLabel =
    language === "ko"
      ? shelf?.productConfig.showAllLabelKo?.trim() || t("store_browse_view_all")
      : shelf?.productConfig.showAllLabelEn?.trim() || t("store_browse_view_all");

  const wrap = (node: ReactNode) => (
    <div
      data-composition-slot={slot}
      data-stores-home-composition-slot={slot}
      data-stores-home-shelf-id={shelf?.shelfId}
      data-stores-home-presentation={shelf?.presentation}
      data-stores-home-entity-type={shelf?.productConfig.entityType}
    >
      {node}
    </div>
  );

  if (!shelf) return null;
  if (!shelf.customerVisible) return null;

  switch (slot) {
    case "slot0Food": {
      const entries =
        shelf.max != null ? composition.slot0Food.slice(0, shelf.max) : composition.slot0Food;
      return wrap(
        <StoresHomeSectionShell title={title} subtitle={subtitle} actionHref={showAllHref} actionLabel={showAllLabel}>
          {renderFoodRail(
            entries,
            shelf,
            hydratedByStoreId,
            benefitMaps,
            benefitLabels,
            markFirstFoodCardPerf
          )}
        </StoresHomeSectionShell>
      );
    }
    case "slot1Stores": {
      const stores =
        shelf.max != null ? composition.slot1Stores.slice(0, shelf.max) : composition.slot1Stores;
      if (stores.length === 0) return null;
      return wrap(
        <StoresHomePrimaryStoreRowListSection
          stores={stores}
          hydratedByStoreId={hydratedByStoreId}
          getPhase={getPhase}
          registerListItem={registerListItem}
          title={title}
          subtitle={subtitle}
          actionHref={showAllHref}
          actionLabel={showAllLabel}
          presentation={shelf.presentation}
          locale={language === "ko" ? "ko" : "en"}
          imageSource={shelf.productConfig.imageSource}
          benefitMaps={benefitMaps}
          benefitLabels={benefitLabels}
          couponIntegration={shelf.couponIntegration}
          adIntegration={shelf.adIntegration}
          badgeMode={shelf.productConfig.badgeMode}
          benefitLineMode={shelf.productConfig.benefitLineMode}
        />
      );
    }
    case "slot2Food":
    case "newStoreFood":
    case "campaignFood":
    case "slot3Food":
    case "slot4Food": {
      const raw =
        slot === "slot2Food" ? composition.slot2Food
        : slot === "newStoreFood" ? composition.newStoreFood
        : slot === "campaignFood" ? composition.campaignFood
        : slot === "slot3Food" ? composition.slot3Food
        : composition.slot4Food;
      const entries = shelf.max != null ? raw.slice(0, shelf.max) : raw;
      if (entries.length === 0) return null;
      return wrap(
        <StoresHomeSectionShell title={title} subtitle={subtitle} actionHref={showAllHref} actionLabel={showAllLabel}>
          {renderFoodRail(entries, shelf, hydratedByStoreId, benefitMaps, benefitLabels, markFirstFoodCardPerf)}
        </StoresHomeSectionShell>
      );
    }
    case "slot5Food": {
      const entries =
        shelf.max != null ? composition.slot5Food.slice(0, shelf.max) : composition.slot5Food;
      if (entries.length === 0) return null;
      return wrap(
        <StoresHomeSectionShell title={title} subtitle={subtitle} actionHref={showAllHref} actionLabel={showAllLabel}>
          {shelf.presentation === "editorial_grid" ?
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {entries.map((entry) => {
                const img = resolveHomeShelfFoodEntryImage(
                  entry,
                  hydratedByStoreId.get(entry.storeId),
                  shelf.productConfig.imageSource
                );
                const benefit = resolveHomeShelfCardBenefit({
                  storeId: entry.storeId,
                  couponIntegration: shelf.couponIntegration,
                  adIntegration: shelf.adIntegration,
                  badgeMode: shelf.productConfig.badgeMode,
                  benefitLineMode: shelf.productConfig.benefitLineMode,
                  maps: benefitMaps,
                  labels: benefitLabels,
                });
                return (
                  <StoresHomeFoodCard
                    key={`featured-${entry.storeId}-${entry.productId}`}
                    entry={entry}
                    imageUrl={img.imageUrl}
                    loadingImage={img.loading}
                    presentation="grid"
                    benefit={benefit}
                  />
                );
              })}
            </div>
          : renderFoodRail(entries, shelf, hydratedByStoreId, benefitMaps, benefitLabels, markFirstFoodCardPerf)}
        </StoresHomeSectionShell>
      );
    }
    case "slot6NearbyStores":
    case "slot6RestStores": {
      const raw =
        slot === "slot6NearbyStores" ? composition.slot6NearbyStores : composition.slot6RestStores;
      const stores = shelf.max != null ? raw.slice(0, shelf.max) : raw;
      if (stores.length === 0) return null;
      const isRestPaidSurface = slot === "slot6RestStores";
      if (
        shelf.presentation === "store_horizontal" ||
        shelf.presentation === "store_teaser_horizontal"
      ) {
        const ordered = isRestPaidSurface
          ? orderHomeRestStoresForPaidInsertion(stores as StoreHomeFeedItem[], homeInsertions)
          : (stores as StoreHomeFeedItem[]).map((store) => ({
              store,
              isSponsored: false as const,
              campaignId: undefined as string | undefined,
              exposureToken: undefined as string | undefined,
            }));
        return wrap(
          <StoresHomeSectionShell title={title} subtitle={subtitle} actionHref={showAllHref} actionLabel={showAllLabel}>
            <div className={STORES_HOME_RAIL_SCROLL}>
              {ordered.map(({ store, isSponsored, campaignId, exposureToken }) => {
                const entry = storeHomeFeedItemToShelfEntry(store);
                const imageUrl = resolveHomeShelfStoreImage(store, shelf.productConfig.imageSource);
                const benefitBase = resolveHomeShelfCardBenefit({
                  storeId: store.id,
                  couponIntegration: shelf.couponIntegration,
                  adIntegration: isSponsored ? "sponsored_badge" : "off",
                  badgeMode: isSponsored ? "sponsored" : shelf.productConfig.badgeMode,
                  benefitLineMode: shelf.productConfig.benefitLineMode,
                  maps: isSponsored
                    ? {
                        ...benefitMaps,
                        adsByStoreId: new Map([
                          [
                            store.id,
                            {
                              id: campaignId ?? `sponsored-${store.id}`,
                              storeId: store.id,
                              title: "",
                              headline: "",
                              bodyCopy: null,
                              imageUrl: null,
                              placement: "stores_home",
                            },
                          ],
                        ]),
                      }
                    : benefitMaps,
                  labels: benefitLabels,
                });
                const benefit =
                  isSponsored && benefitBase
                    ? { ...benefitBase, sponsored: true }
                    : isSponsored
                      ? {
                          imageBadgeLabel: benefitLabels.sponsored,
                          imageBadgeClassName: "bg-amber-500/90 text-white",
                          benefitLine: null,
                          sponsored: true,
                        }
                      : benefitBase;
                const card =
                  shelf.presentation === "store_teaser_horizontal" ? (
                    <StoresHomeStoreTeaserCard
                      entry={entry}
                      imageUrl={imageUrl}
                      loadingImage={false}
                      benefit={benefit}
                    />
                  ) : (
                    <StoresHomeStoreHorizontalCard
                      entry={entry}
                      imageUrl={imageUrl}
                      loadingImage={false}
                      benefit={benefit}
                    />
                  );
                if (isSponsored && campaignId && exposureToken) {
                  return (
                    <DeliveryAdSponsoredBeacon
                      key={`ad-${campaignId}`}
                      campaignId={campaignId}
                      exposureToken={exposureToken}
                    >
                      {card}
                    </DeliveryAdSponsoredBeacon>
                  );
                }
                return (
                  <div key={store.id}>
                    {card}
                  </div>
                );
              })}
            </div>
          </StoresHomeSectionShell>
        );
      }
      if (shelf.presentation === "timesale_vertical") {
        return wrap(
          <StoresHomeSectionShell title={title} subtitle={subtitle} actionHref={showAllHref} actionLabel={showAllLabel}>
            <StoresHomeTimesaleRowCardList
              stores={stores as StoreHomeFeedItem[]}
              locale={language === "ko" ? "ko" : "en"}
              registerListItem={registerListItem}
              imageSource={shelf.productConfig.imageSource}
              benefitMaps={benefitMaps}
              benefitLabels={benefitLabels}
              couponIntegration={shelf.couponIntegration}
              adIntegration={isRestPaidSurface ? shelf.adIntegration : "off"}
              badgeMode={shelf.productConfig.badgeMode}
              benefitLineMode={shelf.productConfig.benefitLineMode}
              homeInsertions={isRestPaidSurface ? homeInsertions : undefined}
            />
          </StoresHomeSectionShell>
        );
      }
      return wrap(
        <StoresHomeSectionShell title={title} subtitle={subtitle} actionHref={showAllHref} actionLabel={showAllLabel}>
          <StoresHomeStoreCardList
            stores={stores}
            hydratedByStoreId={hydratedByStoreId}
            getPhase={getPhase}
            registerListItem={registerListItem}
            homeInsertions={isRestPaidSurface ? homeInsertions : undefined}
            benefitMaps={benefitMaps}
            benefitLabels={benefitLabels}
            couponIntegration={shelf.couponIntegration}
          />
        </StoresHomeSectionShell>
      );
    }
    default:
      return null;
  }
}
