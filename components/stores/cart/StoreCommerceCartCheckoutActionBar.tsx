"use client";

import { forwardRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreCommerceBottomActionShell } from "@/components/stores/commerce/StoreCommerceBottomActionShell";
import { DeliveryTheme } from "@/lib/design/delivery-theme";
import {
  STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS,
  storeCommerceActionRowClass,
  storeCommerceActionSideCtaClass,
} from "@/lib/stores/store-commerce-bottom-action-bar";
import { formatMoneyPhp } from "@/lib/utils/format";

type Props = {
  displayGrand: number;
  strikeGrand?: number | null;
  promoLine?: string | null;
  minOrderLine?: { met: boolean; text: string } | null;
  busy: boolean;
  submitDisabled: boolean;
  disabledReason?: string | null;
  processingLabel: string;
  onSubmit: () => void;
};

function pickFooterHint(args: {
  disabledReason?: string | null;
  minOrderLine?: { met: boolean; text: string } | null;
  promoLine?: string | null;
}): { text: string; tone: "warn" | "ok" | "promo" | "muted" } | null {
  if (args.disabledReason?.trim()) {
    return { text: args.disabledReason.trim(), tone: "warn" };
  }
  if (args.minOrderLine && !args.minOrderLine.met) {
    return { text: args.minOrderLine.text, tone: "warn" };
  }
  if (args.promoLine?.trim()) {
    return { text: args.promoLine.trim(), tone: "promo" };
  }
  if (args.minOrderLine?.met) {
    return { text: args.minOrderLine.text, tone: "ok" };
  }
  return null;
}

/**
 * 장바구니 하단 — 배민식 한 줄(결제금액 + 주문 CTA), 보조 안내는 최대 1줄.
 */
export const StoreCartCheckoutActionBar = forwardRef<HTMLElement, Props>(
  function StoreCartCheckoutActionBarInner(
    {
      displayGrand,
      strikeGrand,
      promoLine,
      minOrderLine,
      busy,
      submitDisabled,
      disabledReason,
      processingLabel,
      onSubmit,
    },
    ref
  ) {
    const { t } = useI18n();
    const showStrike =
      strikeGrand != null && Number.isFinite(strikeGrand) && strikeGrand > displayGrand;
    const ctaDisabled = submitDisabled || busy;
    const hint = pickFooterHint({ disabledReason, minOrderLine, promoLine });

    return (
      <section ref={ref} className="delivery-ui shrink-0 w-full min-w-0" aria-label={t("store_checkout_submit")}>
        <StoreCommerceBottomActionShell
          variant="cart-checkout"
          inline
          portal={false}
          dataAttribute="data-store-cart-checkout-action"
        >
          <div className={storeCommerceActionRowClass("cart-checkout")}>
            <div className={`${DeliveryTheme.cartCheckoutBar.root} min-w-0 flex-1`}>
              <p className={DeliveryTheme.cartCheckoutBar.label}>{t("store_payment_due")}</p>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
                <p className={DeliveryTheme.cartCheckoutBar.price}>{formatMoneyPhp(displayGrand)}</p>
                {showStrike ? (
                  <p className="text-[14px] font-medium tabular-nums text-[color:var(--delivery-text-muted)] line-through">
                    {formatMoneyPhp(strikeGrand!)}
                  </p>
                ) : null}
              </div>
              {hint ? (
                <p
                  className={`${DeliveryTheme.cartCheckoutBar.hint} ${
                    hint.tone === "warn"
                      ? "delivery-cart-checkout-bar__hint--warn"
                      : hint.tone === "ok"
                        ? "delivery-cart-checkout-bar__hint--ok"
                        : hint.tone === "promo"
                          ? "delivery-cart-checkout-bar__hint--promo"
                          : ""
                  }`}
                >
                  {hint.text}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={ctaDisabled}
              onClick={onSubmit}
              className={storeCommerceActionSideCtaClass(ctaDisabled)}
            >
              <span className={STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS}>
                {busy ? processingLabel : t("store_submit_store_delivery")}
              </span>
            </button>
          </div>
        </StoreCommerceBottomActionShell>
      </section>
    );
  }
);

StoreCartCheckoutActionBar.displayName = "StoreCartCheckoutActionBar";
