"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** 통화 기록 삭제 확인 — DIBAY Confirm SSOT [취소 | 삭제]. */
export function MessengerCallLogDeleteConfirmDialog({ open, busy = false, onCancel, onConfirm }: Props) {
  const { t, safeT } = useI18n();
  const body = safeT("cm_ui_confirm_delete_call_log", {
    fallbackKo: "이 통화 기록을 삭제할까요?",
    fallbackEn: "Delete this call log?",
  });

  return (
    <DibayConfirmDialog
      open={open}
      title={t("common_delete")}
      description={body}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("common_delete")}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onConfirm={onConfirm}
      confirmTone="destructive"
      busy={busy}
    />
  );
}
