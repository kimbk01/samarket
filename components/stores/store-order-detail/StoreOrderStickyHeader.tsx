"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
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
import { deliveryPresentationMarkEvent } from "@/lib/dibay/delivery-presentation-evidence";
import type { StoreChromePortalTarget } from "@/lib/dibay/delivery-store-chrome-portal-contract";
import { storeChromePortalRoot } from "@/lib/dibay/delivery-store-chrome-portal-contract";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { useOverlayScopeAttrs } from "@/components/ui/dibay-overlay/overlay-scope";

/** 히어로 이미지 위 — 검은 반투명 배경·흰 아이콘 (`delivery-components.css` `.store-order-hero-glass-icon-btn`) */
export const STORE_ORDER_HERO_GLASS_ICON_BTN =
  `${APP_TIER1_HEADER_ICON_BTN_CLASS} store-order-hero-glass-icon-btn relative`;

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
  /** CONTRACT: storeMenu = 공유·검색·카트(WP6 2026-10-29, 알림 제거), productDetail = 검색·공유·카트. */
  headerTrailingVariant = "storeMenu",
  /** @deprecated use chromePortalTarget — inline keeps chrome in StoreSurface (hold_browse prepare). */
  deferBodyPortal = false,
  /** G-B2 soft store: DeliveryStoreChromeHost | hard: body | hold: inline */
  chromePortalTarget,
  /** true: 스크롤 전 히어로 위 액션을 글래스 버튼으로(밝은 사진에서도 보임) */
  heroGlassOverlayButtons = false,
  /**
   * WP6 — 히어로 위(스크롤 전): 투명 + 흰 아이콘 + 위쪽 그라데이션(검정 25%→0, 약 96px).
   * 글래스 원 버튼 대신 사용. 스크롤 후(elevated)에는 흰 배경 + 「← 매장명」 왼쪽 정렬.
   */
  heroTopGradient = false,
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
  deferBodyPortal?: boolean;
  chromePortalTarget?: StoreChromePortalTarget;
  heroGlassOverlayButtons?: boolean;
  heroTopGradient?: boolean;
}) {
  const { t } = useI18n();
  const [portalReady, setPortalReady] = useState(false);
  /** 포털 루트에 화면 스코프(`data-delivery-scope` 등) — `overlay-scope.tsx` */
  const scopeAttrs = useOverlayScopeAttrs();
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const resolvedPortalTarget: StoreChromePortalTarget =
    chromePortalTarget ?? (deferBodyPortal ? "inline" : "body");

  /** Soft hold/prepare — stay inside transformed StoreSurface (not viewport-fixed). */
  const chromePositionMode =
    resolvedPortalTarget === "inline" ? ("contained" as const) : ("viewport-fixed" as const);

  useEffect(() => {
    if (!portalReady || resolvedPortalTarget === "inline") return;
    if (resolvedPortalTarget === "body") {
      deliveryPresentationMarkEvent("featuredHeaderPortalEnabled");
      return;
    }
    deliveryPresentationMarkEvent("deliveryStoreChromeHeaderPortalEnabled");
  }, [portalReady, resolvedPortalTarget]);

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

  /**
   * 재감사 F2 (2026-10-30) — 사진 위 아이콘은 항상 반투명 원형 배경 + 흰 아이콘.
   * 위쪽 그라데이션 모드도 같은 버튼(공통 헤더 색이 `text-white` 를 덮어써 진한 아이콘이 배경 없이 보였음).
   */
  const glassOverlay = (heroGlassOverlayButtons || heroTopGradient) && !elevated;
  const showHeroGradient = heroTopGradient && !elevated;
  const isStoreMenu = headerTrailingVariant === "storeMenu";
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
      {...scopeAttrs}
      className={`${
        chromePositionMode === "contained" ? "absolute" : "fixed"
      } inset-x-0 top-0 z-[60] pt-[var(--safe-top)] transition-[background-color,box-shadow,border-color] duration-[180ms] ease-out ${
        elevated
          ? "border-b border-black/[0.06] bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      {showHeroGradient ? (
        <div
          aria-hidden
          data-store-header-hero-gradient="1"
          className="pointer-events-none absolute inset-x-0 top-0 h-[96px] bg-gradient-to-b from-black/25 to-transparent"
        />
      ) : null}
      <div
        className={`delivery-ui relative ${APP_MAIN_COLUMN_CLASS} ${APP_TIER1_HEADER_ROW_WRAP_CLASS}`}
      >
        <AppTier1HeaderRow
          title={storeName}
          titleHidden={!elevated}
          /* WP6 — 매장 화면: 「← 매장명」 왼쪽 정렬, 아이콘을 뺀 나머지 폭 전체 사용(「소담…」 잘림 결함)
           * WP7 — 메뉴 상세도 「← 메뉴명」 왼쪽 정렬 */
          centerAlign="left"
          leading={<StoreDetailBackLink storeSlug={storeSlug} fallbackHref={fallbackHref} className={backBtnClass} />}
          trailing={
            <>
              {isStoreMenu && onShareClick ? (
                <button
                  type="button"
                  className={actionBtnClass()}
                  aria-label={t("common_share")}
                  onClick={onShareClick}
                  data-store-header-share="1"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6l4-4 4 4" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 11v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
                  </svg>
                </button>
              ) : null}
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
              ) : null}
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

  const portalRoot =
    portalReady && resolvedPortalTarget !== "inline"
      ? storeChromePortalRoot(resolvedPortalTarget)
      : null;

  return portalRoot ? createPortal(header, portalRoot) : header;
}
