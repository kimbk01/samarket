"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { StoreDetailBackLink } from "@/components/stores/StoreDetailBackRow";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import type { StoreFulfillmentPref } from "@/lib/stores/store-fulfillment-pref";

const iconBtnClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-sam-surface-muted/90 active:bg-sam-border-soft/80 disabled:pointer-events-none disabled:opacity-40";

export type StoreStickyOrderChrome = {
  isOpenForOrder: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  fulfillmentMode: StoreFulfillmentPref;
  onFulfillmentChange: (mode: StoreFulfillmentPref) => void;
  onMenuSearchFocus: () => void;
};

/**
 * `/stores/[slug]/*` Tier1 — 매장명·평점·리뷰 + (메뉴 루트일 때) 주문 상태·수령·검색.
 * 전화·채팅·가게 정보는 ⋯ 메뉴로 이동.
 */
export function StoreDetailStickyTopRow({
  fallbackHref,
  commerceCartStoreId,
  storeSlug,
  storeName,
  phone,
  profileImageUrl,
  ratingAvg,
  reviewCount,
  viewerFavorited,
  favoriteBusy,
  onFavoriteClick,
  orderChrome,
}: {
  fallbackHref: string;
  commerceCartStoreId?: string | null;
  storeSlug: string;
  storeName: string;
  /** 주문 헤더에서는 표시하지 않음(가게 정보에서 확인) */
  areaLine?: string | null;
  phone: string | null;
  profileImageUrl: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  /** 표시 생략 — 하트 상태만 유지 */
  favoriteCount?: number;
  recentOrderCount?: number;
  viewerFavorited: boolean;
  favoriteBusy: boolean;
  onFavoriteClick: () => void | Promise<void>;
  orderChrome?: StoreStickyOrderChrome | null;
}) {
  const commerceCart = useStoreCommerceCartOptional();
  const moreRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => {
      if (moreRef.current) moreRef.current.open = false;
    };
    const onDoc = (e: MouseEvent) => {
      const el = moreRef.current;
      if (!el?.open) return;
      if (e.target instanceof Node && !el.contains(e.target)) close();
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

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

  const ratingLabel =
    ratingAvg != null && Number.isFinite(Number(ratingAvg)) ? Number(ratingAvg).toFixed(1) : "—";
  const initialGlyph = storeName.trim().slice(0, 1) || "?";
  const infoHref = `/stores/${encodeURIComponent(storeSlug)}/info`;

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

  const segBase =
    "min-w-0 flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const segOn = "bg-sam-surface text-sam-fg shadow-sm";
  const segOff = "text-sam-muted active:bg-sam-border-soft/60";

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-1 py-0.5">
    <div className="flex w-full min-w-0 max-w-full min-h-[40px] items-center gap-1.5">
      <StoreDetailBackLink fallbackHref={fallbackHref} />
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface-muted">
        {profileImageUrl?.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profileImageUrl.trim()} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[12px] font-semibold text-sam-meta"
            aria-hidden
          >
            {initialGlyph}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h1 className="truncate text-[15px] font-bold leading-tight text-sam-fg">{storeName}</h1>
        <p className="mt-0.5 truncate text-[11px] font-medium leading-tight text-sam-muted">
          <span className="text-sam-fg">★ {ratingLabel}</span>
          <span className="mx-1 text-sam-meta" aria-hidden>
            ·
          </span>
          리뷰 {reviewCount.toLocaleString("en-PH")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Link
          href={`/stores/${encodeURIComponent(storeSlug)}/cart`}
          className={`${iconBtnClass} relative`}
          aria-label={
            cartLineKindCount > 0
              ? `장바구니, 담긴 종류 ${cartLineKindCount}개`
              : "장바구니"
          }
        >
          <StoreCommerceCartStrokeIcon className="h-[18px] w-[18px]" />
          {cartLineKindCount > 0 ? (
            <span
              className={`absolute -right-0.5 -top-0.5 z-[1] ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}
            >
              {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          className={iconBtnClass}
          aria-label={viewerFavorited ? "찜 해제" : "찜하기"}
          disabled={favoriteBusy}
          onClick={() => void onFavoriteClick()}
        >
          <svg
            width="17"
            height="17"
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
        {orderChrome ? (
          <button
            type="button"
            className={iconBtnClass}
            aria-label="메뉴 검색"
            onClick={() => orderChrome.onMenuSearchFocus()}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        ) : null}
        <button type="button" className={iconBtnClass} aria-label="공유" onClick={() => void onShare()}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path strokeLinecap="round" d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
          </svg>
        </button>
        <details ref={moreRef} className="relative">
          <summary
            className={`${iconBtnClass} list-none [&::-webkit-details-marker]:hidden`}
            aria-label="더보기"
          >
            <span className="text-lg font-bold leading-none text-sam-muted">⋯</span>
          </summary>
          <div
            className="absolute right-0 z-[50] mt-1 w-44 rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-lg"
            role="menu"
          >
            {telHref ? (
              <a
                href={telHref}
                className="block px-3 py-2.5 text-[13px] font-medium text-sam-fg hover:bg-sam-app"
                role="menuitem"
              >
                전화
              </a>
            ) : (
              <span className="block px-3 py-2.5 text-[13px] text-sam-meta" role="menuitem">
                전화 없음
              </span>
            )}
            <Link
              href="/chat"
              className="block px-3 py-2.5 text-[13px] font-medium text-sam-fg hover:bg-sam-app"
              role="menuitem"
            >
              채팅 문의
            </Link>
            <Link
              href={infoHref}
              className="block px-3 py-2.5 text-[13px] font-medium text-sam-fg hover:bg-sam-app"
              role="menuitem"
            >
              가게 정보
            </Link>
          </div>
        </details>
      </div>
    </div>

      {orderChrome ? (
        <div className="flex w-full min-w-0 items-center gap-2 border-t border-sam-border/80 pt-1">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              orderChrome.isOpenForOrder ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
            }`}
          >
            {orderChrome.isOpenForOrder ? "주문 가능" : "준비 중"}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              orderChrome.deliveryAvailable ? "bg-sky-50 text-sky-900" : "bg-sam-surface-muted text-sam-muted"
            }`}
          >
            {orderChrome.deliveryAvailable ? "배달 가능" : "배달 불가"}
          </span>
          <div
            className="ml-auto flex min-w-0 max-w-[11rem] flex-1 rounded-full border border-sam-border bg-sam-surface-muted p-0.5"
            role="group"
            aria-label="수령 방식"
          >
            <button
              type="button"
              disabled={!orderChrome.pickupAvailable}
              onClick={() => orderChrome.onFulfillmentChange("pickup")}
              className={`${segBase} ${orderChrome.fulfillmentMode === "pickup" ? segOn : segOff}`}
            >
              포장
            </button>
            <button
              type="button"
              disabled={!orderChrome.deliveryAvailable}
              onClick={() => orderChrome.onFulfillmentChange("local_delivery")}
              className={`${segBase} ${orderChrome.fulfillmentMode === "local_delivery" ? segOn : segOff}`}
            >
              배달
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
