"use client";
import { StoreSampleStoreBadge } from "@/components/stores/StoreSampleStoreBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  resolveStoreTaxonomyPrimaryDisplayName,
  resolveStoreTaxonomyTopicDisplayName,
} from "@/lib/stores/resolve-store-taxonomy-display-name";

import Link from "next/link";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useRouter } from "next/navigation";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreCardFavoriteIcon } from "./StoreCardFavoriteIcon";
import { FEED_UI } from "@/components/stores/store-feed-tokens";
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
import {
  formatStoreCardOutOfRangeLabel,
  resolveStoreListCardBadges,
} from "@/lib/stores/presentation/resolve-store-list-card-badges";

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
  | "primarySlug"
  | "subSlug"
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
  | "isSampleStore"
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
  /** CUT 10 — discovery serviceability (no client distance math) */
  distanceOutOfRange?: boolean;
  maxDeliveryDistanceKm?: number | null;
};

export function browseItemToVerticalModel(store: BrowseStoreListItem): StoreVerticalCardModel {
  return {
    slug: store.slug,
    nameKo: store.nameKo,
    tagline: store.tagline,
    primarySlug: store.primarySlug,
    subSlug: store.subSlug,
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
    isSampleStore: store.isSampleStore === true,
    estPrepLabel: store.estPrepLabel ?? "",
    etaLabel: store.etaLabel,
    deliveryFeeLabel: store.deliveryFeeLabel ?? null,
    deliveryFeeStrikePhp: store.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: store.paymentMethodsLine ?? "",
    distanceKm: store.distanceKm ?? null,
    routeDistanceKm: store.routeDistanceKm ?? null,
    straightDistanceKm: store.straightDistanceKm ?? null,
    distanceOutOfRange: store.distanceOutOfRange === true,
    maxDeliveryDistanceKm: store.maxDeliveryDistanceKm ?? null,
  };
}

export function homeFeedItemToVerticalModel(store: StoreHomeFeedItem): StoreVerticalCardModel {
  return {
    slug: store.slug,
    nameKo: store.nameKo,
    tagline: store.tagline,
    primarySlug: store.primarySlug ?? "",
    subSlug: "",
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
    isSampleStore: store.isSampleStore === true,
    estPrepLabel: store.estPrepLabel,
    etaLabel: store.etaLabel,
    deliveryFeeLabel: store.deliveryFeeLabel,
    deliveryFeeStrikePhp: store.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: store.paymentMethodsLine ?? "",
    distanceKm: store.distanceKm,
    routeDistanceKm: store.routeDistanceKm ?? null,
    straightDistanceKm: store.straightDistanceKm ?? null,
    distanceOutOfRange: store.distanceOutOfRange === true,
    maxDeliveryDistanceKm: store.maxDeliveryDistanceKm ?? null,
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
  const { t, language } = useI18n();
  const router = useRouter();
  const viewportRef = useDeliveryStoreDetailViewportPrefetch(store.slug);
  const freeDeliveryLabel = t("store_free_delivery_applied");
  const outOfRangeLabel = formatStoreCardOutOfRangeLabel({
    distanceOutOfRange: store.distanceOutOfRange === true,
    maxDeliveryDistanceKm: store.maxDeliveryDistanceKm,
    labelWithMax: (km) => t("store_delivery_distance_out_of_range_with_max", { km }),
    labelGeneric: t("store_delivery_distance_out_of_range"),
  });
  const statusBadgeMeta =
    store.status === "open"
      ? { label: t("store_open_now"), className: "bg-sam-success-soft text-sam-success" }
      : store.status === "preparing"
        ? { label: t("store_preparing"), className: "bg-sam-warning-soft text-sam-warning" }
        : store.status === "resting"
          ? { label: t("store_resting_now"), className: "bg-sam-warning-soft text-sam-warning" }
          : { label: t("store_closed_now"), className: "bg-sam-surface-muted text-sam-muted" };
  const listBadges = resolveStoreListCardBadges({
    statusLabel: statusBadgeMeta.label,
    statusClassName: statusBadgeMeta.className,
    isFeatured: store.isFeatured,
    recommendedLabel: t("store_badge_recommended"),
    pickupAvailable: store.pickupAvailable,
    pickupLabel: t("store_pickup_available"),
    freeDeliveryProven:
      !outOfRangeLabel &&
      store.deliveryAvailable &&
      store.deliveryFeeLabel === freeDeliveryLabel,
    freeDeliveryLabel: t("store_free_delivery_short"),
    outOfRangeLabel,
  });
  /** CUT 10 — do not show unqualified "delivery available" when OOR; reuse CUT 9 badge kinds for chips. */
  type VerticalFlagChip = {
    key: "delivery" | "visit" | "pickup" | "free_delivery" | "out_of_range";
    label: string;
    className: string;
  };
  const flags: VerticalFlagChip[] = listBadges
    .filter((b) => b.kind === "pickup" || b.kind === "free_delivery" || b.kind === "out_of_range")
    .map((b) => ({
      key: b.kind as "pickup" | "free_delivery" | "out_of_range",
      label: b.label,
      className: b.className,
    }));
  if (!outOfRangeLabel && store.deliveryAvailable) {
    flags.unshift({
      key: "delivery",
      label: t("store_delivery_available"),
      className: FEED_UI.chip,
    });
  }
  if (!outOfRangeLabel && store.visitAvailable) {
    flags.push({
      key: "visit",
      label: t("store_visit_available"),
      className: FEED_UI.chip,
    });
  }

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
  /** 업종 이름 — 저장값(한국어)이 아니라 화면 언어로 (`/stores` 배달 UI 와 같은 함수) */
  const primaryName =
    store.primaryNameKo?.trim() ?
      resolveStoreTaxonomyPrimaryDisplayName(language, store.primarySlug ?? "", store.primaryNameKo)
    : t("store_fallback_name");
  const categoryLine =
    store.subNameKo?.trim() ?
      `${primaryName} · ${resolveStoreTaxonomyTopicDisplayName(language, store.subSlug ?? "", store.subNameKo)}`
    : primaryName;

  const distLabel =
    store.distanceKm != null && Number.isFinite(store.distanceKm) ?
      `${store.distanceKm < 1 ? Math.round(store.distanceKm * 1000) + "m" : store.distanceKm.toFixed(1) + "km"}`
    : null;

  return (
    <li className={`overflow-hidden ${FEED_UI.card}`}>
      <Link
        ref={viewportRef}
        href={storeHref}
        prefetch={false}
        className={`block ${FEED_UI.cardPress}`}
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
        <div className={`relative aspect-[5/3] w-full overflow-hidden ${FEED_UI.thumbMuted}`}>
          {store.profileImageUrl ?
            <SamarketThumbnail
              src={store.profileImageUrl}
              fill
              fetchDisplayPx={180}
              roundedClassName="rounded-none"
              className={FEED_UI.thumbMuted}
              loading="lazy"
            />
          : <div className={FEED_UI.placeholderHero}>
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
              <span className={FEED_UI.badgeFeatured}>
                {t("store_badge_recommended")}
              </span>
            : null}
            {adHint ?
              <span className={FEED_UI.badgeNeutral}>
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
              <p className={`truncate ${FEED_UI.name}`}>{store.nameKo}</p>
              <p className={`mt-0.5 ${FEED_UI.metaSm}`}>{categoryLine}</p>
              <StoreSampleStoreBadge isSampleStore={store.isSampleStore} className="mt-1" />
            </div>
            {statusBadge(store.status, t)}
          </div>

          {store.tagline?.trim() ?
            <p className={`line-clamp-2 ${FEED_UI.body}`}>{store.tagline}</p>
          : null}

          <div className={`flex flex-wrap gap-x-2 gap-y-1 ${FEED_UI.metaSm}`}>
            <span className={FEED_UI.ratingValue}>★ {store.rating.toFixed(1)}</span>
            <span>{t("store_reviews_count", { count: store.reviewCount.toLocaleString("en-PH") })}</span>
            {distLabel ?
              <span className={FEED_UI.distance}>{distLabel}</span>
            : null}
            {outOfRangeLabel ?
              <span className="font-semibold text-sam-warning">{outOfRangeLabel}</span>
            : store.etaLabel?.trim() ?
              <span>{store.etaLabel}</span>
            : <span>{t("store_est_prep", { label: store.estPrepLabel })}</span>}
            {!outOfRangeLabel && store.deliveryFeeLabel === freeDeliveryLabel ?
              <span className="inline-flex flex-wrap items-center gap-1">
                <span className={`text-[13px] ${FEED_UI.freeDelivery}`}>
                  {freeDeliveryLabel}
                </span>
                {store.deliveryFeeStrikePhp != null && store.deliveryFeeStrikePhp > 0 ?
                  <span className={FEED_UI.strike}>
                    {formatMoneyPhp(store.deliveryFeeStrikePhp)}
                  </span>
                : null}
              </span>
            : !outOfRangeLabel && store.deliveryFeeLabel ?
              <span>{store.deliveryFeeLabel}</span>
            : !outOfRangeLabel && store.deliveryAvailable ?
              <span>{t("store_delivery_fee_per_store")}</span>
            : null}
          </div>

          <p className={FEED_UI.metaSm}>{store.regionLabel}</p>

          {flags.length > 0 ?
            <div className="flex flex-wrap gap-1">
              {flags.map((f) => (
                <span
                  key={f.key === "delivery" || f.key === "visit" ? f.label : `${f.key}:${f.label}`}
                  className={f.key === "delivery" || f.key === "visit" ? FEED_UI.chip : `rounded-ui-rect px-2 py-0.5 sam-text-helper font-semibold ${f.className}`}
                >
                  {f.label}
                </span>
              ))}
            </div>
          : null}

          {store.paymentMethodsLine?.trim() ?
            <p
              className={FEED_UI.metaPayment}
              title={store.paymentMethodsLine}
            >
              <span className={FEED_UI.metaPaymentLabel}>{t("store_label_payment")}</span> · {store.paymentMethodsLine}
            </p>
          : null}
        </div>
      </Link>

      {store.featuredItems.length > 0 ?
        <ul className={`border-t px-3 pb-3 pt-2 ${FEED_UI.divider}`}>
          {store.featuredItems.slice(0, 3).map((it) => (
            <li key={it.productId}>
              {(() => {
                const productHref = `/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(it.productId)}`;
                return (
              <Link
                href={productHref}
                className={`flex justify-between gap-2 rounded-ui-rect py-1.5 sam-text-body-secondary ${FEED_UI.rowActive}`}
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
                <span className={`truncate ${FEED_UI.link}`}>{it.name}</span>
                <span className={FEED_UI.priceStrong}>
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
