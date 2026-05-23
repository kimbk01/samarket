"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { resolveDeliveryOrderHistoryHref } from "@/lib/stores/delivery-order-history-nav";
import { COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART } from "@/lib/stores/store-commerce-cart-nav";
import { useCommerceCartNavHref } from "@/components/layout/use-commerce-cart-nav-href";
import {
  STORES_HOME_HEADER_BADGE_CLASS,
  STORES_HOME_HEADER_ICON_BTN_CLASS,
} from "@/lib/design/stores-home-header-chrome";

function OrderHistoryIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>
  );
}

/** `/stores` 홈 헤더 우측 — 카트 · 주문내역 (운영센터 제외) */
export function StoresHomeBuyerHeaderActions() {
  const { t } = useI18n();
  const { href: cartHref, cartCount: cartLineKindCount } = useCommerceCartNavHref(
    COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART
  );
  const orderHistoryHref = resolveDeliveryOrderHistoryHref("");

  return (
    <>
      <Link
        href={cartHref}
        prefetch={false}
        className={`${STORES_HOME_HEADER_ICON_BTN_CLASS} relative`}
        aria-label={
          cartLineKindCount > 0 ? t("nav_cart_aria") : t("store_delivery_dial_cart")
        }
      >
        <StoreCommerceCartStrokeIcon className="h-[var(--delivery-header-icon-glyph)] w-[var(--delivery-header-icon-glyph)]" />
        {cartLineKindCount > 0 ? (
          <span className={STORES_HOME_HEADER_BADGE_CLASS} aria-hidden>
            {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
          </span>
        ) : null}
      </Link>
      <Link
        href={orderHistoryHref}
        prefetch={false}
        className={STORES_HOME_HEADER_ICON_BTN_CLASS}
        aria-label={t("store_delivery_float_order_history")}
      >
        <OrderHistoryIcon />
      </Link>
    </>
  );
}
