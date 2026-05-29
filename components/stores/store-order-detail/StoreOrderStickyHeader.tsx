"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { StoreDetailBackLink } from "@/components/stores/StoreDetailBackRow";
import { AppTier1HeaderRow } from "@/components/layout/AppTier1HeaderRow";
import { APP_TIER1_HEADER_ICON_BTN_CLASS, APP_TIER1_HEADER_ROW_WRAP_CLASS } from "@/lib/layout/app-tier1-header";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  STORE_COMMERCE_CART_COUNT_BADGE_ON_HERO_GLASS_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { openStoreCartPreview } from "@/lib/stores/store-cart-preview-ui-store";
import { useStoreCommerceCartHeaderBadgeCount } from "@/lib/stores/use-store-commerce-cart-selector";

const PhilifeHeaderNotificationInbox = dynamic(
  () =>
    import("@/components/philife/PhilifeHeaderNotificationInbox").then(
      (m) => m.PhilifeHeaderNotificationInbox
    ),
  { ssr: false }
);

/** 히어로 이미지 위 — 검은 반투명 배경·흰 아이콘 (`delivery-components.css` `.store-order-hero-glass-icon-btn`) */
export const STORE_ORDER_HERO_GLASS_ICON_BTN =
  `${APP_TIER1_HEADER_ICON_BTN_CLASS} store-order-hero-glass-icon-btn relative`;

export const STORE_ORDER_HERO_GLASS_NOTIF_BADGE_CLASSNAME =
  "absolute -right-0.5 -top-0.5 z-[1] flex h-[16px] min-w-[16px] items-center justify-center rounded-full border border-white/45 bg-[var(--delivery-primary)] px-0.5 text-[9px] font-bold leading-none text-white";

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
  /** CONTRACT: storeMenu = 검색·알림·카트, productDetail = 검색·공유·카트. */
  headerTrailingVariant = "storeMenu",
  /** true: 스크롤 전 히어로 위 액션을 글래스 버튼으로(밝은 사진에서도 보임) */
  heroGlassOverlayButtons = false,
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
  onShareClick?: () => void;
  /** 빈 카트에서도 프리뷰 시트 열기용 — 카트 링크와 병행 */
  onCartPreviewClick: () => void;
  headerTrailingVariant?: "storeMenu" | "productDetail";
  heroGlassOverlayButtons?: boolean;
}) {
  const { t } = useI18n();
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

  const glassOverlay = heroGlassOverlayButtons && !elevated;
  const backBtnClass = elevated
    ? `${APP_TIER1_HEADER_ICON_BTN_CLASS} text-neutral-900 hover:bg-black/[0.06]`
    : glassOverlay
      ? STORE_ORDER_HERO_GLASS_ICON_BTN
      : `${APP_TIER1_HEADER_ICON_BTN_CLASS} text-white drop-shadow hover:bg-white/15`;
  const actionBtnClass = (extra = "") =>
    elevated
      ? `${APP_TIER1_HEADER_ICON_BTN_CLASS} text-neutral-900 ${extra}`.trim()
      : glassOverlay
        ? `${STORE_ORDER_HERO_GLASS_ICON_BTN} ${extra}`.trim()
        : `${APP_TIER1_HEADER_ICON_BTN_CLASS} text-white drop-shadow-sm ${extra}`.trim();

  const header = (
    <header
      className={`fixed inset-x-0 top-0 z-[60] pt-[env(safe-area-inset-top,0px)] transition-[background-color,box-shadow,border-color] duration-[180ms] ease-out ${
        elevated
          ? "border-b border-black/[0.06] bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div
        className={`delivery-ui mx-auto w-full max-w-[42rem] ${APP_TIER1_HEADER_ROW_WRAP_CLASS}`}
      >
        <AppTier1HeaderRow
          title={storeName}
          titleHidden={!elevated}
          leading={<StoreDetailBackLink fallbackHref={fallbackHref} className={backBtnClass} />}
          trailing={
            <>
              <button
                type="button"
                className={actionBtnClass()}
                aria-label={t("store_menu_search_aria")}
                onClick={onMenuSearchFocus}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
                </svg>
              </button>
              {headerTrailingVariant === "productDetail" ? (
                <button
                  type="button"
                  className={actionBtnClass()}
                  aria-label={t("common_share")}
                  onClick={onShareClick}
                >
                  <svg
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
              ) : (
                <PhilifeHeaderNotificationInbox
                  tone={glassOverlay ? "onPrimary" : elevated ? "default" : "onPrimary"}
                  triggerClassName={
                    glassOverlay ? STORE_ORDER_HERO_GLASS_ICON_BTN : elevated ? undefined : actionBtnClass()
                  }
                  unreadBadgeClassName={
                    glassOverlay ? STORE_ORDER_HERO_GLASS_NOTIF_BADGE_CLASSNAME : undefined
                  }
                  deferInboxListPrefetch
                />
              )}
              <Link
                href={cartHref}
                onClick={onCartPress}
                className={actionBtnClass("relative")}
                aria-label={
                  cartLineKindCount > 0
                    ? t("store_cart_aria_with_kinds", { count: cartLineKindCount })
                    : t("store_cart_preview_aria")
                }
              >
                <StoreCommerceCartStrokeIcon />
                {cartLineKindCount > 0 ? (
                  <span
                    className={
                      glassOverlay
                        ? STORE_COMMERCE_CART_COUNT_BADGE_ON_HERO_GLASS_CLASSNAME
                        : `absolute -right-0.5 -top-0.5 z-[1] ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`
                    }
                  >
                    {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
                  </span>
                ) : null}
              </Link>
            </>
          }
        />
      </div>
    </header>
  );

  return portalToBody ? createPortal(header, document.body) : header;
}
