"use client";

import { BAEMIN_CART_SECTION_CARD_CLASS } from "@/lib/stores/store-baemin-cart-ui";
import type { StoreCouponQuote } from "@/lib/stores/store-coupon-best-eligible";
import { isUsableStoreCouponQuote } from "@/lib/stores/store-coupon-best-eligible";

export function StoreCartCouponApplyBlock({
  quotes,
  appliedUserCouponId,
  noneLabel,
  applyLabel,
  titleFallback,
  unusableMinLabel,
  formatShortage,
  onChooseNone,
  onChoose,
}: {
  quotes: StoreCouponQuote[];
  appliedUserCouponId: string | null;
  noneLabel: string;
  applyLabel: string;
  titleFallback: string;
  unusableMinLabel: (quote: StoreCouponQuote) => string;
  formatShortage: (quote: StoreCouponQuote) => string | null;
  onChooseNone: () => void;
  onChoose: (quote: StoreCouponQuote) => void;
}) {
  const listed = quotes.filter(
    (q) => !q.ineligibleReason || q.ineligibleReason === "coupon_min_order"
  );
  if (listed.length === 0) return null;

  return (
    <div className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3`} data-store-cart-coupon-apply="1">
      <p className="mb-2 text-sm font-medium text-sam-fg">{applyLabel}</p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={applyLabel}>
        <button
          type="button"
          role="radio"
          aria-checked={!appliedUserCouponId}
          onClick={onChooseNone}
          className={`min-h-11 w-full rounded-ui-rect border px-3 py-2 text-left text-sm ${
            !appliedUserCouponId
              ? "border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary-soft)]"
              : "border-sam-border bg-sam-app"
          }`}
        >
          {noneLabel}
        </button>
        {listed.map((q) => {
          const usable = isUsableStoreCouponQuote(q);
          const selected = appliedUserCouponId === q.userCouponId;
          const shortage = formatShortage(q);
          return (
            <button
              key={q.userCouponId}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!usable}
              onClick={() => {
                if (usable) onChoose(q);
              }}
              className={`min-h-11 w-full rounded-ui-rect border px-3 py-2 text-left text-sm ${
                selected
                  ? "border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary-soft)]"
                  : "border-sam-border bg-sam-app"
              } ${usable ? "" : "opacity-70"}`}
            >
              <span className="block font-medium text-sam-fg">
                {q.title?.trim() || titleFallback}
                {usable && q.discountAmount > 0 ? ` · ₱${q.discountAmount}` : ""}
              </span>
              {!usable ? (
                <span className="mt-0.5 block text-xs text-sam-muted">
                  {shortage ?? unusableMinLabel(q)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
