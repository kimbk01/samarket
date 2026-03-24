"use client";

import Link from "next/link";
import { useCallback } from "react";
import { StoreDetailBackLink } from "@/components/stores/StoreDetailBackRow";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";

const iconBtnClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-stone-800 hover:bg-stone-100/90 active:bg-stone-200/80 disabled:pointer-events-none disabled:opacity-40";

export function StoreDetailStickyTopRow({
  fallbackHref,
  /** 있으면 배지 = 이 매장 담긴 상품 종류 수(줄 개수). 수량 10이어도 같은 줄이면 1 */
  commerceCartStoreId,
  /** 상단 카트 아이콘 → 이 매장 `/stores/[slug]/cart` */
  storeSlug,
  storeName,
  areaLine,
  phone,
  profileImageUrl,
  ratingAvg,
  reviewCount,
  favoriteCount,
  recentOrderCount,
  viewerFavorited,
  favoriteBusy,
  onFavoriteClick,
}: {
  fallbackHref: string;
  commerceCartStoreId?: string | null;
  storeSlug: string;
  storeName: string;
  areaLine: string | null;
  phone: string | null;
  profileImageUrl: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  favoriteCount: number;
  recentOrderCount: number;
  viewerFavorited: boolean;
  favoriteBusy: boolean;
  onFavoriteClick: () => void | Promise<void>;
}) {
  const commerceCart = useStoreCommerceCartOptional();
  const cartLineKindCount =
    commerceCart?.hydrated && commerceCartStoreId
      ? Math.max(0, Math.floor(commerceCart.getItemCountForStoreId(commerceCartStoreId)))
      : commerceCart?.hydrated
        ? Math.max(0, Math.floor(commerceCart.totalItemCountAllStores))
        : 0;
  const telHref =
    phone != null
      ? telHrefFromLoosePhPhone(phone) ?? `tel:${String(phone).replace(/\s/g, "")}`
      : "";

  const subtitle = areaLine?.trim() || null;
  const ratingLabel =
    ratingAvg != null && Number.isFinite(Number(ratingAvg)) ? Number(ratingAvg).toFixed(2) : "—";
  const initialGlyph = storeName.trim().slice(0, 1) || "?";

  const onShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: storeName, text: storeName, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert("링크를 복사했습니다.");
      }
    } catch {
      /* 사용자 취소 등 */
    }
  }, [storeName]);

  return (
    <div className="flex w-full min-w-0 max-w-full min-h-[52px] items-center gap-1 py-1">
      <StoreDetailBackLink fallbackHref={fallbackHref} />
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
        {profileImageUrl?.trim() ? (
           
          <img src={profileImageUrl.trim()} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-stone-400"
            aria-hidden
          >
            {initialGlyph}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h1 className="truncate text-[16px] font-bold leading-tight text-stone-900">{storeName}</h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11px] leading-tight text-stone-500">{subtitle}</p>
        ) : null}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight text-stone-600">
          <span className="font-semibold text-stone-900">★ {ratingLabel}</span>
          <span className="text-stone-300" aria-hidden>
            ·
          </span>
          <span>리뷰 {reviewCount.toLocaleString("en-PH")}</span>
          <span className="text-stone-300" aria-hidden>
            ·
          </span>
          <span>찜 {favoriteCount.toLocaleString("en-PH")}</span>
          <span className="text-stone-300" aria-hidden>
            ·
          </span>
          <span>최근 주문 {recentOrderCount.toLocaleString("en-PH")}+</span>
        </p>
      </div>
      <div className="flex min-w-0 max-w-[46%] shrink-0 items-center justify-end gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain sm:max-w-none sm:gap-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href={`/stores/${encodeURIComponent(storeSlug)}/cart`}
          className={`${iconBtnClass} relative`}
          aria-label={
            cartLineKindCount > 0
              ? `이 매장 장바구니, 담긴 상품 종류 ${cartLineKindCount}개`
              : "이 매장 장바구니"
          }
        >
          <StoreCommerceCartStrokeIcon />
          {cartLineKindCount > 0 ? (
            <span
              className={`absolute -right-0.5 -top-0.5 z-[1] ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}
            >
              {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
            </span>
          ) : null}
        </Link>
        {telHref ? (
          <a href={telHref} className={iconBtnClass} aria-label="전화">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
              />
            </svg>
          </a>
        ) : (
          <span className={`${iconBtnClass} cursor-not-allowed opacity-40`} aria-label="전화 없음">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
              />
            </svg>
          </span>
        )}
        <Link href="/chat" className={iconBtnClass} aria-label="채팅">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            />
          </svg>
        </Link>
        <button
          type="button"
          className={iconBtnClass}
          aria-label={viewerFavorited ? "찜 해제" : "찜하기"}
          disabled={favoriteBusy}
          onClick={() => void onFavoriteClick()}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={viewerFavorited ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            className={viewerFavorited ? "text-rose-500" : undefined}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            />
          </svg>
        </button>
        <button type="button" className={iconBtnClass} aria-label="공유" onClick={() => void onShare()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path strokeLinecap="round" d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
          </svg>
        </button>
      </div>
    </div>
  );
}
