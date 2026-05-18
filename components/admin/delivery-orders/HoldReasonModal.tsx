"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryReasonModal } from "./DeliveryReasonModal";

/** Settlement hold reason (DeliveryReasonModal wrapper). */
export function HoldReasonModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useI18n();
  return (
    <DeliveryReasonModal
      open={open}
      title={t("admin_do_hold_modal_title")}
      label={t("admin_do_hold_modal_label")}
      confirmLabel={t("admin_do_hold_modal_confirm")}
      required
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
