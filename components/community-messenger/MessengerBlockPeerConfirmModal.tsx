"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

type Props = {
  open: boolean;
  busy?: boolean;
  /** 차단할 상대 이름 — 있으면 「{이름}님을 차단할까요?」 */
  peerName?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MessengerBlockPeerConfirmModal({ open, busy = false, peerName, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const name = peerName?.trim();

  return (
    <DibayConfirmDialog
      open={open}
      title={name ? t("popup_q_block_named", { name }) : t("popup_q_block_user")}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("common_block")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmTone="destructive"
      busy={busy}
    />
  );
}
