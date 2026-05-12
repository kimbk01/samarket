"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { memo, useRef } from "react";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { dibayPerfRecordStoreCardNavigationIntent } from "@/lib/dibay/delivery-flow-perf";

type StoreFeaturedCardItem = {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string | null;
};

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
  reservationAvailable: boolean;
  minOrderLabel: string | null;
  estPrepLabel: string;
  /** 목록·피드 API가 채운 합산 ETA (`약 …`) — 없으면 estPrepLabel 기반 표시 */
  etaLabel?: string | null;
  deliveryFeeLabel: string | null;
  distanceKm: number | null;
  menuPreview: string | null;
  profileImageUrl: string | null;
  featuredItems: StoreFeaturedCardItem[];
  isFeatured: boolean;
  coverEmoji?: string;
};

/** 목록 행 `data` 참조 재사용용 — 카드에 보이는 필드 전부 포함 */
export function storeRowCardDataEqual(a: StoreRowCardData, b: StoreRowCardData): boolean {
  const featuredEqual =
    a.featuredItems.length === b.featuredItems.length &&
    a.featuredItems.every((x, idx) => {
      const y = b.featuredItems[idx];
      return (
        x?.productId === y?.productId &&
        x?.name === y?.name &&
        x?.price === y?.price &&
        x?.imageUrl === y?.imageUrl
      );
    });
  return (
    a.slug === b.slug &&
    a.nameKo === b.nameKo &&
    a.tagline === b.tagline &&
    a.categoryLine === b.categoryLine &&
    a.regionBadge === b.regionBadge &&
    a.status === b.status &&
    a.rating === b.rating &&
    a.reviewCount === b.reviewCount &&
    a.deliveryAvailable === b.deliveryAvailable &&
    a.pickupAvailable === b.pickupAvailable &&
    a.reservationAvailable === b.reservationAvailable &&
    a.minOrderLabel === b.minOrderLabel &&
    a.estPrepLabel === b.estPrepLabel &&
    (a.etaLabel ?? "") === (b.etaLabel ?? "") &&
    a.deliveryFeeLabel === b.deliveryFeeLabel &&
    a.distanceKm === b.distanceKm &&
    a.menuPreview === b.menuPreview &&
    a.profileImageUrl === b.profileImageUrl &&
    featuredEqual &&
    a.isFeatured === b.isFeatured &&
    a.coverEmoji === b.coverEmoji
  );
}

function reviewLabel(n: number) {
  if (n > 9999) return "9,999+";
  return n.toLocaleString("en-PH");
}

function distLabel(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function priceLabel(php: number) {
  const safe = Number.isFinite(php) ? Math.max(0, Math.round(php)) : 0;
  return `₱${safe.toLocaleString("en-PH")}`;
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
    reservationAvailable: false,
    minOrderLabel: s.minOrderLabel,
    estPrepLabel: s.estPrepLabel,
    etaLabel: s.etaLabel,
    deliveryFeeLabel: s.deliveryFeeLabel,
    distanceKm: s.distanceKm,
    menuPreview: menuPreview?.trim() || null,
    profileImageUrl: s.profileImageUrl,
    featuredItems: s.featuredItems.map((x) => ({
      productId: x.productId,
      name: x.name,
      price: x.price,
      imageUrl: null,
    })),
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
    reservationAvailable: !!s.reservationAvailable,
    minOrderLabel: s.minOrderLabel ?? null,
    estPrepLabel: s.estPrepLabel ?? "20~40분",
    etaLabel: s.etaLabel,
    deliveryFeeLabel: s.deliveryFeeLabel ?? null,
    distanceKm: s.distanceKm ?? null,
    menuPreview: menuPreview?.trim() || null,
    profileImageUrl: s.profileImageUrl,
    featuredItems: s.featuredItems.map((x) => ({
      productId: x.productId,
      name: x.name,
      price: x.price,
      imageUrl: x.imageUrl,
    })),
    isFeatured: s.isFeatured,
  };
}

/**
 * Facebook 피드 게시물형 — 40px 아바타, 이름+메타 줄, 본문, 하단 액션 바
 */
export const StoreDeliveryRowCard = memo(function StoreDeliveryRowCard({ data }: { data: StoreRowCardData }) {
  const router = useRouter();
  const prefetchedAtRef = useRef<Record<string, number>>({});
  const href = `/stores/${encodeURIComponent(data.slug)}`;
  const prefetchStoreDetail = () => {
    const now = Date.now();
    const last = prefetchedAtRef.current[href] ?? 0;
    if (now - last < 8_000) return;
    prefetchedAtRef.current[href] = now;
    void router.prefetch(href);
  };
  const d = distLabel(data.distanceKm);

  const hasFreeDelivery = data.deliveryAvailable && data.deliveryFeeLabel === "₱0";
  const hasDiscountHint = data.isFeatured;
  const timeLabel =
    data.etaLabel?.trim() ||
    (data.estPrepLabel?.trim() ? `약 ${data.estPrepLabel.trim()}` : null);
  const minOrderShort = data.minOrderLabel?.replace(/^최소주문\s*/g, "")?.trim() || null;

  const featuredMenuImages = data.featuredItems
    .filter((x) => typeof x.imageUrl === "string" && x.imageUrl.trim().length > 0)
    .slice(0, 6);
  const badgeLabels: { label: string; className: string }[] = [];
  if (hasFreeDelivery) {
    badgeLabels.push({ label: "배민클럽", className: "bg-[#DDF8EE] text-[#0C7B63]" });
  }
  if (hasDiscountHint) {
    badgeLabels.push({ label: "즉시할인", className: "bg-[#EFE7FF] text-[#6D28D9]" });
  }
  if (data.pickupAvailable) {
    badgeLabels.push({ label: "픽업가능", className: "bg-[#F3F4F6] text-[#4B5563]" });
  }
  if (data.reservationAvailable) {
    badgeLabels.push({ label: "예약가능", className: "bg-[#F3F4F6] text-[#4B5563]" });
  }
  if (badgeLabels.length === 0 && data.deliveryAvailable) {
    badgeLabels.push({ label: "배달", className: "bg-[#EEF2FF] text-[#4338CA]" });
  }

  return (
    <li className="list-none border-b border-[#ECEFF3] bg-white dark:border-[#2F3133] dark:bg-[#18191A]">
      <Link
        href={href}
        className="block py-[15px] transition-[transform,opacity,background-color] duration-120 ease-out active:scale-[0.985] active:opacity-95 active:bg-[#F8FAFC] dark:active:bg-[#202123]"
        onPointerEnter={prefetchStoreDetail}
        onFocus={prefetchStoreDetail}
        onTouchStart={prefetchStoreDetail}
        onClick={() => dibayPerfRecordStoreCardNavigationIntent(data.slug)}
      >
        <div className="relative">
          {featuredMenuImages.length > 0 ? (
            <div
              className={[
                "flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain",
                "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              ].join(" ")}
              style={{ WebkitOverflowScrolling: "touch" }}
              aria-label="대표 메뉴 이미지"
            >
              {featuredMenuImages.map((item) => {
                const price = priceLabel(item.price);
                return (
                  <div
                    key={item.productId}
                    className={[
                      "relative shrink-0 snap-start overflow-hidden rounded-[10px] bg-[#F3F4F6] dark:bg-[#2B2D30]",
                      "w-[calc((100%-8px)/3)] aspect-square",
                    ].join(" ")}
                  >
                    <Image
                      src={(item.imageUrl as string) || ""}
                      alt=""
                      fill
                      sizes="(max-width: 420px) 33vw, 220px"
                      className="object-cover"
                      loading="lazy"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 pb-1.5 pt-8">
                      <p className="line-clamp-1 text-[11.5px] font-semibold leading-snug text-white">
                        {item.name}
                      </p>
                      <p className="line-clamp-1 text-[12.5px] font-bold leading-snug text-white">{price}</p>
                    </div>
                  </div>
                );
              })}
              <div
                className={[
                  "flex shrink-0 snap-start items-center justify-center rounded-[10px] bg-[#F7F7F7] text-[#111]",
                  "w-[calc((100%-8px)/3)] aspect-square",
                  "transition-colors duration-120 group-active:bg-[#ECEFF3] dark:bg-[#2A2C2E] dark:text-[#E4E6EB] dark:group-active:bg-[#34373A]",
                ].join(" ")}
              >
                <div className="flex flex-col items-center gap-1">
                  <svg className="h-5 w-5 opacity-90" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d="M7.5 4.5L12.5 10L7.5 15.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[13px] font-semibold leading-none text-[#111]/70 dark:text-white/70">
                    더보기
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[116px] items-center justify-center overflow-hidden rounded-[10px] bg-[#F7F7F7] text-[#111] transition-colors duration-120 group-active:bg-[#ECEFF3] dark:bg-[#2A2C2E] dark:text-[#E4E6EB] dark:group-active:bg-[#34373A]">
              <div className="flex flex-col items-center gap-1">
                <svg className="h-5 w-5 opacity-90" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path
                    d="M7.5 4.5L12.5 10L7.5 15.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[13px] font-semibold leading-none text-[#111]/70 dark:text-white/70">더보기</span>
              </div>
            </div>
          )}
        </div>

        <div className="pt-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-[16px] font-bold leading-tight tracking-[-0.01em] text-[#111] dark:text-[#F3F4F6]">
                {data.nameKo}
                <span className="ml-2 inline-flex items-center gap-1 align-middle text-[14px] font-bold text-[#111] dark:text-[#F3F4F6]">
                  <span className="text-[12.5px] text-[#F4B400]" aria-hidden>★</span>
                  {data.rating.toFixed(1)}
                  <span className="text-[13px] font-medium text-[#6B7280]">({reviewLabel(data.reviewCount)})</span>
                </span>
              </h3>
              <p className="mt-1 line-clamp-1 text-[13px] font-medium leading-snug text-[#374151] dark:text-[#C7CDD4]">
                {hasFreeDelivery ?
                  <>
                    배달팁{" "}
                    <span className="font-bold text-[#2563EB] dark:text-[#8AB4FF]">무료</span>
                    {" "}적용 중
                  </>
                : data.deliveryAvailable && data.deliveryFeeLabel ?
                  <>
                    배달팁{" "}
                    <span className="font-semibold text-[#111] dark:text-[#F3F4F6]">{data.deliveryFeeLabel}</span>
                  </>
                : data.deliveryAvailable ?
                  "배달팁 매장별"
                : "배달 불가"}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-[12.5px] leading-snug text-[#666] dark:text-[#9AA3AD]">
                {timeLabel ? (
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[#4B5563] dark:text-[#B8C0CA]">
                    <svg className="h-3.5 w-3.5 opacity-75" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M12 8v5l3 2"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="truncate">{timeLabel}</span>
                  </span>
                ) : null}
                {timeLabel && d ? <span className="shrink-0 text-[#9CA3AF]">·</span> : null}
                {d ? (
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium">
                    <svg className="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {d}
                  </span>
                ) : null}
                {(timeLabel || d) && minOrderShort ? <span className="shrink-0 text-[#9CA3AF]">·</span> : null}
                {minOrderShort ? (
                  <span className="min-w-0 truncate font-normal">
                    최소주문 <span className="font-medium text-[#4B5563] dark:text-[#B8C0CA]">{minOrderShort}</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {badgeLabels.map((b) => (
                  <span
                    key={b.label}
                    className={`inline-flex h-[21px] items-center rounded-[5px] px-1.5 text-[11px] font-semibold leading-none ${b.className}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
});

StoreDeliveryRowCard.displayName = "StoreDeliveryRowCard";
