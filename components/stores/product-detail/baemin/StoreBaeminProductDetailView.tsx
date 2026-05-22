"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ParsedOptionGroup } from "@/lib/stores/modifiers/types";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import { StoreModifierPicker } from "@/components/stores/modifiers/StoreModifierPicker";
import { StoreProductSheetOptionsSkeleton } from "@/components/stores/product-sheet/StoreProductSheetSkeleton";
import {
  STORE_ORDER_BRAND,
  STORE_ORDER_CTA_STEPPER,
  STORE_ORDER_TOUCH_BTN,
} from "@/components/stores/store-order-detail/store-order-brand";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreBaeminProductDetailFooter } from "@/components/stores/product-detail/baemin/StoreBaeminProductDetailFooter";
import { StoreBaeminProductDetailInfo } from "@/components/stores/product-detail/baemin/StoreBaeminProductDetailInfo";

export type StoreBaeminProductDetailViewProps = {
  storeSlug: string;
  productId: string;
  title: string;
  summary: string | null;
  reviewCount: number;
  badges: string[];
  baseUnitPhp: number;
  listPricePhp: number;
  showListStrike: boolean;
  lineTotalPhp: number;
  qty: number;
  qtyMinusDisabled: boolean;
  qtyPlusDisabled: boolean;
  onQtyDecrease: () => void;
  onQtyIncrease: () => void;
  optionGroups: ParsedOptionGroup[];
  modifierWire: ModifierSelectionsWire;
  onModifierChange: (next: ModifierSelectionsWire) => void;
  optionsDisabled: boolean;
  awaitingOptionHydration: boolean;
  optionHydrationFailed: boolean;
  onOptionRetry?: () => void;
  commerceBlockedMessage: string | null;
  soldOut: boolean;
  minOrderPhp: number | null;
  cartTotalPhp: number;
  deliveryAvailable: boolean;
  ctaDisabled: boolean;
  cartBusy?: boolean;
  errorMessage: string | null;
  onAddToCart: () => void;
};

export function StoreBaeminProductDetailView(props: StoreBaeminProductDetailViewProps) {
  const { t } = useI18n();
  const {
    storeSlug,
    productId,
    title,
    summary,
    reviewCount,
    badges,
    baseUnitPhp,
    listPricePhp,
    showListStrike,
    lineTotalPhp,
    qty,
    qtyMinusDisabled,
    qtyPlusDisabled,
    onQtyDecrease,
    onQtyIncrease,
    optionGroups,
    modifierWire,
    onModifierChange,
    optionsDisabled,
    awaitingOptionHydration,
    optionHydrationFailed,
    onOptionRetry,
    commerceBlockedMessage,
    soldOut,
    minOrderPhp,
    cartTotalPhp,
    deliveryAvailable,
    ctaDisabled,
    cartBusy,
    errorMessage,
    onAddToCart,
  } = props;

  return (
    <>
      <div className="bg-white pb-[calc(6.5rem+var(--store-commerce-action-plane-pb,0.75rem)+env(safe-area-inset-bottom,0px))]">
        <StoreBaeminProductDetailInfo
          storeSlug={storeSlug}
          productId={productId}
          title={title}
          summary={summary}
          reviewCount={reviewCount}
          badges={badges}
        />

        {commerceBlockedMessage ? (
          <p className="mx-4 mb-2 rounded-[8px] border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[12px] font-medium leading-snug text-amber-950">
            {commerceBlockedMessage}
          </p>
        ) : null}
        {soldOut ? (
          <p className="mx-4 mb-2 rounded-[8px] bg-[#F2F3F5] px-3 py-2 text-[13px] font-medium text-[#333333]">
            {t("store_sold_out")}
          </p>
        ) : null}

        <div
          className="border-t-[8px] border-[#EDEDED] px-4 py-4"
          style={{ backgroundColor: STORE_ORDER_BRAND.frameGray }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-neutral-900">{t("store_product_price_label")}</p>
              <p className="mt-0.5 text-[12px] font-medium text-neutral-500">
                {t("store_product_price_before_options")}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {showListStrike ? (
                <span className="mr-2 text-[11px] font-medium tabular-nums text-neutral-400 line-through">
                  {formatMoneyPhp(listPricePhp)}
                </span>
              ) : null}
              <span className="text-[17px] font-extrabold tabular-nums tracking-tight text-neutral-900">
                {formatMoneyPhp(baseUnitPhp)}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-neutral-200/70 pt-4">
            <span className="text-[13px] font-bold text-neutral-900">{t("store_product_qty_label")}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={qtyMinusDisabled}
                onClick={onQtyDecrease}
                className={`flex h-10 w-10 shrink-0 items-center justify-center text-lg font-bold leading-none ${STORE_ORDER_CTA_STEPPER}`}
                aria-label={t("store_qty_decrease_aria")}
              >
                −
              </button>
              <span className="min-w-[2.5rem] text-center text-[16px] font-extrabold tabular-nums text-neutral-900">
                {t("store_product_qty_count", { count: qty })}
              </span>
              <button
                type="button"
                disabled={qtyPlusDisabled}
                onClick={onQtyIncrease}
                className={`flex h-10 w-10 shrink-0 items-center justify-center text-lg font-bold leading-none ${STORE_ORDER_CTA_STEPPER}`}
                aria-label={t("store_qty_increase_aria")}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {awaitingOptionHydration ? (
          <StoreProductSheetOptionsSkeleton />
        ) : optionHydrationFailed ? (
          <div className="border-t-[8px] border-[#EDEDED] px-4 py-6 text-center">
            <p className="text-[13px] font-medium text-neutral-700">
              {t("store_product_option_load_failed")}
            </p>
            {onOptionRetry ? (
              <button
                type="button"
                onClick={onOptionRetry}
                className={`mt-3 text-[14px] font-bold text-[color:var(--delivery-primary)] ${STORE_ORDER_TOUCH_BTN}`}
              >
                {t("common_retry")}
              </button>
            ) : null}
          </div>
        ) : optionGroups.length > 0 ? (
          <div className="border-t-[8px] border-[#EDEDED]">
            <StoreModifierPicker
              groups={optionGroups}
              value={modifierWire}
              onChange={onModifierChange}
              disabled={optionsDisabled}
              variant="sheet"
            />
          </div>
        ) : null}

        <p className="px-4 pb-4 pt-4 text-center text-[11px] leading-relaxed text-[#AAAAAA]">
          {t("store_product_photo_disclaimer")}
        </p>
      </div>

      <StoreBaeminProductDetailFooter
        lineTotalPhp={lineTotalPhp}
        minOrderPhp={minOrderPhp}
        cartTotalPhp={cartTotalPhp}
        deliveryAvailable={deliveryAvailable}
        disabled={ctaDisabled}
        busy={cartBusy}
        errorMessage={errorMessage}
        onAdd={onAddToCart}
      />
    </>
  );
}
