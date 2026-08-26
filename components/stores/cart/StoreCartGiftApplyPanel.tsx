"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
import type { CheckoutEligibleGift } from "@/lib/gift-certificate/checkout-eligible-gifts";
import { computeCheckoutGiftApplyPreview } from "@/lib/gift-certificate/checkout-eligible-gifts";
import { BAEMIN_CART_SECTION_CARD_CLASS } from "@/lib/stores/store-baemin-cart-ui";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * Cart Gift apply surface — separate from Coupon.
 * No auto-apply. Max 1 selection (UI). Empty owned list → parent may still show empty copy.
 */
export function StoreCartGiftApplyPanel({
  gifts,
  appliedInstanceId,
  amountBeforeGift,
  onChooseNone,
  onChoose,
}: {
  gifts: CheckoutEligibleGift[];
  appliedInstanceId: string | null;
  amountBeforeGift: number;
  onChooseNone: () => void;
  onChoose: (gift: CheckoutEligibleGift) => void;
}) {
  const { safeT } = useI18n();
  const [showPicker, setShowPicker] = useState(false);

  if (gifts.length === 0) {
    return (
      <section
        className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3`}
        data-store-cart-gift-panel="1"
        data-cart-gift-state="empty"
      >
        <h3 className="text-sm font-semibold text-sam-fg">
          {safeT("gift_u4_cart_section", { fallbackKo: "상품권", fallbackEn: "Gift certificate" })}
        </h3>
        <p className="mt-1 text-sm text-sam-muted">
          {safeT("gift_u4_cart_empty", {
            fallbackKo: "사용 가능한 상품권이 없습니다.",
            fallbackEn: "No gift certificates available.",
          })}
        </p>
      </section>
    );
  }

  const applied = gifts.find((g) => g.instanceId === appliedInstanceId) ?? null;
  const appliedPreview = applied
    ? computeCheckoutGiftApplyPreview({
        amountBeforeGift,
        giftRemaining: applied.remainingBalance,
      })
    : null;

  return (
    <section
      className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3`}
      data-store-cart-gift-panel="1"
      data-cart-gift-state={applied ? "applied" : "pick"}
      data-cart-gift-count={String(gifts.length)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-sam-fg">
          {safeT("gift_u4_cart_section", { fallbackKo: "상품권", fallbackEn: "Gift certificate" })}
        </h3>
        {appliedInstanceId ? (
          <button
            type="button"
            className="text-xs text-sam-muted underline"
            data-cart-gift-none="1"
            onClick={onChooseNone}
          >
            {safeT("gift_u4_cart_none", { fallbackKo: "사용 취소", fallbackEn: "Remove" })}
          </button>
        ) : null}
      </div>

      <p className="mb-2 text-xs text-sam-muted">
        {safeT("gift_u4_cart_available_count", {
          fallbackKo: `사용 가능한 상품권 ${gifts.length}개`,
          fallbackEn: `${gifts.length} gift certificate(s) available`,
          vars: { count: gifts.length },
        })}
      </p>

      {applied && appliedPreview ? (
        <div
          className="w-full rounded-ui-rect border-2 border-signature bg-signature/5 p-3 text-left"
          data-cart-gift-applied="1"
          data-gift-instance-id={applied.instanceId}
        >
          <div className="flex gap-2">
            <GiftArtwork src={applied.imageUrl} alt={applied.title} size={48} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sam-fg">{applied.title || "—"}</p>
              {applied.storeName ? (
                <p className="truncate text-xs text-sam-muted">{applied.storeName}</p>
              ) : null}
              <p className="mt-0.5 text-xs text-sam-muted">
                {safeT("gift_u4_cart_remaining", {
                  fallbackKo: `잔액 ${formatMoneyPhp(applied.remainingBalance)}`,
                  fallbackEn: `Balance ${formatMoneyPhp(applied.remainingBalance)}`,
                  vars: { amount: formatMoneyPhp(applied.remainingBalance) },
                })}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold text-signature">
              -{formatMoneyPhp(appliedPreview.giftUsed)}
            </p>
          </div>
          {gifts.length > 1 ? (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-signature underline"
              data-cart-gift-change="1"
              onClick={() => setShowPicker((v) => !v)}
            >
              {safeT("gift_u4_cart_change", { fallbackKo: "변경", fallbackEn: "Change" })}
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded-ui-rect border border-sam-border bg-sam-app p-3 text-left text-sm font-medium text-sam-fg"
          data-cart-gift-pick="1"
          onClick={() => setShowPicker(true)}
        >
          {safeT("gift_u4_cart_pick", {
            fallbackKo: "상품권 선택",
            fallbackEn: "Choose gift certificate",
          })}
        </button>
      )}

      {showPicker ? (
        <ul className="mt-2 space-y-2" data-cart-gift-picker="1">
          {gifts.map((g) => {
            const preview = computeCheckoutGiftApplyPreview({
              amountBeforeGift,
              giftRemaining: g.remainingBalance,
            });
            return (
              <li key={g.instanceId}>
                <button
                  type="button"
                  className={`w-full rounded-ui-rect border p-3 text-left ${
                    g.instanceId === appliedInstanceId
                      ? "border-signature bg-signature/5"
                      : "border-sam-border bg-sam-app"
                  }`}
                  data-cart-gift-option={g.instanceId}
                  onClick={() => {
                    onChoose(g);
                    setShowPicker(false);
                  }}
                >
                  <div className="flex gap-2">
                    <GiftArtwork src={g.imageUrl} alt={g.title} size={44} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-sam-fg">{g.title || "—"}</p>
                      {g.storeName ? (
                        <p className="truncate text-xs text-sam-muted">{g.storeName}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-sam-muted">
                        {safeT("gift_u4_cart_remaining", {
                          fallbackKo: `잔액 ${formatMoneyPhp(g.remainingBalance)}`,
                          fallbackEn: `Balance ${formatMoneyPhp(g.remainingBalance)}`,
                          vars: { amount: formatMoneyPhp(g.remainingBalance) },
                        })}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-signature">
                        {safeT("gift_u4_cart_usable", {
                          fallbackKo: `이번 주문 사용 ${formatMoneyPhp(preview.giftUsed)}`,
                          fallbackEn: `Use ${formatMoneyPhp(preview.giftUsed)} on this order`,
                          vars: { amount: formatMoneyPhp(preview.giftUsed) },
                        })}
                      </p>
                    </div>
                  </div>
                  <span className="mt-2 block text-center text-sm font-semibold text-signature">
                    {safeT("gift_u4_cart_use_this", {
                      fallbackKo: "이 상품권 사용",
                      fallbackEn: "Use this gift",
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
