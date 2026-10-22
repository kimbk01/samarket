"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

export const PHILIFE_WRITE_FORM_ID = "philife-neighborhood-write-form";

type PhilifeWriteActionFooterProps = {
  busy: boolean;
  submitDisabled: boolean;
  onCancel: () => void;
  error?: string | null;
  /** Idle submit label — edit mode uses common_save */
  submitIdleLabel?: string;
};

/**
 * Form CTA — flex footer (not fixed) so transform sheet containing-block cannot
 * fight window visualViewport. Bottom padding = Form SSOT `effectiveBottomInset` only.
 */
export function PhilifeWriteActionFooter({
  busy,
  submitDisabled,
  onCancel,
  error,
  submitIdleLabel,
}: PhilifeWriteActionFooterProps) {
  const { t } = useI18n();
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport();

  return (
    <div
      role="contentinfo"
      aria-label={t("philife_write_footer_aria")}
      data-form-keyboard-footer="1"
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      className="shrink-0 border-t border-sam-border-soft bg-sam-surface shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
      style={{
        paddingBottom: `${effectiveBottomInset}px`,
      }}
    >
      {error ? (
        <div
          className="max-h-20 overflow-y-auto border-b border-sam-border-soft bg-sam-danger-soft px-4 py-2 text-[13px] font-medium leading-snug text-sam-danger"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} flex min-w-0 gap-2 py-3`}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          onPointerDown={(e) => {
            if (!busy) triggerInteractionFeedback("light", e);
          }}
          className={`${Sam.btn.cancelCombo} min-h-12 shrink-0 px-5 ${FORM_INTERACTIVE_PRESS_CLASS}`}
        >
          {t("philife_write_sheet_cancel")}
        </button>
        <button
          type="submit"
          form={PHILIFE_WRITE_FORM_ID}
          disabled={busy || submitDisabled}
          onPointerDown={(e) => {
            if (!(busy || submitDisabled)) triggerInteractionFeedback("light", e);
          }}
          className={`${Sam.btn.primaryCombo} min-h-12 flex-1 font-semibold ${FORM_INTERACTIVE_PRESS_CLASS}`}
        >
          {busy ? t("philife_write_submitting") : submitIdleLabel || t("philife_write_submit")}
        </button>
      </div>
    </div>
  );
}
