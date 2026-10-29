"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ParsedOptionGroup } from "@/lib/stores/modifiers/types";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import { StoreModifierPicker } from "@/components/stores/modifiers/StoreModifierPicker";
import { StoreProductSheetOptionsSkeleton } from "@/components/stores/product-sheet/StoreProductSheetSkeleton";
import { STORE_ORDER_TOUCH_BTN } from "@/components/stores/store-order-detail/store-order-brand";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreBaeminProductDetailFooter } from "@/components/stores/product-detail/baemin/StoreBaeminProductDetailFooter";
import { StoreBaeminProductDetailInfo } from "@/components/stores/product-detail/baemin/StoreBaeminProductDetailInfo";

export type StoreBaeminProductDetailViewProps = {
  title: string;
  summary: string | null;
  badges: string[];
  /** v4 W3 PL-02 */
  isSampleStore?: boolean;
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
    title,
    summary,
    badges,
    isSampleStore,
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
      <div className="bg-white pb-[calc(var(--store-commerce-action-min-h-product-add,6.5rem)+var(--store-commerce-action-plane-pb,0.75rem)+var(--safe-bottom))]">
        <StoreBaeminProductDetailInfo
          title={title}
          summary={summary}
          badges={badges}
          isSampleStore={isSampleStore}
        />

        {commerceBlockedMessage ? (
          <p className="mx-4 mb-2 rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft px-3 py-2.5 text-[12px] font-medium leading-snug text-sam-fg">
            {commerceBlockedMessage}
          </p>
        ) : null}
        {soldOut ? (
          <p
            data-owner-buyer-sold-out="1"
            className="mx-4 mb-2 rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-[13px] font-medium text-sam-fg"
          >
            {t("store_sold_out")}
          </p>
        ) : null}

        {/* WP7 — 회색 상자 제거: 「수량」 [ − n + ] 테두리 상자 → 「가격」 순서 */}
        <div className="bg-white px-4" data-store-product-qty-price="1">
          <div className="flex items-center justify-between border-t border-sam-border-soft py-3">
            <span className="text-[15px] font-bold text-sam-fg">{t("store_product_qty_label")}</span>
            <div
              className="flex h-9 items-stretch overflow-hidden rounded-ui-rect border border-sam-border bg-white"
              data-store-product-qty-stepper="1"
            >
              <button
                type="button"
                disabled={qtyMinusDisabled}
                onClick={onQtyDecrease}
                className="flex w-9 touch-manipulation items-center justify-center text-[18px] leading-none text-sam-fg active:bg-sam-surface-muted disabled:text-sam-meta disabled:opacity-50"
                aria-label={t("store_qty_decrease_aria")}
              >
                {"\u2212"}
              </button>
              <span className="flex min-w-[2.25rem] items-center justify-center text-[15px] font-bold tabular-nums text-sam-fg">
                {qty}
              </span>
              <button
                type="button"
                disabled={qtyPlusDisabled}
                onClick={onQtyIncrease}
                className="flex w-9 touch-manipulation items-center justify-center text-[18px] leading-none text-sam-fg active:bg-sam-surface-muted disabled:text-sam-meta disabled:opacity-50"
                aria-label={t("store_qty_increase_aria")}
              >
                +
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-sam-border-soft py-3">
            <span className="text-[15px] font-bold text-sam-fg">{t("store_product_price_label")}</span>
            <div className="shrink-0 text-right">
              {showListStrike ? (
                <span className="mr-2 text-[12px] font-medium tabular-nums text-sam-meta line-through">
                  {formatMoneyPhp(listPricePhp)}
                </span>
              ) : null}
              <span className="text-[16px] font-extrabold tabular-nums tracking-tight text-sam-fg">
                {formatMoneyPhp(baseUnitPhp)}
              </span>
            </div>
          </div>
        </div>

        {awaitingOptionHydration ? (
          <StoreProductSheetOptionsSkeleton />
        ) : optionHydrationFailed ? (
          <div className="border-t-[8px] border-sam-surface-muted px-4 py-6 text-center">
            <p className="text-[13px] font-medium text-sam-muted">
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
          <div className="border-t-[8px] border-sam-surface-muted">
            <StoreModifierPicker
              groups={optionGroups}
              value={modifierWire}
              onChange={onModifierChange}
              disabled={optionsDisabled}
              variant="sheet"
            />
          </div>
        ) : null}
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
