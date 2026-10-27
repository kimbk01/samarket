"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

type Props = {
  open: boolean;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * iOS Safari 등에서 `window.confirm`이 비동기/중첩 UI와 맞물려 실패하는 경우를 피하기 위한 인앱 확인창.
 */
export function NotificationDeleteConfirmDialog({
  open,
  message,
  cancelLabel,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  return (
    <DibayConfirmDialog
      open={open}
      title={message || "Delete"}
      // U-09 — 알림 삭제가 업무 데이터를 지우지 않음을 확인창에서 안내
      description={t("notif_delete_keeps_records")}
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onConfirm={() => {
        if (!busy) onConfirm();
      }}
      confirmTone="destructive"
      busy={busy}
    />
  );
}
