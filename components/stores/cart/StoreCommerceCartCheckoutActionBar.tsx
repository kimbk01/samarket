"use client";

import { forwardRef } from "react";
import { formatMoneyPhp } from "@/lib/utils/format";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import {
  BAEMIN_CART_FOOTER_PROMO_CLASS,
  BAEMIN_CART_ORDER_BTN_CLASS,
  BAEMIN_CART_PAGE_X,
} from "@/lib/stores/store-baemin-cart-ui";
import { STORE_CART_CHECKOUT_ACTION_INNER_CLASS } from "@/lib/stores/store-cart-page-layout";

type Props = {
  displayGrand: number;
  strikeGrand?: number | null;
  promoLine?: string | null;
  busy: boolean;
  submitDisabled: boolean;
  processingLabel: string;
  onSubmit: () => void;
};

/** 배민식 하단 — 좌측 금액(할인 시 취소선) + 우측 primary 버튼 */
export const StoreCartCheckoutActionBar = forwardRef<HTMLElement, Props>(
  function StoreCartCheckoutActionBarInner(
    { displayGrand, strikeGrand, promoLine, busy, submitDisabled, processingLabel, onSubmit },
    ref
  ) {
    const showStrike =
      strikeGrand != null && Number.isFinite(strikeGrand) && strikeGrand > displayGrand;

    return (
      <section
        ref={ref}
        data-store-cart-checkout-action=""
        className="relative z-10 w-full min-w-0 bg-white"
        aria-label="주문 접수"
      >
        <div
          className={`mx-auto flex min-h-[56px] items-center gap-3 ${BAEMIN_CART_PAGE_X} ${STORE_CART_CHECKOUT_ACTION_INNER_CLASS} ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
        >
          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
              <p className="text-[20px] font-bold leading-none tabular-nums text-[#111111]">
                {formatMoneyPhp(displayGrand)}
              </p>
              {showStrike ? (
                <p className="text-[14px] font-medium tabular-nums text-[#999999] line-through">
                  {formatMoneyPhp(strikeGrand!)}
                </p>
              ) : null}
            </div>
            {promoLine ? <p className={`mt-1 ${BAEMIN_CART_FOOTER_PROMO_CLASS}`}>{promoLine}</p> : null}
          </div>
          <button
            type="button"
            disabled={submitDisabled || busy}
            onClick={onSubmit}
            className={BAEMIN_CART_ORDER_BTN_CLASS}
          >
            {busy ? processingLabel : "가게 주문하기"}
          </button>
        </div>
      </section>
    );
  }
);

StoreCartCheckoutActionBar.displayName = "StoreCartCheckoutActionBar";
