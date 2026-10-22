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
      ariaLabel={safeT("gift_u4_forfeit_confirm_title", {
        fallbackKo: "상품권 잔액 소멸 안내",
        fallbackEn: "Unused gift balance will expire",
      })}
      title={safeT("gift_u4_forfeit_confirm_title", {
        fallbackKo: "상품권 잔액 소멸 안내",
        fallbackEn: "Unused gift balance will expire",
      })}
      description={
        open ? (
          <span data-cart-gift-forfeit-confirm-body="1">
            {safeT("gift_u4_forfeit_confirm_body", {
              fallbackKo: `상품권은 한 번 사용하면 전액 소진됩니다. 이번 주문에 ${formatMoneyPhp(
                giftUsed
              )} 사용되고 남은 ${formatMoneyPhp(giftForfeited)}은(는) 소멸됩니다. (주문이 취소되면 상품권은 복원됩니다)`,
              fallbackEn: `A gift certificate is used up in one order. ${formatMoneyPhp(
                giftUsed
              )} is used on this order and the remaining ${formatMoneyPhp(
                giftForfeited
              )} will expire. (The gift is restored if the order is cancelled.)`,
              vars: {
                used: formatMoneyPhp(giftUsed),
                forfeit: formatMoneyPhp(giftForfeited),
              },
            })}
          </span>
        ) : null
      }
      cancelLabel={safeT("gift_u4_forfeit_confirm_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
      confirmLabel={safeT("gift_u4_forfeit_confirm_ok", {
        fallbackKo: "동의하고 사용",
        fallbackEn: "Agree and use",
      })}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
