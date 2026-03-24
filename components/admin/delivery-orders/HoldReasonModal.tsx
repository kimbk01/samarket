"use client";

import { DeliveryReasonModal } from "./DeliveryReasonModal";

/** 정산 보류 사유 입력 (DeliveryReasonModal 래퍼) */
export function HoldReasonModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  return (
    <DeliveryReasonModal
      open={open}
      title="정산 보류"
      label="보류 사유 (필수)"
      confirmLabel="보류"
      required
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
