"use client";

import { DeliveryButton } from "@/components/delivery/ui/DeliveryButton";
import { STORE_CART_CLEAR_CONFIRM } from "@/lib/stores/store-cart-policy";
import { StoreCommerceCartAlert, StoreCommerceCartCenterPopup } from "@/components/stores/cart/StoreCommerceCartCenterPopup";

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
  const label = storeName.trim() || "이 가게";

  return (
    <StoreCommerceCartCenterPopup
      open={open}
      title={STORE_CART_CLEAR_CONFIRM.title}
      titleId="store-cart-clear-title"
      busy={busy}
      onBackdropClose={onCancel}
      footer={
        <>
          <DeliveryButton variant="danger" size="full" disabled={busy} onClick={onConfirm}>
            {busy ? "비우는 중…" : STORE_CART_CLEAR_CONFIRM.confirm}
          </DeliveryButton>
          <DeliveryButton variant="ghost" size="full" disabled={busy} onClick={onCancel}>
            {STORE_CART_CLEAR_CONFIRM.cancel}
          </DeliveryButton>
        </>
      }
    >
      <StoreCommerceCartAlert>
        <span className="font-bold">{label}</span> {STORE_CART_CLEAR_CONFIRM.body}
      </StoreCommerceCartAlert>
    </StoreCommerceCartCenterPopup>
  );
}
