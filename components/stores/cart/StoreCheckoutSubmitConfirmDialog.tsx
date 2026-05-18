"use client";

import { DeliveryOrderConfirmModal } from "@/components/delivery/ui/DeliveryOrderConfirmModal";

/** 주문 접수 전 확인 — 전용 주문확인 모달 */
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
  orderSummaryLabel: string;
  requestLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DeliveryOrderConfirmModal
      open={open}
      phoneLabel={phoneLabel}
      addressLabel={addressLabel}
      paymentLabel={paymentLabel}
      orderSummaryLabel={orderSummaryLabel}
      requestLabel={requestLabel}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
