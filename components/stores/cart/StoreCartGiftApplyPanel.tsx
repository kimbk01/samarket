"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import type { CheckoutEligibleGift } from "@/lib/gift-certificate/checkout-eligible-gifts";
import {
  checkoutGiftChoiceNeedsForfeitConsent,
  computeCheckoutGiftApplyPreview,
} from "@/lib/gift-certificate/checkout-eligible-gifts";
import { StoreCartGiftForfeitConsentDialog } from "@/components/stores/cart/StoreCartGiftForfeitConsentDialog";
import { BAEMIN_CART_SECTION_CARD_CLASS } from "@/lib/stores/store-baemin-cart-ui";
import { formatMoneyPhp } from "@/lib/utils/format";
import { DELIVERY_TOUCH_HIT_EXPAND_CLASS } from "@/lib/stores/delivery-touch-target";

/**
 * Cart Gift apply surface — separate from Coupon.
 * Certificate identity = Modern Ticket Face SSOT; apply amount lives outside Face.
 * No auto-apply. Max 1 selection (UI). Empty owned list → parent may still show empty copy.
 * GFT-04: one-time full consumption — forfeited amount is shown, and choosing a gift that forfeits value
 * requires consent in a confirm dialog (overlay contract). Display only; RPC policy unchanged.
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
  /** forfeitConsentedPhp — 선택 시 동의한 소멸액(소멸 없으면 0). 이후 소멸액이 커지면 주문 직전에 다시 동의 (CG-01) */
  onChoose: (gift: CheckoutEligibleGift, forfeitConsentedPhp: number) => void;
}) {
  const { safeT } = useI18n();
  const [showPicker, setShowPicker] = useState(false);
  const [pendingForfeit, setPendingForfeit] = useState<{
    gift: CheckoutEligibleGift;
    giftUsed: number;
    giftForfeited: number;
  } | null>(null);

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
            className={`text-xs text-sam-muted underline ${DELIVERY_TOUCH_HIT_EXPAND_CLASS}`}
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
          className="w-full rounded-ui-rect border-2 border-signature p-2 text-left"
          data-cart-gift-applied="1"
          data-gift-instance-id={applied.instanceId}
          {...(applied.publicGiftNumber?.trim()
            ? { "data-cart-gift-public-number": applied.publicGiftNumber.trim() }
            : {})}
        >
          <GiftVisualCard
            visual={{
              giftScope: applied.giftScope,
              imageUrl: applied.imageUrl,
              storeName: applied.storeName,
              title: applied.title,
            }}
            surface="wallet"
            size="sm"
            title={applied.title}
            issuerName={applied.storeName}
            faceValue={applied.faceValue}
            publicGiftNumber={applied.publicGiftNumber}
            showGiftNumber={Boolean(applied.publicGiftNumber?.trim())}
            className="pointer-events-none"
          />
          <p className="mt-2 text-center text-sm font-bold text-signature">
            -{formatMoneyPhp(appliedPreview.giftUsed)}
          </p>
          {appliedPreview.giftForfeited > 0 ? (
            <p className="mt-1 text-center text-xs font-medium text-sam-danger" data-cart-gift-forfeit="1">
              {safeT("gift_u4_cart_forfeit", {
                fallbackKo: `미사용 ${formatMoneyPhp(appliedPreview.giftForfeited)} 소멸`,
                fallbackEn: `${formatMoneyPhp(appliedPreview.giftForfeited)} unused will expire`,
                vars: { amount: formatMoneyPhp(appliedPreview.giftForfeited) },
              })}
            </p>
          ) : null}
          {gifts.length > 1 ? (
            <button
              type="button"
              className="mt-2 w-full text-xs font-medium text-signature underline"
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
        <ul className="mt-2 space-y-3" data-cart-gift-picker="1">
          {gifts.map((g) => {
            const preview = computeCheckoutGiftApplyPreview({
              amountBeforeGift,
              giftRemaining: g.remainingBalance,
            });
            const selected = g.instanceId === appliedInstanceId;
            return (
              <li key={g.instanceId}>
                <button
                  type="button"
                  className={`w-full rounded-ui-rect border-2 p-2 text-left ${
                    selected ? "border-signature" : "border-transparent hover:border-signature/40"
                  }`}
                  data-cart-gift-option={g.instanceId}
                  {...(g.publicGiftNumber?.trim()
                    ? { "data-cart-gift-public-number": g.publicGiftNumber.trim() }
                    : {})}
                  onClick={() => {
                    setShowPicker(false);
                    if (!selected && checkoutGiftChoiceNeedsForfeitConsent(preview)) {
                      setPendingForfeit({
                        gift: g,
                        giftUsed: preview.giftUsed,
                        giftForfeited: preview.giftForfeited,
                      });
                      return;
                    }
                    onChoose(g, 0);
                  }}
                >
                  <GiftVisualCard
                    visual={{
                      giftScope: g.giftScope,
                      imageUrl: g.imageUrl,
                      storeName: g.storeName,
                      title: g.title,
                    }}
                    surface="wallet"
                    size="sm"
                    title={g.title}
                    issuerName={g.storeName}
                    faceValue={g.faceValue}
                    publicGiftNumber={g.publicGiftNumber}
                    showGiftNumber={Boolean(g.publicGiftNumber?.trim())}
                    className="pointer-events-none"
                  />
                  <p className="mt-2 text-center text-xs font-medium text-signature">
                    {safeT("gift_u4_cart_usable", {
                      fallbackKo: `이번 주문 사용 ${formatMoneyPhp(preview.giftUsed)}`,
                      fallbackEn: `Use ${formatMoneyPhp(preview.giftUsed)} on this order`,
                      vars: { amount: formatMoneyPhp(preview.giftUsed) },
                    })}
                  </p>
                  {preview.giftForfeited > 0 ? (
                    <p
                      className="mt-1 text-center text-xs font-medium text-sam-danger"
                      data-cart-gift-option-forfeit={g.instanceId}
                    >
                      {safeT("gift_u4_cart_forfeit", {
                        fallbackKo: `미사용 ${formatMoneyPhp(preview.giftForfeited)} 소멸`,
                        fallbackEn: `${formatMoneyPhp(preview.giftForfeited)} unused will expire`,
                        vars: { amount: formatMoneyPhp(preview.giftForfeited) },
                      })}
                    </p>
                  ) : null}
                  <span className="mt-1 block text-center text-sm font-semibold text-signature">
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

      <StoreCartGiftForfeitConsentDialog
        open={pendingForfeit !== null}
        giftUsed={pendingForfeit?.giftUsed ?? 0}
        giftForfeited={pendingForfeit?.giftForfeited ?? 0}
        onCancel={() => setPendingForfeit(null)}
        onConfirm={() => {
          const next = pendingForfeit;
          setPendingForfeit(null);
          if (next) onChoose(next.gift, next.giftForfeited);
        }}
      />
    </section>
  );
}
