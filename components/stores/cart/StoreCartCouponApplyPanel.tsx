"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CartCouponLineView } from "@/lib/stores/store-coupon-product-view";
import { BAEMIN_CART_SECTION_CARD_CLASS } from "@/lib/stores/store-baemin-cart-ui";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * Canonical Cart coupon apply surface (A/B/C/D).
 * A: owned=0 → parent renders null
 * B: owned>0 eligible=0 → collapsed ineligible entry
 * C/D: eligible ≥1 → applied card + change
 */
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
  const { t, safeT } = useI18n();
  const [showPicker, setShowPicker] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  // State A: owned=0 — parent must not mount
  if (applicable.length === 0 && ineligible.length === 0) return null;

  const applied = applicable.find((l) => l.isApplied) ?? null;
  const others = applicable.filter((l) => !l.isApplied);

  // State B: owned>0, eligible=0 — collapsed entry only (no auto-promote)
  if (applicable.length === 0) {
    return (
      <section className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3`} data-store-cart-coupon-panel="1" data-cart-coupon-state="B">
        <button
          type="button"
          className="w-full text-left text-sm font-medium text-sam-fg"
          data-cart-coupon-ineligible-toggle="1"
          onClick={() => setShowBlocked((v) => !v)}
        >
          {t("store_coupon_cart_ineligible_collapsed", { count: ineligible.length })}
        </button>
        {showBlocked ? (
          <ul className="mt-2 space-y-2">
            {ineligible.map((line) => (
              <li key={line.userCouponId} className="rounded-ui-rect border border-sam-border bg-sam-app p-2 text-xs text-sam-muted">
                <p className="font-medium text-sam-fg">{line.title}</p>
                {line.couponNumber ? (
                  <p>
                    {t("store_coupon_number_label")}: {line.couponNumber}
                  </p>
                ) : null}
                <p>
                  {line.ineligibleReasonKey
                    ? t(line.ineligibleReasonKey)
                    : safeT("store_coupon_unusable", { fallbackKo: "지금은 사용할 수 없습니다", fallbackEn: "Not usable now" })}
                  {line.shortagePhp != null && line.shortagePhp > 0
                    ? ` · ${t("store_min_order_add_more", { amount: formatMoneyPhp(line.shortagePhp) })}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  // State C/D: eligible ≥1
  return (
    <section className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3`} data-store-cart-coupon-panel="1" data-cart-coupon-state={applicable.length > 1 ? "D" : "C"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-sam-fg">{sectionTitle}</h3>
        {appliedUserCouponId ? (
          <button type="button" className="text-xs text-sam-muted underline" onClick={onChooseNone} data-cart-coupon-none="1">
            {noneLabel}
          </button>
        ) : null}
      </div>

      {applied ? (
        <div className="w-full rounded-ui-rect border-2 border-signature bg-signature/5 p-3 text-left" data-cart-coupon-applied="1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sam-fg">
                ✓ {applied.title}
                {applied.isBest ? (
                  <span className="ml-1 text-xs font-medium text-signature">{t("store_coupon_best_badge")}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-sam-muted">{t(applied.providerKey, { store: applied.storeName })}</p>
              {applied.couponNumber ? (
                <p className="mt-0.5 text-xs text-sam-muted">
                  {t("store_coupon_number_label")}: {applied.couponNumber}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-sm font-bold text-signature">-{formatMoneyPhp(applied.discountAmount)}</p>
          </div>
          <p className="mt-1 text-xs font-medium text-signature">{t("store_coupon_applied_badge")}</p>
          {(others.length > 0 || ineligible.length > 0) ? (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-signature underline"
              data-cart-coupon-change="1"
              onClick={() => setShowPicker((v) => !v)}
            >
              {safeT("store_coupon_cart_change", { fallbackKo: "변경", fallbackEn: "Change" })}
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded-ui-rect border border-sam-border bg-sam-app p-3 text-left text-sm font-medium text-sam-fg"
          data-cart-coupon-pick="1"
          onClick={() => setShowPicker(true)}
        >
          {safeT("store_coupon_cart_pick", { fallbackKo: "쿠폰 선택", fallbackEn: "Choose coupon" })}
        </button>
      )}

      {showPicker ? (
        <ul className="mt-2 space-y-2" data-cart-coupon-picker="1">
          {applicable.map((line) => (
            <li key={line.userCouponId}>
              <button
                type="button"
                className={`w-full rounded-ui-rect border p-3 text-left ${
                  line.isApplied ? "border-signature bg-signature/5" : "border-sam-border bg-sam-app"
                }`}
                onClick={() => {
                  onChoose(line);
                  setShowPicker(false);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-sam-fg">
                      {line.title}
                      {line.isBest ? (
                        <span className="ml-1 text-xs text-signature">{t("store_coupon_best_badge")}</span>
                      ) : null}
                    </p>
                    {line.couponNumber ? (
                      <p className="text-xs text-sam-muted">
                        {t("store_coupon_number_label")}: {line.couponNumber}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm font-bold text-signature">-{formatMoneyPhp(line.discountAmount)}</p>
                </div>
              </button>
            </li>
          ))}
          {ineligible.length > 0 ? (
            <li>
              <button
                type="button"
                className="text-xs text-sam-muted underline"
                onClick={() => setShowBlocked((v) => !v)}
              >
                {t("store_coupon_cart_ineligible_collapsed", { count: ineligible.length })}
              </button>
              {showBlocked
                ? ineligible.map((line) => (
                    <p key={line.userCouponId} className="mt-1 text-xs text-sam-muted">
                      {line.title}
                      {line.ineligibleReasonKey ? ` — ${t(line.ineligibleReasonKey)}` : ""}
                    </p>
                  ))
                : null}
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
