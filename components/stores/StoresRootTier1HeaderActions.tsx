"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveDeliveryOrderHistoryHref } from "@/lib/stores/delivery-order-history-nav";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { resolveOwnerOperationsCenterAttentionCount } from "@/lib/stores/owner-store-badge-display-policy";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { commerceCartHrefFromBuckets } from "@/lib/stores/store-commerce-cart-nav";
import { useOwnerLitePreferredStoreRow } from "@/lib/stores/use-owner-lite-store";

const HEADER_BADGE_CLASS = `absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`;

function OrderHistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>
  );
}

function OpsCenterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 21V12h6v9" />
    </svg>
  );
}

/** `/stores` 루트 tier-1 헤더 우측 — 카트 · 주문내역 · (매장주) 운영센터 */
export function StoresRootTier1HeaderActions() {
  const { t } = useI18n();
  const commerceCart = useStoreCommerceCartOptional();
  const ownerStore = useOwnerLitePreferredStoreRow();
  const ownerHubBreakdown = useOwnerHubBadgeBreakdown();
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal("확인");

  const cartLineKindCount = commerceCart?.hydrated ? commerceCart.totalItemCountAllStores : 0;
  const cartHref = useMemo(() => {
    if (!commerceCart?.hydrated) return "/stores/cart";
    return commerceCartHrefFromBuckets(commerceCart.listCartBuckets());
  }, [commerceCart]);

  const ownerStoreId = ownerStore?.id?.trim() ?? "";
  const orderHistoryHref = resolveDeliveryOrderHistoryHref(ownerStoreId);
  const ownerOpsAttention = ownerStore ? resolveOwnerOperationsCenterAttentionCount(ownerHubBreakdown) : 0;
  const opsHref = ownerStoreId ? OwnerRoutes.hub(ownerStoreId) : null;

  return (
    <>
      {hubBlockedModal}
      <div className="inline-flex h-full shrink-0 items-center gap-0 [&>*+*]:-ml-1">
        <Link
          href={cartHref}
          prefetch={false}
          className="sam-header-action relative h-10 w-10 shrink-0 text-sam-fg"
          aria-label={
            cartLineKindCount > 0
              ? t("nav_cart_aria")
              : t("store_delivery_dial_cart")
          }
        >
          <StoreCommerceCartStrokeIcon className="h-6 w-6" />
          {cartLineKindCount > 0 ? (
            <span className={HEADER_BADGE_CLASS} aria-hidden>
              {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
            </span>
          ) : null}
        </Link>
        <Link
          href={orderHistoryHref}
          prefetch={false}
          className="sam-header-action h-10 w-10 shrink-0 text-sam-fg"
          aria-label={t("store_delivery_float_order_history")}
        >
          <OrderHistoryIcon className="h-6 w-6" />
        </Link>
        {opsHref ? (
          <Link
            href={opsHref}
            prefetch={false}
            className="sam-header-action relative h-10 w-10 shrink-0 text-sam-fg"
            aria-label={t("store_delivery_float_ops_center")}
            onClick={
              shouldInterceptBusinessHubHref(opsHref)
                ? (e) => {
                    if (openBlockedModalIfNeeded()) e.preventDefault();
                  }
                : undefined
            }
          >
            <OpsCenterIcon className="h-6 w-6" />
            {ownerOpsAttention > 0 ? (
              <span className={HEADER_BADGE_CLASS} aria-hidden>
                {ownerOpsAttention > 99 ? "99+" : ownerOpsAttention}
              </span>
            ) : null}
          </Link>
        ) : null}
      </div>
    </>
  );
}
