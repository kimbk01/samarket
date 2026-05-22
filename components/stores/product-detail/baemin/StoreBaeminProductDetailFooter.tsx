"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BAEMIN_CART_ORDER_BTN_CLASS } from "@/lib/stores/store-baemin-cart-ui";
import { STORE_ORDER_TOUCH_BTN } from "@/components/stores/store-order-detail/store-order-brand";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { formatMoneyPhp } from "@/lib/utils/format";

/** StoreDetailBottomStrip 과 동일: 카트 합계 기준 최소주문 부족액 */
function storeMinOrderGapPhp(
  minOrderPhp: number | null,
  cartTotalPhp: number,
  deliveryAvailable: boolean
): number {
  if (
    !deliveryAvailable ||
    minOrderPhp == null ||
    minOrderPhp <= 0 ||
    cartTotalPhp <= 0 ||
    cartTotalPhp >= minOrderPhp
  ) {
    return 0;
  }
  return Math.max(0, Math.ceil(minOrderPhp - cartTotalPhp));
}

/** 물품 상세 하단 CTA — window 스크롤 + body 포털 fixed */
export function StoreBaeminProductDetailFooter({
  lineTotalPhp,
  minOrderPhp,
  cartTotalPhp,
  deliveryAvailable,
  disabled,
  busy,
  errorMessage,
  onAdd,
}: {
  lineTotalPhp: number;
  minOrderPhp: number | null;
  /** 해당 매장 카트 담긴 메뉴 합계(매장 상세 하단 스트립과 동일) */
  cartTotalPhp: number;
  deliveryAvailable: boolean;
  disabled: boolean;
  busy?: boolean;
  errorMessage?: string | null;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const [portalToBody, setPortalToBody] = useState(false);
  useEffect(() => {
    setPortalToBody(true);
  }, []);

  const totalLabel = formatMoneyPhp(Math.max(0, Math.floor(lineTotalPhp) || 0));
  const minPhp = minOrderPhp != null && minOrderPhp > 0 ? minOrderPhp : null;
  const minNeed = storeMinOrderGapPhp(minPhp, cartTotalPhp, deliveryAvailable);
  const ctaDisabled = disabled || busy;
  const cartTotal = Math.max(0, Math.floor(cartTotalPhp) || 0);

  const bar = (
    <div
      className="delivery-ui fixed inset-x-0 bottom-0 z-[50] border-t border-[var(--delivery-border-section)] bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
      data-store-product-detail-cta="1"
    >
      {errorMessage ? (
        <p className="px-4 pt-2 text-center text-[11px] font-medium text-red-600">{errorMessage}</p>
      ) : null}
      <div
        className={`mx-auto flex w-full min-w-0 items-end justify-between gap-3 px-4 pt-3 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
      >
        <div className="min-w-0 flex-1 pb-0.5">
          {minPhp != null ? (
            <>
              <p className="text-[11px] font-medium text-[#888888]">
                {t("store_product_delivery_min_order_heading")}
              </p>
              <p className="mt-0.5 text-[14px] font-bold tabular-nums text-[#111111]">
                {formatMoneyPhp(minPhp)}
              </p>
              {cartTotal > 0 ? (
                <p className="mt-1 text-[12px] font-semibold tabular-nums text-[#111111]">
                  {t("store_product_cart_subtotal_line", { amount: formatMoneyPhp(cartTotal) })}
                </p>
              ) : null}
              {minNeed > 0 ? (
                <p className="mt-1 text-[11px] font-semibold text-amber-800">
                  {t("store_bottom_min_order_remaining", { amount: formatMoneyPhp(minNeed) })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[11px] font-medium text-[#888888]">
              {t("store_product_line_amount_heading")}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={ctaDisabled}
          aria-busy={busy}
          onClick={(e) => {
            if (busy || ctaDisabled) {
              e.preventDefault();
              return;
            }
            onAdd();
          }}
          className={`${BAEMIN_CART_ORDER_BTN_CLASS} max-w-[min(100%,14rem)] rounded-[8px] !text-[16px] ${STORE_ORDER_TOUCH_BTN}`}
          aria-label={t("store_add_to_cart_amount_aria", { amount: totalLabel })}
        >
          {busy
            ? t("common_processing")
            : t("store_add_to_cart_with_amount", { amount: totalLabel })}
        </button>
      </div>
    </div>
  );

  return portalToBody && typeof document !== "undefined" ? createPortal(bar, document.body) : bar;
}
