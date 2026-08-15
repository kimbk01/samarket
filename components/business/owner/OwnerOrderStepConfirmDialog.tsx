"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

/** 주문 카드·상세 스테퍼 — 단계 전환 확인 */
export function OwnerOrderStepConfirmDialog({
  open,
  busy,
  message,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <DibayConfirmDialog
      open={open}
      title={t("store_owner_step_confirm_title")}
      description={message}
      cancelLabel={t("common_cancel")}
      confirmLabel={busy ? t("common_processing") : t("common_confirm")}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onConfirm={onConfirm}
      confirmTone="primary"
      busy={busy}
    />
  );
}
