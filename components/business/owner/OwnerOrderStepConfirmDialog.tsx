"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-order-step-confirm-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t("common_close")}
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div className="relative z-[1] w-full max-w-sm rounded-lg border border-[#E8E8E8] bg-white p-4 shadow-xl">
        <h2 id="owner-order-step-confirm-title" className="text-[16px] font-bold text-[#262626]">
          {t("store_owner_step_confirm_title")}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#595959]">{message}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex min-h-11 flex-1 touch-manipulation select-none items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[14px] font-semibold text-[#595959] transition active:scale-[0.98] active:bg-[#F5F5F5] disabled:opacity-50"
          >
            {t("common_cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex min-h-11 flex-1 touch-manipulation select-none items-center justify-center rounded-md bg-[var(--biz-primary)] text-[14px] font-semibold text-white transition hover:bg-[var(--biz-primary-hover)] active:scale-[0.98] active:bg-[var(--biz-primary-active)] disabled:opacity-50"
          >
            {busy ? t("common_processing") : t("common_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
