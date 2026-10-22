"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCheckoutConfirmHistoryClose } from "@/components/stores/cart/use-checkout-confirm-history-close";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import type { DibayOverlayAction } from "@/components/ui/dibay-overlay";
import { formatMoneyPhp } from "@/lib/utils/format";

/** 주문 접수 전 확인 — 가운데 팝업 */
export function StoreCheckoutSubmitConfirmDialog({
  open,
  phoneLabel,
  addressLabel,
  paymentLabel,
  orderSummaryLabel,
  requestLabel,
  giftUsedPhp = 0,
  giftForfeitedPhp = 0,
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
  /** CG-01 — 이 주문에 쓰는 상품권 금액·소멸 금액(1회 전액 소진). 0 이면 행 생략 */
  giftUsedPhp?: number;
  giftForfeitedPhp?: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  // Hardware back must CLOSE overlay on cart (parity with header goCartBack CLOSE).
  useCheckoutConfirmHistoryClose(open, onCancel, busy);

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
        {giftUsedPhp > 0 ? (
          <div data-checkout-confirm-gift="1">
            <dt className="font-semibold">{t("gift_u4_summary_gift_line")}</dt>
            <dd className="mt-0.5 font-medium text-[var(--overlay-text-primary)]">
              −{formatMoneyPhp(giftUsedPhp)}
            </dd>
            {giftForfeitedPhp > 0 ? (
              <dd className="mt-0.5 font-semibold text-sam-danger" data-checkout-confirm-gift-forfeit="1">
                {t("gift_u4_cart_forfeit", { amount: formatMoneyPhp(giftForfeitedPhp) })}
              </dd>
            ) : null}
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
