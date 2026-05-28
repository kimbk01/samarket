"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";

interface SubmitButtonProps {
  label?: string;
  submitting?: boolean;
  /** 제출 중 버튼 문구 (기본: 등록 중…) */
  submittingLabel?: string;
  onCancel?: () => void;
  disabled?: boolean;
}

export function SubmitButton({
  label,
  submitting = false,
  submittingLabel,
  onCancel,
  disabled = false,
}: SubmitButtonProps) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t("trade_write_submit_default");
  const resolvedSubmittingLabel = submittingLabel ?? t("trade_write_submitting_default");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-sam-border bg-sam-surface pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} flex min-w-0 gap-2 py-3`}>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-ui-rect border border-sam-border px-4 py-2.5 sam-text-body text-sam-muted"
          >
            {t("common_cancel")}
          </button>
        ) : null}
        <button
          type="submit"
          disabled={disabled || submitting}
          className="flex-1 rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {submitting ? resolvedSubmittingLabel : resolvedLabel}
        </button>
      </div>
    </div>
  );
}
