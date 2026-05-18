"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import {
  CART_POPUP_BTN_DANGER,
  CART_POPUP_BTN_GHOST,
  StoreCommerceCartAlert,
  StoreCommerceCartCenterPopup,
} from "@/components/stores/cart/StoreCommerceCartCenterPopup";

/** 장바구니 비우기 — 가운데 팝업 */
export function StoreCartClearConfirmDialog({
  open,
  storeName,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  storeName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const label = storeName.trim() || t("store_this_store");

  return (
    <StoreCommerceCartCenterPopup
      open={open}
      title={t("store_cart_clear_title")}
      titleId="store-cart-clear-title"
      busy={busy}
      onBackdropClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onConfirm} disabled={busy} className={CART_POPUP_BTN_DANGER}>
            {busy ? t("store_cart_clearing") : t("store_cart_clear_confirm")}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className={CART_POPUP_BTN_GHOST}>
            {t("common_cancel")}
          </button>
        </>
      }
    >
      <StoreCommerceCartAlert>
        <span className="font-bold">{label}</span> {t("store_cart_clear_body")}
      </StoreCommerceCartAlert>
    </StoreCommerceCartCenterPopup>
  );
}
