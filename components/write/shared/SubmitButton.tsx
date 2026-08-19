"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

/** `TradeWriteForm` `<form id>` — footer submit may reference via `form` attr when split from form tree */
export const TRADE_WRITE_FORM_ID = "samarket-trade-write-form";

interface SubmitButtonProps {
  /** Parent `<form id>` when submit button is not a direct form descendant */
  formId?: string;
  cancelLabel?: string;
  label?: string;
  submitting?: boolean;
  /** 제출 중 버튼 문구 (기본: 등록 중…) */
  submittingLabel?: string;
  onCancel?: () => void;
  disabled?: boolean;
}

/**
 * Trade write CTA — 취소 + 작성 완료(또는 수정 완료).
 * Form keyboard SSOT `effectiveBottomInset` only (no CSS safe-bottom double count).
 */
export function SubmitButton({
  formId,
  cancelLabel,
  label,
  submitting = false,
  submittingLabel,
  onCancel,
  disabled = false,
}: SubmitButtonProps) {
  const { t } = useI18n();
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport();
  const resolvedCancelLabel = cancelLabel ?? t("trade_write_cancel");
  const resolvedLabel = label ?? t("trade_write_submit");
  const resolvedSubmittingLabel = submittingLabel ?? t("trade_write_submitting");
  const submitLocked = disabled || submitting;

  return (
    <div
      role="contentinfo"
      aria-label={t("trade_write_footer_aria")}
      data-form-keyboard-footer="1"
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-sam-border bg-sam-surface shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: `${effectiveBottomInset}px` }}
    >
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} flex min-w-0 gap-2 py-3`}>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            onPointerDown={(e) => {
              if (!submitting) triggerInteractionFeedback("light", e);
            }}
            className={`min-h-[44px] shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 sam-text-body font-semibold text-sam-fg disabled:opacity-50 ${FORM_INTERACTIVE_PRESS_CLASS}`}
          >
            {resolvedCancelLabel}
          </button>
        ) : null}
        <button
          type="submit"
          form={formId}
          disabled={submitLocked}
          onPointerDown={(e) => {
            if (!submitLocked) triggerInteractionFeedback("light", e);
          }}
          className={`min-h-[44px] flex-1 rounded-ui-rect bg-signature py-2.5 sam-text-body font-semibold text-white disabled:opacity-50 ${FORM_INTERACTIVE_PRESS_CLASS}`}
        >
          {submitting ? resolvedSubmittingLabel : resolvedLabel}
        </button>
      </div>
    </div>
  );
}
