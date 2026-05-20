"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { StoreCommerceCartStrokeIcon } from "@/components/stores/StoreCommerceCartStrokeIcon";
import { formatMoneyPhp } from "@/lib/utils/format";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { getCommerceCartSnapshotBus } from "@/lib/stores/store-commerce-cart-snapshot-bus";
import { findCommerceCartBucketBySlug } from "@/lib/stores/find-commerce-cart-bucket-by-slug";
import {
  markStoreCommerceCheckoutNavigation,
  writeStoreCommerceCheckoutSeed,
} from "@/lib/stores/store-commerce-checkout-seed-cache";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";

/**
 * 매장 메뉴·상품 하단 합계 띠 — 빈 카트여도 노출(레퍼런스 앱형).
 * 포털: `ConditionalAppShell` 조상 transform 시 viewport 고정 유지.
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
  /** 브레이크 시간 등 — `store_bottom_status_break` 의 `{detail}` */
  closedDetail,
  onCartPreviewOpen,
}: {
  slug: string;
  isOpen: boolean;
  deliveryAvailable: boolean;
  fulfillmentMode: StorePublicFulfillmentMode;
  cartTotalPhp: number;
  /** 줄별 수량 합 */
  cartQtyTotal: number;
  /** 담긴 메뉴 종류 수 */
  cartLineKindCount: number;
  minOrderPhp: number | null;
  closedDetail?: string | null;
  onCartPreviewOpen: () => void;
}) {
  const { t } = useI18n();
  const [portalToBody, setPortalToBody] = useState(false);
  useEffect(() => {
    setPortalToBody(true);
  }, []);

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

  const bar = (
    <div
      className={`fixed inset-x-0 bottom-0 z-[45] border-t border-neutral-100 bg-white shadow-[0_-4px_14px_rgba(0,0,0,0.05)] ${
        active ? "min-h-[92px] pt-2.5" : "min-h-[76px] pt-2.5"
      }`}
      style={{
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
      }}
      data-store-cart-strip="1"
    >
      <div
        className={`mx-auto flex w-full min-w-0 items-center justify-between gap-3 px-4 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
      >
        <div className="min-w-0 flex-1">
          {active ? (
            <>
              <p className="sam-i18n-card-title text-[14px] font-bold text-neutral-900">
                {t("store_bottom_cart_line_count", { count: cartLineKindCount })}
              </p>
              <p className="mt-0.5 text-[17px] font-bold tabular-nums text-neutral-900">
                {formatMoneyPhp(cartTotalPhp)}
              </p>
            </>
          ) : (
            <>
              <p className="sam-i18n-card-title text-[13px] font-semibold text-neutral-800">{statusText}</p>
              <p className="mt-0.5 text-[12px] font-medium text-neutral-500">
                {minLine}
                <span className="mx-1 text-neutral-300">·</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                  {modeLabel}
                </span>
              </p>
            </>
          )}
          {minNeed > 0 ? (
            <p className="mt-1 text-[11px] font-semibold text-amber-800">
              {t("store_bottom_min_order_remaining", { amount: formatMoneyPhp(minNeed) })}
            </p>
          ) : null}
        </div>
        {active ? (
          <Link
            href={cartHref}
            onClick={onCheckoutNavigate}
            className="sam-i18n-btn-label flex h-[52px] shrink-0 touch-manipulation select-none items-center justify-center rounded-[14px] bg-[#1C8DB8] px-5 text-[15px] font-bold text-white transition-all duration-150 hover:bg-[#197DA3] active:scale-[0.97] active:bg-[#166F92]"
            aria-label={t("store_go_checkout_aria")}
          >
            {t("store_bottom_checkout_btn")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onCartPreviewOpen}
            className="flex h-11 w-11 shrink-0 touch-manipulation select-none items-center justify-center rounded-full border-[1.5px] border-[#1C8DB8] bg-white text-[#1C8DB8] transition-all duration-150 hover:bg-[#E6F4F9] active:scale-[0.94] active:bg-[#E6F4F9]"
            aria-label={t("store_cart_preview_aria")}
          >
            <StoreCommerceCartStrokeIcon className="h-6 w-6 text-current" />
          </button>
        )}
      </div>
    </div>
  );

  if (portalToBody && typeof document !== "undefined") {
    return createPortal(bar, document.body);
  }
  return bar;
}
