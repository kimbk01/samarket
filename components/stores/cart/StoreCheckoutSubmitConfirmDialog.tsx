"use client";

import {
  CART_POPUP_BTN_GHOST,
  CART_POPUP_BTN_PRIMARY,
  StoreCommerceCartCenterPopup,
} from "@/components/stores/cart/StoreCommerceCartCenterPopup";

/** 주문 접수 전 확인 — 가운데 팝업 */
export function StoreCheckoutSubmitConfirmDialog({
  open,
  phoneLabel,
  addressLabel,
  paymentLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  phoneLabel: string;
  addressLabel: string;
  paymentLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <StoreCommerceCartCenterPopup
      open={open}
      title="주문 내용을 확인해 주세요"
      titleId="store-checkout-confirm-title"
      busy={busy}
      onBackdropClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onConfirm} disabled={busy} className={CART_POPUP_BTN_PRIMARY}>
            {busy ? "접수 중…" : "주문 접수"}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className={CART_POPUP_BTN_GHOST}>
            취소
          </button>
        </>
      }
    >
      <dl className="space-y-2.5 text-[13px] leading-relaxed text-neutral-700">
        <div>
          <dt className="font-semibold text-neutral-500">연락처</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{phoneLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-500">주소</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-medium text-neutral-900">{addressLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-500">결제</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{paymentLabel}</dd>
        </div>
      </dl>
    </StoreCommerceCartCenterPopup>
  );
}
