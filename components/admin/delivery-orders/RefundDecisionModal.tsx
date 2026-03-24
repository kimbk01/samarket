"use client";

import { DeliveryReasonModal } from "./DeliveryReasonModal";

type Mode = "approve" | "reject";

/** 환불 승인/거절 전용 모달 (DeliveryReasonModal 래퍼, Supabase 연동 시 이 컴포넌트만 교체하기 쉬움) */
export function RefundDecisionModal({
  open,
  mode,
  onClose,
  onConfirm,
}: {
  open: boolean;
  mode: Mode;
  onClose: () => void;
  onConfirm: (memo: string) => void;
}) {
  const approve = mode === "approve";
  return (
    <DeliveryReasonModal
      open={open}
      title={approve ? "환불 승인" : "환불 거절"}
      label={approve ? "승인 메모 (필수)" : "거절 사유 (필수)"}
      confirmLabel={approve ? "환불 승인" : "거절"}
      required
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
