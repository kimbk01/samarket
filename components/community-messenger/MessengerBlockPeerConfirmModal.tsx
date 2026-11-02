"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MessengerBlockPeerConfirmModal({ open, busy = false, onCancel, onConfirm }: Props) {
  const { t } = useI18n();

  return (
    <DibayConfirmDialog
      open={open}
      title={t("popup_q_block_user")}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("common_block")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmTone="destructive"
      busy={busy}
    />
  );
}
