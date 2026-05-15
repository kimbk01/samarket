"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { StoreDetailBackLink } from "@/components/stores/StoreDetailBackRow";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { openStoreCartPreview } from "@/lib/stores/store-cart-preview-ui-store";
import { useStoreCommerceCartHeaderBadgeCount } from "@/lib/stores/use-store-commerce-cart-selector";
import { STORE_ORDER_BRAND } from "@/components/stores/store-order-detail/store-order-brand";

const iconBtn =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-[180ms] active:scale-[0.96]";

export function StoreOrderStickyHeader({
  elevated,
  fallbackHref,
  storeSlug,
  storeName,
  commerceCartStoreId,
  viewerFavorited,
  favoriteBusy,
  onFavoriteClick,
  onMenuSearchFocus,
  onShareClick,
  onCartPreviewClick,
}: {
  elevated: boolean;
  fallbackHref: string;
  storeSlug: string;
  storeName: string;
  commerceCartStoreId: string;
  viewerFavorited: boolean;
  favoriteBusy: boolean;
  onFavoriteClick: () => void | Promise<void>;
  onMenuSearchFocus: () => void;
  onShareClick: () => void;
  /** 빈 카트에서도 프리뷰 시트 열기용 — 카트 링크와 병행 */
  onCartPreviewClick: () => void;
}) {
  const [portalToBody, setPortalToBody] = useState(false);
  useEffect(() => {
    setPortalToBody(true);
  }, []);

  const cartLineKindCount = useStoreCommerceCartHeaderBadgeCount(commerceCartStoreId);

  const cartHref = `/stores/${encodeURIComponent(storeSlug)}/cart`;

  const openPreview = useCallback(() => {
    const sid = commerceCartStoreId?.trim();
    const slug = storeSlug?.trim();
    if (sid && slug) {
      openStoreCartPreview({ storeId: sid, storeSlug: slug });
      return;
    }
    onCartPreviewClick();
  }, [commerceCartStoreId, storeSlug, onCartPreviewClick]);

  const onCartPress = useCallback(
    (e: React.MouseEvent) => {
      if (cartLineKindCount <= 0) {
        e.preventDefault();
        openPreview();
      }
    },
    [cartLineKindCount, openPreview]
  );

  const header = (
    <header
      className={`fixed inset-x-0 top-0 z-[60] pt-[env(safe-area-inset-top,0px)] transition-[background-color,box-shadow,border-color] duration-[180ms] ease-out ${
        elevated
          ? "border-b border-black/[0.06] bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="flex h-14 items-center gap-1 px-4">
        <StoreDetailBackLink
          fallbackHref={fallbackHref}
          className={
            elevated
              ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-900 hover:bg-black/[0.06] active:bg-black/[0.08]"
              : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white drop-shadow hover:bg-white/15 active:bg-white/25"
          }
        />
        <div
          className="min-w-0 flex-1 text-center transition-opacity duration-[180ms] ease-out"
          style={{ opacity: elevated ? 1 : 0 }}
          aria-hidden={!elevated}
        >
          <p className="truncate text-[15px] font-bold leading-tight" style={{ color: STORE_ORDER_BRAND.title }}>
            {storeName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={`${iconBtn} ${elevated ? "text-neutral-900" : "text-white drop-shadow-sm"}`}
            style={{ color: elevated ? undefined : "#fff" }}
            aria-label="메뉴 검색"
            onClick={onMenuSearchFocus}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
          </button>
          <button
            type="button"
            className={`${iconBtn} ${elevated ? "text-neutral-900" : "text-white drop-shadow-sm"}`}
            aria-label="공유"
            onClick={onShareClick}
          >
            {/* Baemin-like share glyph: arrow up from box */}
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6l4-4 4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 11h10" opacity="0" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 11v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"
              />
            </svg>
          </button>
          <Link
            href={cartHref}
            onClick={onCartPress}
            className={`${iconBtn} relative ${elevated ? "text-neutral-900" : "text-white drop-shadow-sm"}`}
            aria-label={
              cartLineKindCount > 0 ? `장바구니, 담긴 종류 ${cartLineKindCount}개` : "장바구니"
            }
          >
            <StoreCommerceCartStrokeIcon className="h-[21px] w-[21px]" />
            {cartLineKindCount > 0 ? (
              <span className={`absolute -right-0.5 -top-0.5 z-[1] ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
                {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );

  // Portal: 상위 레이아웃에 transform/스크롤 컨테이너가 있어도 viewport 상단 고정 유지
  return portalToBody ? createPortal(header, document.body) : header;
}
