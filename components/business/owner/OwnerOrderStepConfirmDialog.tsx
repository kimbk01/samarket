"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

/** 주문 카드·상세 스테퍼 — 단계 전환 확인 */
export function OwnerOrderStepConfirmDialog({
  open,
  busy,
  message,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  message: string;
  /** IA-23 — PATCH 실패 사유 (다이얼로그 내부 오류 띠) */
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <DibayConfirmDialog
      open={open}
      title={t("store_owner_step_confirm_title")}
      description={
        errorMessage ? (
          <>
            {message}
            <span
              role="alert"
              data-owner-step-confirm-error="1"
              className="mt-2 block rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-body-secondary text-sam-danger"
            >
              {errorMessage}
            </span>
          </>
        ) : (
          message
        )
      }
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
