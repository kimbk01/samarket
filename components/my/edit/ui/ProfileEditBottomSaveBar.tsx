"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";
import { PROFILE_EDIT_PRIMARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

export function ProfileEditBottomSaveBar({
  formId,
  saving,
  onCancel,
}: {
  formId: string;
  backHref?: string;
  saving: boolean;
  /** 취소 — dirty 가드·setup defer 등 상위에서 처리 */
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport();

  return (
    <div
      data-form-keyboard-footer="1"
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-[#00704A]/12 bg-[#F2F0EB]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[#F2F0EB]/88"
      style={{
        paddingBottom: `${effectiveBottomInset}px`,
      }}
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-[768px] gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          onPointerDown={(e) => triggerInteractionFeedback("light", e)}
          className={`flex flex-1 items-center justify-center rounded-ui-rect border border-[#00704A]/25 bg-white py-3 text-[15px] font-semibold text-[#1E3932] ${FORM_INTERACTIVE_PRESS_CLASS}`}
        >
          {t("common_cancel")}
        </button>
        <button
          type="submit"
          form={formId}
          disabled={saving}
          onPointerDown={(e) => {
            if (!saving) triggerInteractionFeedback("light", e);
          }}
          className={`${PROFILE_EDIT_PRIMARY_BTN_CLASS} flex-[1.2] py-3 text-[15px] ${FORM_INTERACTIVE_PRESS_CLASS}`}
        >
          {saving ? t("profile_edit_saving") : t("common_save")}
        </button>
      </div>
    </div>
  );
}
