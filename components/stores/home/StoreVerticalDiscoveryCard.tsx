"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useRouter } from "next/navigation";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreCardFavoriteIcon } from "./StoreCardFavoriteIcon";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { dibayPerfRecordStoreCardNavigationIntent } from "@/lib/dibay/delivery-flow-perf";
import { markStoreDetailListSeedNavigation } from "@/lib/dibay/store-detail-seed-patch-trace";
import {
  navigateToDeliveryStoreCard,
  navigateToDeliveryStoreProduct,
} from "@/lib/navigation/navigate-to-delivery-store-product";
import { writeStoreDetailListSeed } from "@/lib/dibay/store-detail-list-seed";
import {
  DELIVERY_PERF_TAG_ROUTE_TRANSITION,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import { deliveryStoreDetailPrefetch } from "@/lib/dibay/delivery-store-detail-prefetch";
import { deliveryMenuVisibleBeginNavSession } from "@/lib/dibay/delivery-menu-visible-trace";
import {
  deliveryStoreMenusPrewarm,
  resetDeliveryStoreMenusPrewarmForTests,
} from "@/lib/dibay/delivery-store-menus-prewarm";
import { useDeliveryStoreDetailViewportPrefetch } from "@/lib/dibay/use-delivery-store-detail-viewport-prefetch";

import type { MessageKey } from "@/lib/i18n/messages";

function statusBadge(
  status: BrowseStoreListItem["status"],
  t: (key: MessageKey, params?: Record<string, string | number>) => string
) {
  if (status === "open") {
    return (
      <span className="shrink-0 rounded-ui-rect bg-sam-success-soft px-2 py-0.5 sam-text-helper font-semibold text-sam-success">
        {t("store_open_now")}
      </span>
    );
  }
  if (status === "preparing") {
    return (
      <span className="shrink-0 rounded-ui-rect bg-sam-warning-soft px-2 py-0.5 sam-text-helper font-semibold text-sam-warning">
        {t("store_preparing")}
      </span>
    );
  }
  if (status === "resting") {
    return (
      <span className="shrink-0 rounded-ui-rect bg-sam-warning-soft px-2 py-0.5 sam-text-helper font-semibold text-sam-warning">
        {t("store_resting_now")}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 sam-text-helper font-semibold text-sam-muted">
      {t("store_closed_now")}
    </span>
  );
}

export type StoreVerticalCardModel = Pick<
  BrowseStoreListItem,
  | "slug"
  | "nameKo"
  | "tagline"
  | "primaryNameKo"
  | "subNameKo"
  | "regionLabel"
  | "status"
  | "rating"
  | "reviewCount"
  | "deliveryAvailable"
  | "pickupAvailable"
  | "visitAvailable"
  | "featuredItems"
  | "profileImageUrl"
  | "heroBannerImageUrl"
  | "isFeatured"
  | "estPrepLabel"
  | "deliveryFeeLabel"
  | "deliveryFeeStrikePhp"
  | "paymentMethodsLine"
> & {
  /** 홈 피드 전용 — km */
  distanceKm?: number | null;
  routeDistanceKm?: number | null;
  straightDistanceKm?: number | null;
  /** `약 …` 합산 ETA — 없으면 estPrepLabel만 표시 */
  etaLabel?: string | null;
};

export function browseItemToVerticalModel(store: BrowseStoreListItem): StoreVerticalCardModel {
  return {
    slug: store.slug,
    nameKo: store.nameKo,
    tagline: store.tagline,
    primaryNameKo: store.primaryNameKo,
    subNameKo: store.subNameKo,
    regionLabel: store.regionLabel,
    status: store.status,
    rating: store.rating,
    reviewCount: store.reviewCount,
    deliveryAvailable: store.deliveryAvailable,
    pickupAvailable: store.pickupAvailable,
    visitAvailable: store.visitAvailable,
    featuredItems: store.featuredItems,
    profileImageUrl: store.profileImageUrl,
    heroBannerImageUrl: store.heroBannerImageUrl ?? null,
    isFeatured: store.isFeatured,
    estPrepLabel: store.estPrepLabel ?? "",
    etaLabel: store.etaLabel,
    deliveryFeeLabel: store.deliveryFeeLabel ?? null,
    deliveryFeeStrikePhp: store.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: store.paymentMethodsLine ?? "",
    distanceKm: store.distanceKm ?? null,
    routeDistanceKm: store.routeDistanceKm ?? null,
    straightDistanceKm: store.straightDistanceKm ?? null,
  };
}

export function homeFeedItemToVerticalModel(store: StoreHomeFeedItem): StoreVerticalCardModel {
  return {
    slug: store.slug,
    nameKo: store.nameKo,
    tagline: store.tagline,
    primaryNameKo: store.primaryNameKo ?? "",
    subNameKo: "",
    regionLabel: store.regionLabel,
    status: store.status,
    rating: store.rating,
    reviewCount: store.reviewCount,
    deliveryAvailable: store.deliveryAvailable,
    pickupAvailable: store.pickupAvailable,
    visitAvailable: true,
    featuredItems: store.featuredItems,
    profileImageUrl: store.profileImageUrl,
    heroBannerImageUrl: null,
    isFeatured: store.isFeatured,
    estPrepLabel: store.estPrepLabel,
    etaLabel: store.etaLabel,
    deliveryFeeLabel: store.deliveryFeeLabel,
    deliveryFeeStrikePhp: store.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: store.paymentMethodsLine ?? "",
    distanceKm: store.distanceKm,
    routeDistanceKm: store.routeDistanceKm ?? null,
    straightDistanceKm: store.straightDistanceKm ?? null,
  };
}

export function StoreVerticalDiscoveryCard({
  store,
  adHint,
}: {
  store: StoreVerticalCardModel;
  /** 광고·추천 등 부가 라벨 */
  adHint?: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const viewportRef = useDeliveryStoreDetailViewportPrefetch(store.slug);
  const freeDeliveryLabel = t("store_free_delivery_applied");
  const flags = [
    store.deliveryAvailable ? t("store_delivery_available") : null,
    store.pickupAvailable ? t("store_pickup_available") : null,
    store.visitAvailable ? t("store_visit_available") : null,
  ].filter(Boolean) as string[];

  const storeHref = `/stores/${encodeURIComponent(store.slug)}`;
  const prefetchStoreDetail = (
    source: Parameters<typeof deliveryStoreDetailPrefetch>[2],
    opts?: { force?: boolean }
  ) => {
    deliveryStoreDetailPrefetch(router, store.slug, source, opts);
  };
  const prefetchProductDetail = (_productId: string) => {
    /* RSC storm 방지 — 상품 상세는 탭 시 `deliveryStoreDetailPrefetch`·Link 마운트로만 */
  };
  const primaryName = store.primaryNameKo?.trim() || t("store_fallback_name");
  const categoryLine =
    store.subNameKo?.trim() ?
      `${primaryName} · ${store.subNameKo}`
    : primaryName;

  const distLabel =
    store.distanceKm != null && Number.isFinite(store.distanceKm) ?
      `${store.distanceKm < 1 ? Math.round(store.distanceKm * 1000) + "m" : store.distanceKm.toFixed(1) + "km"}`
    : null;

  return (
    <li className={`overflow-hidden ${FB.card}`}>
      <Link
        ref={viewportRef}
        href={storeHref}
        prefetch={false}
        className={`block ${FB.cardPress}`}
        onPointerEnter={() => prefetchStoreDetail("pointer_enter")}
        onFocus={() => prefetchStoreDetail("focus")}
        onPointerDown={() => {
          deliveryStoreMenusPrewarm(store.slug);
          prefetchStoreDetail("pointer_down", { force: true });
        }}
        onTouchStart={() => {
          deliveryStoreMenusPrewarm(store.slug);
          prefetchStoreDetail("touch_start", { force: true });
        }}
        onClick={(e) => {
          e.preventDefault();
          resetDeliveryStoreMenusPrewarmForTests();
          deliveryStoreMenusPrewarm(store.slug, { force: true });
          writeStoreDetailListSeed({
            slug: store.slug,
            store_name: store.nameKo,
            hero_image_url: store.heroBannerImageUrl,
            rating_avg: store.rating,
            review_count: store.reviewCount,
            delivery_available: store.deliveryAvailable,
            pickup_available: store.pickupAvailable,
            tagline: store.tagline,
          });
          markStoreDetailListSeedNavigation(store.slug);
          dibayPerfRecordStoreCardNavigationIntent(store.slug);
          deliveryMenuVisibleBeginNavSession(store.slug);
          deliveryPerfTraceLog(DELIVERY_PERF_TAG_ROUTE_TRANSITION, {
            event: "vertical_store_card_tap",
            slug: store.slug,
          });
          navigateToDeliveryStoreCard(router, { storeSlug: store.slug });
        }}
      >
        <div className={`relative aspect-[5/3] w-full overflow-hidden ${FB.thumbMuted}`}>
          {store.profileImageUrl ?
            <SamarketThumbnail
              src={store.profileImageUrl}
              fill
              fetchDisplayPx={180}
              roundedClassName="rounded-none"
              className={FB.thumbMuted}
              loading="lazy"
            />
          : <div className={FB.placeholderHero}>
              <svg className="h-14 w-14 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9zm8 4v2m-4-2v2"
                />
              </svg>
            </div>
          }
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {store.isFeatured ?
              <span className={FB.badgeFeatured}>
                {t("store_badge_recommended")}
              </span>
            : null}
            {adHint ?
              <span className={FB.badgeNeutral}>
                {adHint}
              </span>
            : null}
          </div>
          <div className="absolute right-2 top-2">
            <StoreCardFavoriteIcon slug={store.slug} />
          </div>
        </div>

        <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={`truncate ${FB.name}`}>{store.nameKo}</p>
              <p className={`mt-0.5 ${FB.metaSm}`}>{categoryLine}</p>
            </div>
            {statusBadge(store.status, t)}
          </div>

          {store.tagline?.trim() ?
            <p className={`line-clamp-2 ${FB.body}`}>{store.tagline}</p>
          : null}

          <div className={`flex flex-wrap gap-x-2 gap-y-1 ${FB.metaSm}`}>
            <span className={FB.ratingValue}>★ {store.rating.toFixed(1)}</span>
            <span>{t("store_reviews_count", { count: store.reviewCount.toLocaleString("en-PH") })}</span>
            {distLabel ?
              <span className={FB.distance}>{distLabel}</span>
            : null}
            {store.etaLabel?.trim() ?
              <span>{store.etaLabel}</span>
            : <span>{t("store_est_prep", { label: store.estPrepLabel })}</span>}
            {store.deliveryFeeLabel === freeDeliveryLabel ?
              <span className="inline-flex flex-wrap items-center gap-1">
                <span className={`text-[13px] ${FB.freeDelivery}`}>
                  {freeDeliveryLabel}
                </span>
                {store.deliveryFeeStrikePhp != null && store.deliveryFeeStrikePhp > 0 ?
                  <span className={FB.strike}>
                    {formatMoneyPhp(store.deliveryFeeStrikePhp)}
                  </span>
                : null}
              </span>
            : store.deliveryFeeLabel ?
              <span>{store.deliveryFeeLabel}</span>
            : store.deliveryAvailable ?
              <span>{t("store_delivery_fee_per_store")}</span>
            : null}
          </div>

          <p className={FB.metaSm}>{store.regionLabel}</p>

          {flags.length > 0 ?
            <div className="flex flex-wrap gap-1">
              {flags.map((f) => (
                <span
                  key={f}
                  className={FB.chip}
                >
                  {f}
                </span>
              ))}
            </div>
          : null}

          {store.paymentMethodsLine?.trim() ?
            <p
              className={FB.metaPayment}
              title={store.paymentMethodsLine}
            >
              <span className={FB.metaPaymentLabel}>{t("store_label_payment")}</span> · {store.paymentMethodsLine}
            </p>
          : null}
        </div>
      </Link>

      {store.featuredItems.length > 0 ?
        <ul className={`border-t px-3 pb-3 pt-2 ${FB.divider}`}>
          {store.featuredItems.slice(0, 3).map((it) => (
            <li key={it.productId}>
              {(() => {
                const productHref = `/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(it.productId)}`;
                return (
              <Link
                href={productHref}
                className={`flex justify-between gap-2 rounded-ui-rect py-1.5 sam-text-body-secondary ${FB.rowActive}`}
                onPointerEnter={() => prefetchProductDetail(it.productId)}
                onFocus={() => prefetchProductDetail(it.productId)}
                onTouchStart={() => prefetchProductDetail(it.productId)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  markStoreDetailListSeedNavigation(store.slug);
                  deliveryPerfTraceLog(DELIVERY_PERF_TAG_ROUTE_TRANSITION, {
                    event: "vertical_featured_product_tap",
                    slug: store.slug,
                    product_id: it.productId,
                  });
                  navigateToDeliveryStoreProduct(router, {
                    storeSlug: store.slug,
                    productId: it.productId,
                    childMode: "productPage",
                  });
                }}
              >
                <span className={`truncate ${FB.link}`}>{it.name}</span>
                <span className={FB.priceStrong}>
                  {formatMoneyPhp(it.price)}
                </span>
              </Link>
                );
              })()}
            </li>
          ))}
        </ul>
      : null}
    </li>
  );
}
