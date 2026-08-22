"use client";

import Link from "next/link";
import type { Ref } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeHeaderNotificationInboxLazy } from "@/components/stores/home/hub/StoresHomeHeaderNotificationInboxLazy";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { useCommerceCartNavHref } from "@/components/layout/use-commerce-cart-nav-href";
import { resolveDeliveryOrderHistoryHref } from "@/lib/delivery/customer/delivery-order-history-nav";
import { COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART } from "@/lib/stores/store-commerce-cart-nav";
import { STORES_HOME_HEADER_ICON_BTN_CLASS } from "@/lib/design/stores-home-header-chrome";

const HEADER_BADGE_CLASS = `absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`;

function SearchIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function OrderHistoryIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

/**
 * CUT-D — consumer delivery header actions (hub + browse).
 * Order: search · orders · cart · bell. No owner ops. No floating FAB substitute beyond these.
 */
export function StoresConsumerHeaderActions({
  searchOpen,
  onOpenSearch,
  searchTriggerRef,
}: {
  searchOpen: boolean;
  onOpenSearch: () => void;
  searchTriggerRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useI18n();
  const { href: cartHref, cartCount: cartLineKindCount } = useCommerceCartNavHref(
    COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART
  );
  /** Buyer order history only — do not route owners to ops from this consumer chrome. */
  const orderHistoryHref = resolveDeliveryOrderHistoryHref(null);

  return (
    <>
      <button
        ref={searchTriggerRef}
        type="button"
        className={STORES_HOME_HEADER_ICON_BTN_CLASS}
        aria-label={t("store_search_placeholder")}
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        data-stores-consumer-header-action="search"
        onClick={onOpenSearch}
      >
        <SearchIcon />
      </button>
      <Link
        href={orderHistoryHref}
        prefetch={false}
        className={`${STORES_HOME_HEADER_ICON_BTN_CLASS} relative`}
        aria-label={t("store_delivery_float_order_history")}
        data-stores-consumer-header-action="orders"
      >
        <OrderHistoryIcon />
      </Link>
      <Link
        href={cartHref}
        prefetch={false}
        className={`${STORES_HOME_HEADER_ICON_BTN_CLASS} relative`}
        aria-label={
          cartLineKindCount > 0 ? t("nav_cart_aria") : t("store_delivery_dial_cart")
        }
        data-stores-consumer-header-action="cart"
      >
        <StoreCommerceCartStrokeIcon />
        {cartLineKindCount > 0 ?
          <span className={HEADER_BADGE_CLASS} aria-hidden>
            {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
          </span>
        : null}
      </Link>
      <span data-stores-consumer-header-action="bell" className="contents">
        <StoresHomeHeaderNotificationInboxLazy tone="onPrimary" />
      </span>
    </>
  );
}
