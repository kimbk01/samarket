"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { useOwnerNavigationSummary } from "@/lib/delivery/owner/projections/use-owner-navigation-summary";
import { useOwnerHeaderOpsAttentionCount } from "@/lib/chats/use-owner-hub-badge-total";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveDeliveryOrderHistoryHref } from "@/lib/delivery/customer/delivery-order-history-nav";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART } from "@/lib/stores/store-commerce-cart-nav";
import { useCommerceCartNavHref } from "@/components/layout/use-commerce-cart-nav-href";
import { StoreOpsCenterStrokeIcon } from "@/components/main-menu/MainBottomNavTabIcons";

const HEADER_BADGE_CLASS = `absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`;

function OrderHistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

/** `/stores` 루트 tier-1 헤더 우측 — 카트 · 주문내역 · (매장주) 운영센터 */
export function StoresRootTier1HeaderActions() {
  const { t } = useI18n();
  const ownerNav = useOwnerNavigationSummary();
  const ownerOpsAttentionRaw = useOwnerHeaderOpsAttentionCount();
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal(t("common_confirm"));

  const { href: cartHref, cartCount: cartLineKindCount } = useCommerceCartNavHref(
    COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART
  );

  const ownerStoreId = ownerNav.storeId?.trim() ?? "";
  const orderHistoryHref = resolveDeliveryOrderHistoryHref(ownerStoreId);
  const ownerOpsAttention = ownerNav.hasPreferredStore ? ownerOpsAttentionRaw : 0;
  const opsHref = ownerStoreId ? OwnerRoutes.hub(ownerStoreId) : null;

  return (
    <>
      {hubBlockedModal}
      <>
        <Link
          href={cartHref}
          prefetch={false}
          className="sam-tier1-header__icon-btn relative text-[color:var(--delivery-text-main)]"
          aria-label={
            cartLineKindCount > 0
              ? t("nav_cart_aria")
              : t("store_delivery_dial_cart")
          }
        >
          <StoreCommerceCartStrokeIcon />
          {cartLineKindCount > 0 ? (
            <span className={HEADER_BADGE_CLASS} aria-hidden>
              {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
            </span>
          ) : null}
        </Link>
        <Link
          href={orderHistoryHref}
          prefetch={false}
          className="sam-tier1-header__icon-btn text-[color:var(--delivery-text-main)]"
          aria-label={t("store_delivery_float_order_history")}
        >
          <OrderHistoryIcon />
        </Link>
        {opsHref ? (
          <Link
            href={opsHref}
            prefetch={false}
            className="sam-tier1-header__icon-btn relative text-[color:var(--delivery-text-main)]"
            aria-label={t("store_delivery_float_ops_center")}
            onClick={
              shouldInterceptBusinessHubHref(opsHref)
                ? (e) => {
                    if (openBlockedModalIfNeeded()) e.preventDefault();
                  }
                : undefined
            }
          >
            <StoreOpsCenterStrokeIcon />
            {ownerOpsAttention > 0 ? (
              <span className={HEADER_BADGE_CLASS} aria-hidden>
                {ownerOpsAttention > 99 ? "99+" : ownerOpsAttention}
              </span>
            ) : null}
          </Link>
        ) : null}
      </>
    </>
  );
}
