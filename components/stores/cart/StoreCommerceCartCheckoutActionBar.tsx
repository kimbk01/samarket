"use client";

import { forwardRef } from "react";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { formatMoneyPhp } from "@/lib/utils/format";
import { STORE_CART_CHECKOUT_ACTION_INNER_CLASS } from "@/lib/stores/store-cart-page-layout";

type Props = {
  displayGrand: number;
  busy: boolean;
  submitDisabled: boolean;
  submitLabel: string;
  onSubmit: () => void;
};

/** 가게배달 주문하기 — 셸 하단 고정 영역 안 */
export const StoreCartCheckoutActionBar = forwardRef<HTMLElement, Props>(
  function StoreCartCheckoutActionBar(
    { displayGrand, busy, submitDisabled, submitLabel, onSubmit },
    ref
  ) {
    return (
      <section
        ref={ref}
        data-store-cart-checkout-action=""
        className="w-full min-w-0"
        aria-label="주문 접수"
      >
        <div className={`mx-auto ${STORE_CART_CHECKOUT_ACTION_INNER_CLASS} ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}>
          <div className="min-w-0 flex-1">
            <p className="sam-text-page-title font-extrabold leading-none tabular-nums text-sam-fg">
              {formatMoneyPhp(displayGrand)}
            </p>
          </div>
          <button
            type="button"
            disabled={submitDisabled || busy}
            onClick={onSubmit}
            className="inline-flex h-11 min-w-[11.5rem] touch-manipulation items-center justify-center rounded-[12px] bg-[#1C8DB8] px-5 sam-text-body font-extrabold text-white shadow-sm transition-all duration-150 hover:bg-[#197DA3] active:bg-[#166F92] active:scale-[0.98] disabled:bg-sam-surface-muted disabled:text-sam-muted disabled:active:scale-100"
          >
            {submitLabel}
          </button>
        </div>
      </section>
    );
  }
);
