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
      title={t("cm_social_block_confirm_title")}
      description={t("cm_social_block_confirm_body")}
      cancelLabel={t("cm_social_dismiss")}
      confirmLabel={t("cm_social_block")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmTone="destructive"
      busy={busy}
    />
  );
}
