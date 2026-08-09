"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useMemo } from "react";
import { StoreCommerceCartStrokeIcon } from "@/components/stores/StoreCommerceCartStrokeIcon";
import { StoreCommerceBottomActionShell } from "@/components/stores/commerce/StoreCommerceBottomActionShell";
import {
  STORE_COMMERCE_ACTION_BTN_CART_BADGE_CLASS,
  STORE_COMMERCE_ACTION_CAPTION_CLASS,
  STORE_COMMERCE_ACTION_CART_ICON_BTN_CLASS,
  STORE_COMMERCE_ACTION_HINT_AMBER_CLASS,
  STORE_COMMERCE_ACTION_HINT_OK_CLASS,
  STORE_COMMERCE_ACTION_PRICE_HERO_CLASS,
  STORE_COMMERCE_ACTION_SECONDARY_TEXT_CLASS,
  STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS,
  storeCommerceActionRowClass,
  storeCommerceActionSideCtaClass,
} from "@/lib/stores/store-commerce-bottom-action-bar";
import { formatMoneyPhp } from "@/lib/utils/format";
import { getCommerceCartSnapshotBus } from "@/lib/stores/store-commerce-cart-snapshot-bus";
import { findCommerceCartBucketBySlug } from "@/lib/stores/find-commerce-cart-bucket-by-slug";
import {
  markStoreCommerceCheckoutNavigation,
  writeStoreCommerceCheckoutSeed,
} from "@/lib/stores/store-commerce-checkout-seed-cache";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";

/**
 * 매장 메뉴 하단 스트립
 * - 카트 있음: 합계(큰 글씨) + (최소주문 부족 | 배달 가능) + 주문 확인 CTA + 수량 뱃지
 * - 빈 카트: 영업·최소주문·배달/픽업 + 카트 미리보기
 */
export function StoreDetailBottomStrip({
  slug,
  isOpen,
  deliveryAvailable,
  fulfillmentMode,
  cartTotalPhp,
  cartQtyTotal,
  cartLineKindCount,
  minOrderPhp,
  closedDetail,
  onCartPreviewOpen,
}: {
  slug: string;
  isOpen: boolean;
  deliveryAvailable: boolean;
  fulfillmentMode: StorePublicFulfillmentMode;
  cartTotalPhp: number;
  cartQtyTotal: number;
  cartLineKindCount: number;
  minOrderPhp: number | null;
  closedDetail?: string | null;
  onCartPreviewOpen: () => void;
}) {
  const { t } = useI18n();

  const modeLabel = useMemo(() => {
    if (fulfillmentMode === "local_delivery") {
      return deliveryAvailable
        ? t("store_bottom_fulfillment_delivery")
        : t("store_delivery_no_short");
    }
    return t("store_bottom_fulfillment_pickup");
  }, [deliveryAvailable, fulfillmentMode, t]);

  const statusText = useMemo(() => {
    if (!isOpen) {
      const detail = closedDetail?.trim();
      return detail
        ? t("store_bottom_status_break", { detail })
        : t("store_bottom_status_closed");
    }
    if (deliveryAvailable && fulfillmentMode === "local_delivery") {
      return t("store_bottom_status_delivery_open");
    }
    return t("store_bottom_status_pickup_open");
  }, [closedDetail, deliveryAvailable, fulfillmentMode, isOpen, t]);

  const minNeed =
    fulfillmentMode === "local_delivery" &&
    minOrderPhp != null &&
    minOrderPhp > 0 &&
    cartTotalPhp > 0 &&
    cartTotalPhp < minOrderPhp
      ? Math.max(0, Math.ceil(minOrderPhp - cartTotalPhp))
      : 0;

  const minLine = t("store_min_order_amount_colon", {
    amount:
      minOrderPhp != null && minOrderPhp > 0 ? formatMoneyPhp(minOrderPhp) : formatMoneyPhp(0),
  });

  const cartHref = `/stores/${encodeURIComponent(slug)}/cart`;

  const onCheckoutNavigate = () => {
    markStoreCommerceCheckoutNavigation();
    const bus = getCommerceCartSnapshotBus();
    const bucket = findCommerceCartBucketBySlug(bus.snapshot, slug);
    if (bucket) writeStoreCommerceCheckoutSeed(bucket);
  };

  const active = cartQtyTotal > 0;
  const variant = active ? "menu-cart-active" : "menu-cart-idle";

  return (
    <StoreCommerceBottomActionShell variant={variant} dataAttribute="data-store-cart-strip">
      <div className={storeCommerceActionRowClass(variant)}>
        <div className="min-w-0 flex-1 py-0.5">
          {active ? (
            <>
              <p className={STORE_COMMERCE_ACTION_PRICE_HERO_CLASS}>
                {formatMoneyPhp(cartTotalPhp)}
              </p>
              {minNeed > 0 ? (
                <p className={STORE_COMMERCE_ACTION_HINT_AMBER_CLASS}>
                  {t("store_bottom_min_order_remaining", { amount: formatMoneyPhp(minNeed) })}
                </p>
              ) : (
                <p className={STORE_COMMERCE_ACTION_HINT_OK_CLASS}>
                  {deliveryAvailable && fulfillmentMode === "local_delivery"
                    ? t("store_bottom_status_delivery_open")
                    : t("store_bottom_status_pickup_open")}
                </p>
              )}
              <p className={`mt-0.5 ${STORE_COMMERCE_ACTION_CAPTION_CLASS}`}>
                {t("store_bottom_cart_line_count", { count: cartLineKindCount })}
              </p>
            </>
          ) : (
            <>
              <p className={STORE_COMMERCE_ACTION_SECONDARY_TEXT_CLASS}>{statusText}</p>
              <p className={`mt-0.5 ${STORE_COMMERCE_ACTION_CAPTION_CLASS}`}>
                {minLine}
                <span className="mx-1 text-[color:var(--delivery-border)]">·</span>
                <span className="font-semibold text-[color:var(--delivery-text-sub)]">{modeLabel}</span>
              </p>
            </>
          )}
        </div>
        {active ? (
          <Link
            href={cartHref}
            onClick={onCheckoutNavigate}
            className={storeCommerceActionSideCtaClass(false)}
            aria-label={t("store_go_checkout_aria")}
          >
            {cartQtyTotal > 0 ? (
              <span className={STORE_COMMERCE_ACTION_BTN_CART_BADGE_CLASS} aria-hidden>
                {cartQtyTotal > 99 ? "99+" : cartQtyTotal}
              </span>
            ) : null}
            <span className={STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS}>
              {t("store_bottom_checkout_btn")}
            </span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={onCartPreviewOpen}
            className={STORE_COMMERCE_ACTION_CART_ICON_BTN_CLASS}
            aria-label={t("store_cart_preview_aria")}
          >
            <StoreCommerceCartStrokeIcon className="h-6 w-6 text-current" />
          </button>
        )}
      </div>
    </StoreCommerceBottomActionShell>
  );
}
