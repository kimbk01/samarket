"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryReasonModal } from "./DeliveryReasonModal";

type Mode = "approve" | "reject";

/** Refund approve/reject modal (DeliveryReasonModal wrapper). */
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
  const { t } = useI18n();
  const approve = mode === "approve";
  return (
    <DeliveryReasonModal
      open={open}
      title={t(approve ? "admin_do_refund_modal_approve_title" : "admin_do_refund_modal_reject_title")}
      label={t(approve ? "admin_do_refund_modal_approve_label" : "admin_do_refund_modal_reject_label")}
      confirmLabel={t(approve ? "admin_do_common_approve" : "admin_do_common_reject")}
      required
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
