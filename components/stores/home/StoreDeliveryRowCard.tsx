"use client";

import Link from "next/link";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { StoreCardFavoriteIcon } from "@/components/stores/home/StoreCardFavoriteIcon";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

export type StoreRowCardData = {
  slug: string;
  nameKo: string;
  tagline: string | null;
  categoryLine: string | null;
  regionBadge: string | null;
  status: "open" | "preparing" | "closed";
  rating: number;
  reviewCount: number;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  minOrderLabel: string | null;
  estPrepLabel: string;
  deliveryFeeLabel: string | null;
  distanceKm: number | null;
  menuPreview: string | null;
  profileImageUrl: string | null;
  isFeatured: boolean;
  coverEmoji?: string;
};

function reviewLabel(n: number) {
  if (n > 9999) return "9,999+";
  return n.toLocaleString("en-PH");
}

function distLabel(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export function homeFeedToRowCard(s: StoreHomeFeedItem): StoreRowCardData {
  const menuPreview =
    s.featuredItems.length > 0 ?
      s.featuredItems
        .slice(0, 3)
        .map((x) => x.name)
        .join(", ")
    : s.tagline;
  const rb = s.regionLabel?.trim().slice(0, 14) ?? null;
  return {
    slug: s.slug,
    nameKo: s.nameKo,
    tagline: s.tagline,
    categoryLine: s.primaryNameKo,
    regionBadge: rb && rb.length > 0 ? rb : null,
    status: s.status,
    rating: s.rating,
    reviewCount: s.reviewCount,
    deliveryAvailable: s.deliveryAvailable,
    pickupAvailable: s.pickupAvailable,
    minOrderLabel: s.minOrderLabel,
    estPrepLabel: s.estPrepLabel,
    deliveryFeeLabel: s.deliveryFeeLabel,
    distanceKm: s.distanceKm,
    menuPreview: menuPreview?.trim() || null,
    profileImageUrl: s.profileImageUrl,
    isFeatured: s.isFeatured,
  };
}

export function browseItemToRowCard(s: BrowseStoreListItem): StoreRowCardData {
  const menuPreview =
    s.featuredItems.length > 0 ?
      s.featuredItems
        .slice(0, 3)
        .map((x) => x.name)
        .join(", ")
    : s.tagline;
  const cat = `${s.primaryNameKo} · ${s.subNameKo}`;
  const rb = s.regionLabel?.trim().slice(0, 14) ?? null;
  return {
    slug: s.slug,
    nameKo: s.nameKo,
    tagline: s.tagline,
    categoryLine: cat,
    regionBadge: rb && rb.length > 0 ? rb : null,
    status: s.status,
    rating: s.rating,
    reviewCount: s.reviewCount,
    deliveryAvailable: s.deliveryAvailable,
    pickupAvailable: s.pickupAvailable,
    minOrderLabel: s.minOrderLabel ?? null,
    estPrepLabel: s.estPrepLabel ?? "20~40분",
    deliveryFeeLabel: s.deliveryFeeLabel ?? null,
    distanceKm: s.distanceKm ?? null,
    menuPreview: menuPreview?.trim() || null,
    profileImageUrl: s.profileImageUrl,
    isFeatured: s.isFeatured,
  };
}

function statusMetaFragment(status: StoreRowCardData["status"]) {
  if (status === "open") {
    return (
      <>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#31A24C]" aria-hidden />
          영업 중
        </span>
      </>
    );
  }
  if (status === "preparing") {
    return <>준비 중</>;
  }
  return <>휴무</>;
}

/**
 * Facebook 피드 게시물형 — 40px 아바타, 이름+메타 줄, 본문, 하단 액션 바
 */
export function StoreDeliveryRowCard({ data }: { data: StoreRowCardData }) {
  const href = `/stores/${encodeURIComponent(data.slug)}`;
  const d = distLabel(data.distanceKm);

  const headerMeta: string[] = [];
  if (data.categoryLine) headerMeta.push(data.categoryLine);
  if (data.regionBadge) headerMeta.push(data.regionBadge);
  if (data.isFeatured) headerMeta.push("추천");

  const statLine = [
    `★ ${data.rating.toFixed(1)}`,
    `리뷰 ${reviewLabel(data.reviewCount)}`,
    d,
    data.estPrepLabel,
    data.deliveryFeeLabel ? `배달 ${data.deliveryFeeLabel}` : data.deliveryAvailable ? "배달비 매장별" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const liveCta =
    data.status === "open" && data.deliveryAvailable ?
      "주문 가능"
    : data.status === "open" ?
      "영업 중"
    : data.status === "preparing" ?
      "곧 오픈"
    : null;

  return (
    <li className="list-none">
      <Link href={href} className={`block overflow-hidden p-3 ${FB.card} active:bg-[#F2F3F5] dark:active:bg-[#2F3031]`}>
        <div className="flex gap-2">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#E4E6EB] dark:bg-[#3A3B3C]">
            {data.profileImageUrl ?
              <img src={data.profileImageUrl} alt="" className="h-full w-full object-cover" />
            : (
              <div className="flex h-full w-full items-center justify-center bg-[#1877F2] text-[15px] font-bold text-white dark:bg-[#2374E1]">
                {data.coverEmoji ?? data.nameKo.slice(0, 1)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className={`line-clamp-2 ${FB.name}`}>{data.nameKo}</h3>
                <p className={`mt-0.5 ${FB.meta}`}>
                  {headerMeta.length > 0 ?
                    <>
                      {headerMeta.join(" · ")}
                      <span className="text-[#CED0D4] dark:text-[#5F6164]" aria-hidden>
                        {" "}
                        ·{" "}
                      </span>
                    </>
                  : null}
                  {statusMetaFragment(data.status)}
                </p>
              </div>
              <div className="shrink-0 -mr-1 -mt-0.5">
                <StoreCardFavoriteIcon slug={data.slug} className="!h-9 !w-9 text-[#65676B] dark:text-[#B0B3B8]" />
              </div>
            </div>
          </div>
        </div>

        {data.menuPreview || data.tagline?.trim() ?
          <p className={`mt-2 ${FB.body}`}>
            {data.menuPreview ?? data.tagline}
          </p>
        : null}

        <p className={`mt-1 ${FB.meta}`}>{statLine}</p>

        {data.minOrderLabel ?
          <p className={`mt-1 ${FB.metaSm}`}>{data.minOrderLabel}</p>
        : null}

        <div className={`mt-3 flex flex-wrap items-center gap-x-1 border-t pt-2 ${FB.divider} ${FB.meta}`}>
          {data.deliveryAvailable ?
            <span className={`${FB.link}`}>배달</span>
          : null}
          {data.deliveryAvailable && data.pickupAvailable ?
            <span className="text-[#CED0D4] dark:text-[#5F6164]" aria-hidden>
              ·
            </span>
          : null}
          {data.pickupAvailable ?
            <span className={`${FB.link}`}>포장</span>
          : null}
          {(data.deliveryAvailable || data.pickupAvailable) && liveCta ?
            <span className="text-[#CED0D4] dark:text-[#5F6164]" aria-hidden>
              ·
            </span>
          : null}
          {liveCta ?
            <span className="font-semibold text-[#050505] dark:text-[#E4E6EB]">{liveCta}</span>
          : null}
        </div>
      </Link>
    </li>
  );
}
