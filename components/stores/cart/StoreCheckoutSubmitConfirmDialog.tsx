"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  orderSummaryLabel,
  requestLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  phoneLabel: string;
  addressLabel: string;
  paymentLabel: string;
  orderSummaryLabel?: string;
  requestLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <StoreCommerceCartCenterPopup
      open={open}
      title={t("store_checkout_confirm_title")}
      titleId="store-checkout-confirm-title"
      busy={busy}
      onBackdropClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onConfirm} disabled={busy} className={CART_POPUP_BTN_PRIMARY}>
            {busy ? t("store_checkout_submitting") : t("store_checkout_submit")}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className={CART_POPUP_BTN_GHOST}>
            {t("common_cancel")}
          </button>
        </>
      }
    >
      <dl className="space-y-2.5 text-[13px] leading-relaxed text-neutral-700">
        <div>
          <dt className="font-semibold text-neutral-500">{t("store_label_contact")}</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{phoneLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-500">{t("store_label_address")}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-medium text-neutral-900">{addressLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-500">{t("store_label_payment")}</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{paymentLabel}</dd>
        </div>
        {orderSummaryLabel ? (
          <div>
            <dt className="font-semibold text-neutral-500">{t("store_checkout_confirm_order_summary")}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-medium text-neutral-900">{orderSummaryLabel}</dd>
          </div>
        ) : null}
        {requestLabel ? (
          <div>
            <dt className="font-semibold text-neutral-500">{t("store_request_optional_label")}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-medium text-neutral-900">{requestLabel}</dd>
          </div>
        ) : null}
      </dl>
    </StoreCommerceCartCenterPopup>
  );
}
