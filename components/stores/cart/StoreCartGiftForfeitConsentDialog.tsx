"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * GFT-04 상품권 1회 전액 소진 — 소멸액 동의창 (문구·버튼은 기존 키 그대로).
 * 상품권 선택 시(`StoreCartGiftApplyPanel`)와, 선택 뒤 소멸액이 커진 채 주문할 때(CG-01 장바구니) 같은 창을 쓴다.
 */
export function StoreCartGiftForfeitConsentDialog({
  open,
  giftUsed,
  giftForfeited,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  giftUsed: number;
  giftForfeited: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { safeT } = useI18n();
  return (
    <DibayConfirmDialog
      open={open}
      ariaLabel={safeT("gift_u4_forfeit_confirm_title")}
      title={safeT("popup_q_use_gift_forfeit", { vars: { amount: formatMoneyPhp(giftForfeited) } })}
      description={
        open ? (
          <span data-cart-gift-forfeit-confirm-body="1">
            {safeT("gift_u4_forfeit_confirm_body", { vars: {
                used: formatMoneyPhp(giftUsed),
                forfeit: formatMoneyPhp(giftForfeited),
              } })}
          </span>
        ) : null
      }
      cancelLabel={safeT("common_cancel")}
      confirmLabel={safeT("popup_btn_use")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
