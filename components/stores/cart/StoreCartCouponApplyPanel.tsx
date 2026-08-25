"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CartCouponLineView } from "@/lib/stores/store-coupon-product-view";
import { BAEMIN_CART_SECTION_CARD_CLASS } from "@/lib/stores/store-baemin-cart-ui";
import { formatMoneyPhp } from "@/lib/utils/format";

export function StoreCartCouponApplyPanel({
  applicable,
  ineligible,
  appliedUserCouponId,
  sectionTitle,
  noneLabel,
  onChooseNone,
  onChoose,
}: {
  applicable: CartCouponLineView[];
  ineligible: CartCouponLineView[];
  appliedUserCouponId: string | null;
  sectionTitle: string;
  noneLabel: string;
  onChooseNone: () => void;
  onChoose: (line: CartCouponLineView) => void;
}) {
  const { t } = useI18n();
  const [showOther, setShowOther] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  if (applicable.length === 0 && ineligible.length === 0) return null;

  const applied = applicable.find((l) => l.isApplied) ?? null;
  const others = applicable.filter((l) => !l.isApplied);

  return (
    <section className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3`} data-store-cart-coupon-panel="1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-sam-fg">{sectionTitle}</h3>
        {appliedUserCouponId ? (
          <button type="button" className="text-xs text-sam-muted underline" onClick={onChooseNone}>
            {noneLabel}
          </button>
        ) : null}
      </div>

      {applied ? (
        <button
          type="button"
          className="w-full rounded-ui-rect border-2 border-signature bg-signature/5 p-3 text-left"
          data-cart-coupon-applied="1"
          onClick={() => onChoose(applied)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sam-fg">
                ✓ {applied.title}
                {applied.isBest ? (
                  <span className="ml-1 text-xs font-medium text-signature">{t("store_coupon_best_badge")}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-sam-muted">
                {t(applied.providerKey, { store: applied.storeName })}
              </p>
              {applied.couponNumber ? (
                <p className="mt-0.5 text-xs text-sam-muted">
                  {t("store_coupon_number_label")}: {applied.couponNumber}
                </p>
              ) : null}
              {applied.minOrderPhp != null ? (
                <p className="mt-0.5 text-xs text-sam-muted">
                  {t("store_coupon_min_order")} {formatMoneyPhp(applied.minOrderPhp)}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-sm font-bold text-signature">-{formatMoneyPhp(applied.discountAmount)}</p>
          </div>
          <p className="mt-1 text-xs font-medium text-signature">{t("store_coupon_applied_badge")}</p>
        </button>
      ) : applicable.length > 0 ? (
        <button
          type="button"
          className="w-full rounded-ui-rect border border-sam-border bg-sam-app p-3 text-left"
          onClick={() => onChoose(applicable[0]!)}
        >
          <p className="text-sm font-medium text-sam-fg">{t("store_coupon_apply_suggested")}</p>
          <p className="mt-1 text-xs text-sam-muted">
            {applicable[0]!.title} · -{formatMoneyPhp(applicable[0]!.discountAmount)}
          </p>
        </button>
      ) : null}

      {others.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-xs font-medium text-sam-fg underline"
            onClick={() => setShowOther((v) => !v)}
          >
            {t("store_coupon_other_usable", { count: others.length })}
          </button>
          {showOther ? (
            <ul className="mt-2 space-y-2">
              {others.map((line) => (
                <li key={line.userCouponId}>
                  <button
                    type="button"
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-surface p-2.5 text-left"
                    onClick={() => onChoose(line)}
                  >
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-sam-fg">{line.title}</span>
                      <span className="shrink-0 text-signature">-{formatMoneyPhp(line.discountAmount)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {ineligible.length > 0 ? (
        <div className="mt-2 border-t border-dashed border-sam-border pt-2">
          <button
            type="button"
            className="text-xs font-medium text-sam-muted underline"
            onClick={() => setShowBlocked((v) => !v)}
          >
            {t("store_coupon_ineligible_count", { count: ineligible.length })}
          </button>
          {showBlocked ? (
            <ul className="mt-2 space-y-2">
              {ineligible.map((line) => (
                <li key={line.userCouponId} className="rounded-ui-rect bg-sam-app px-2.5 py-2 text-xs text-sam-muted">
                  <p className="font-medium text-sam-fg">{line.title}</p>
                  <p className="mt-0.5">
                    {line.ineligibleReasonKey ? t(line.ineligibleReasonKey) : t("store_coupon_unusable")}
                    {line.shortagePhp && line.shortagePhp > 0
                      ? ` · ${t("store_min_order_add_more", { amount: formatMoneyPhp(line.shortagePhp) })}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
