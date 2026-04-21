"use client";

import Link from "next/link";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreCardFavoriteIcon } from "./StoreCardFavoriteIcon";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

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
  | "isFeatured"
  | "estPrepLabel"
  | "deliveryFeeLabel"
> & {
  /** 홈 피드 전용 — km */
  distanceKm?: number | null;
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
    isFeatured: store.isFeatured,
    estPrepLabel: store.estPrepLabel ?? "20~40분",
    deliveryFeeLabel: store.deliveryFeeLabel ?? null,
    distanceKm: store.distanceKm ?? null,
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
    isFeatured: store.isFeatured,
    estPrepLabel: store.estPrepLabel,
    deliveryFeeLabel: store.deliveryFeeLabel,
    distanceKm: store.distanceKm,
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
  const flags = [
    store.deliveryAvailable ? "배달" : null,
    store.pickupAvailable ? "픽업" : null,
    store.visitAvailable ? "방문" : null,
  ].filter(Boolean);

  const storeHref = `/stores/${encodeURIComponent(store.slug)}`;
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
      <Link href={storeHref} className="block active:bg-[#F2F3F5] dark:active:bg-[#2F3031]">
        <div className="relative aspect-[5/3] w-full overflow-hidden bg-[#F0F2F5] dark:bg-[#3A3B3C]">
          {store.profileImageUrl ?
            <img
              src={store.profileImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
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
            <span>리뷰 {store.reviewCount.toLocaleString("en-PH")}</span>
            {distLabel ?
              <span className="font-semibold text-[#1877F2] dark:text-[#4599FF]">{distLabel}</span>
            : null}
            <span>예상 {store.estPrepLabel}</span>
            {store.deliveryFeeLabel ?
              <span>배달 {store.deliveryFeeLabel}</span>
            : store.deliveryAvailable ?
              <span>배달비 매장별</span>
            : null}
          </div>

          <p className={FB.metaSm}>{store.regionLabel}</p>

          {flags.length > 0 ?
            <div className="flex flex-wrap gap-1">
              {flags.map((f) => (
                <span
                  key={f}
                  className="rounded-ui-rect bg-[#F0F2F5] px-2 py-0.5 sam-text-xxs font-semibold text-[#65676B] dark:bg-[#3A3B3C] dark:text-[#B0B3B8]"
                >
                  {f}
                </span>
              ))}
            </div>
          : null}
        </div>
      </Link>

      {store.featuredItems.length > 0 ?
        <ul className={`border-t px-3 pb-3 pt-2 ${FB.divider}`}>
          {store.featuredItems.slice(0, 3).map((it) => (
            <li key={it.productId}>
              <Link
                href={`/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(it.productId)}`}
                className={`flex justify-between gap-2 rounded-ui-rect py-1.5 sam-text-body-secondary active:bg-[#F0F2F5] dark:active:bg-[#3A3B3C]`}
                onClick={(e) => e.stopPropagation()}
              >
                <span className={`truncate ${FB.link}`}>{it.name}</span>
                <span className="shrink-0 font-semibold text-[#050505] dark:text-[#E4E6EB]">
                  {formatMoneyPhp(it.price)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      : null}
    </li>
  );
}
