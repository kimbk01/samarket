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
import { saveDeliveryListScrollBeforeStoreNavigation } from "@/lib/dibay/delivery-list-scroll-restore";
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

function statusBadge(status: BrowseStoreListItem["status"]) {
  if (status === "open") {
    return (
      <span className="shrink-0 rounded-ui-rect bg-[#E7F7EC] px-2 py-0.5 sam-text-helper font-semibold text-[#31A24C] dark:bg-[#1F3528] dark:text-[#5CD67C]">
        영업중
      </span>
    );
  }
  if (status === "preparing") {
    return (
      <span className="shrink-0 rounded-ui-rect bg-[#FFF8E7] px-2 py-0.5 sam-text-helper font-semibold text-[#B78100] dark:bg-[#3D3420] dark:text-[#F5C842]">
        준비중
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-ui-rect bg-[#E4E6EB] px-2 py-0.5 sam-text-helper font-semibold text-[#65676B] dark:bg-[#3A3B3C] dark:text-[#B0B3B8]">
      휴무
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
    estPrepLabel: store.estPrepLabel ?? "20~40분",
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
    primaryNameKo: store.primaryNameKo ?? "매장",
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
  const flags = [
    store.deliveryAvailable ? "배달가능" : null,
    store.pickupAvailable ? "픽업가능" : null,
    store.visitAvailable ? "방문" : null,
  ].filter(Boolean);

  const storeHref = `/stores/${encodeURIComponent(store.slug)}`;
  const prefetchStoreDetail = (
    source: Parameters<typeof deliveryStoreDetailPrefetch>[2],
    opts?: { force?: boolean }
  ) => {
    deliveryStoreDetailPrefetch(router, store.slug, source, opts);
  };
  const prefetchProductDetail = (productId: string) => {
    const href = `/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(productId)}`;
    void router.prefetch(href);
  };
  const categoryLine =
    store.subNameKo?.trim() ?
      `${store.primaryNameKo} · ${store.subNameKo}`
    : store.primaryNameKo;

  const distLabel =
    store.distanceKm != null && Number.isFinite(store.distanceKm) ?
      `${store.distanceKm < 1 ? Math.round(store.distanceKm * 1000) + "m" : store.distanceKm.toFixed(1) + "km"}`
    : null;

  return (
    <li className={`overflow-hidden ${FB.card}`}>
      <Link
        ref={viewportRef}
        href={storeHref}
        prefetch
        className="block active:bg-[#F2F3F5] dark:active:bg-[#2F3031]"
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
        onClick={() => {
          resetDeliveryStoreMenusPrewarmForTests();
          deliveryStoreMenusPrewarm(store.slug, { force: true });
          saveDeliveryListScrollBeforeStoreNavigation();
          markStoreDetailListSeedNavigation(store.slug);
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
          dibayPerfRecordStoreCardNavigationIntent(store.slug);
          deliveryMenuVisibleBeginNavSession(store.slug);
          deliveryPerfTraceLog(DELIVERY_PERF_TAG_ROUTE_TRANSITION, {
            event: "vertical_store_card_tap",
            slug: store.slug,
          });
        }}
      >
        <div className="relative aspect-[5/3] w-full overflow-hidden bg-sam-surface-muted dark:bg-[#3A3B3C]">
          {store.profileImageUrl ?
            <SamarketThumbnail src={store.profileImageUrl} fill roundedClassName="rounded-none" className="bg-sam-surface-muted dark:bg-[#3A3B3C]" />
          : <div className="flex h-full w-full items-center justify-center bg-[#1877F2]/90 text-white dark:bg-[#2374E1]/90">
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
              <span className="rounded-ui-rect bg-sam-surface/95 px-2 py-0.5 sam-text-xxs font-semibold text-[#1877F2] shadow-sm dark:bg-[#242526]/95 dark:text-[#4599FF]">
                추천
              </span>
            : null}
            {adHint ?
              <span className="rounded-ui-rect bg-sam-surface/95 px-2 py-0.5 sam-text-xxs font-semibold text-[#050505] shadow-sm dark:bg-[#242526]/95 dark:text-[#E4E6EB]">
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
            {statusBadge(store.status)}
          </div>

          {store.tagline?.trim() ?
            <p className={`line-clamp-2 ${FB.body}`}>{store.tagline}</p>
          : null}

          <div className={`flex flex-wrap gap-x-2 gap-y-1 ${FB.metaSm}`}>
            <span className="font-semibold text-[#050505] dark:text-[#E4E6EB]">★ {store.rating.toFixed(1)}</span>
            <span>{t("store_reviews_count", { count: store.reviewCount.toLocaleString("en-PH") })}</span>
            {distLabel ?
              <span className="font-semibold text-[#1877F2] dark:text-[#4599FF]">{distLabel}</span>
            : null}
            {store.etaLabel?.trim() ?
              <span>{store.etaLabel}</span>
            : <span>{t("store_est_prep", { label: store.estPrepLabel })}</span>}
            {store.deliveryFeeLabel === "배달비 무료 적용 중" ?
              <span className="inline-flex flex-wrap items-center gap-1">
                <span className="text-[13px] font-semibold text-[#2563EB] dark:text-[#8AB4FF]">
                  {store.deliveryFeeLabel}
                </span>
                {store.deliveryFeeStrikePhp != null && store.deliveryFeeStrikePhp > 0 ?
                  <span className="text-[13px] font-medium text-[#9CA3AF] line-through dark:text-[#6B7280]">
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
                  className="rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-[#65676B] dark:bg-[#3A3B3C] dark:text-[#B0B3B8]"
                >
                  {f}
                </span>
              ))}
            </div>
          : null}

          {store.paymentMethodsLine?.trim() ?
            <p
              className="line-clamp-2 sam-text-xxs font-medium leading-snug text-[#6B7280] dark:text-[#9AA3AD]"
              title={store.paymentMethodsLine}
            >
              <span className="font-semibold text-[#4B5563] dark:text-[#B8C0CA]">{t("store_label_payment")}</span> · {store.paymentMethodsLine}
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
                className={`flex justify-between gap-2 rounded-ui-rect py-1.5 sam-text-body-secondary active:bg-sam-surface-muted dark:active:bg-[#3A3B3C]`}
                onPointerEnter={() => prefetchProductDetail(it.productId)}
                onFocus={() => prefetchProductDetail(it.productId)}
                onTouchStart={() => prefetchProductDetail(it.productId)}
                onClick={(e) => e.stopPropagation()}
              >
                <span className={`truncate ${FB.link}`}>{it.name}</span>
                <span className="shrink-0 font-semibold text-[#050505] dark:text-[#E4E6EB]">
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
