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
  blockedMinOrderHint,
  onChooseNone,
  onChoose,
}: {
  quotes: StoreCouponQuote[];
  appliedUserCouponId: string | null;
  noneLabel: string;
  applyLabel: string;
  titleFallback: string;
  blockedMinOrderHint: string | null;
  onChooseNone: () => void;
  onChoose: (quote: StoreCouponQuote) => void;
}) {
  const usable = quotes.filter(isUsableStoreCouponQuote);
  if (usable.length === 0) {
    if (!blockedMinOrderHint) return null;
    return (
      <div className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3`} data-store-cart-coupon-apply="1">
        <p className="text-sm font-medium text-sam-fg">{applyLabel}</p>
        <p className="mt-1 text-xs text-sam-muted">{blockedMinOrderHint}</p>
      </div>
    );
  }

  return (
    <div className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3`} data-store-cart-coupon-apply="1">
      <label className="mb-1 block text-sm font-medium text-sam-fg" htmlFor="store-cart-coupon-select">
        {applyLabel}
      </label>
      <select
        id="store-cart-coupon-select"
        className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-2 text-sm text-sam-fg"
        value={appliedUserCouponId ?? ""}
        onChange={(e) => {
          const id = e.target.value.trim();
          if (!id) {
            onChooseNone();
            return;
          }
          const row = usable.find((q) => q.userCouponId === id);
          if (row) onChoose(row);
        }}
      >
        <option value="">{noneLabel}</option>
        {usable.map((q) => (
          <option key={q.userCouponId} value={q.userCouponId}>
            {q.title?.trim() || titleFallback}
            {q.discountAmount > 0 ? ` · ₱${q.discountAmount}` : ""}
          </option>
        ))}
      </select>
      {blockedMinOrderHint ? <p className="mt-1 text-xs text-sam-muted">{blockedMinOrderHint}</p> : null}
    </div>
  );
}
