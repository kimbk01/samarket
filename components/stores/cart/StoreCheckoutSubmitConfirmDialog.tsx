"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import type { DibayOverlayAction } from "@/components/ui/dibay-overlay";
import { formatStoreCheckoutPaymentBreakdownLine } from "@/lib/stores/store-checkout-confirm-labels";
import type { CheckoutPaymentBreakdownLine } from "@/lib/stores/store-coupon-product-view";

/** 주문 접수 전 확인 — 가운데 팝업 */
export function StoreCheckoutSubmitConfirmDialog({
  open,
  phoneLabel,
  addressLabel,
  paymentLabel,
  orderSummaryLabel,
  paymentBreakdownLines,
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
  paymentBreakdownLines?: CheckoutPaymentBreakdownLine[];
  requestLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  const actions: DibayOverlayAction[] = [
    {
      key: "cancel",
      label: t("common_cancel"),
      roleTone: "secondary",
      onClick: onCancel,
      disabled: busy,
    },
    {
      key: "confirm",
      label: busy ? t("store_checkout_submitting") : t("store_checkout_submit"),
      roleTone: "primary",
      onClick: onConfirm,
      disabled: busy,
    },
  ];

  return (
    <DibayDialog
      open={open}
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      title={t("store_checkout_confirm_title")}
      actions={actions}
      actionsLayout="row"
    >
      <dl className="mt-3 space-y-2.5 text-left text-[13px] leading-relaxed text-[var(--overlay-text-secondary)]">
        <div>
          <dt className="font-semibold">{t("store_label_contact")}</dt>
          <dd className="mt-0.5 font-medium text-[var(--overlay-text-primary)]">{phoneLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("store_label_address")}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-medium text-[var(--overlay-text-primary)]">
            {addressLabel}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("store_label_payment")}</dt>
          <dd className="mt-0.5 font-medium text-[var(--overlay-text-primary)]">{paymentLabel}</dd>
        </div>
        {orderSummaryLabel ? (
          <div>
            <dt className="font-semibold">{t("store_checkout_confirm_order_summary")}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-medium text-[var(--overlay-text-primary)]">
              {orderSummaryLabel}
            </dd>
          </div>
        ) : null}
        {paymentBreakdownLines && paymentBreakdownLines.length > 0 ? (
          <div>
            <dt className="font-semibold">{t("store_coupon_checkout_confirm_breakdown")}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-medium text-[var(--overlay-text-primary)]">
              {paymentBreakdownLines
                .map((line) => formatStoreCheckoutPaymentBreakdownLine(line, t(line.labelKey)))
                .join("\n")}
            </dd>
          </div>
        ) : null}
        {requestLabel ? (
          <div>
            <dt className="font-semibold">{t("store_request_optional_label")}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-medium text-[var(--overlay-text-primary)]">
              {requestLabel}
            </dd>
          </div>
        ) : null}
      </dl>
    </DibayDialog>
  );
}
