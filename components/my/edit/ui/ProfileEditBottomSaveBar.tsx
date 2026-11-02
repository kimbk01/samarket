"use client";

import {
  MY_STICKY_CTA_BAR_SURFACE_CLASS,
  MY_STICKY_CTA_PRIMARY_BUTTON_CLASS,
  MY_STICKY_CTA_ROW_CLASS,
  MY_STICKY_CTA_SECONDARY_BUTTON_CLASS,
} from "@/components/mypage/ds/MyStickyCta";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";
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
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 ${MY_STICKY_CTA_BAR_SURFACE_CLASS}`}
      style={{
        paddingBottom: `${effectiveBottomInset}px`,
        /** 가로모드 노치 쪽 — 고정 바는 셸 좌우 안전영역을 받지 못한다 */
        paddingLeft: "var(--safe-left, 0px)",
        paddingRight: "var(--safe-right, 0px)",
      }}
    >
      <div className={`pointer-events-auto ${MY_STICKY_CTA_ROW_CLASS}`}>
        <button
          type="button"
          onClick={onCancel}
          onPointerDown={(e) => triggerInteractionFeedback("light", e)}
          className={`${MY_STICKY_CTA_SECONDARY_BUTTON_CLASS} ${FORM_INTERACTIVE_PRESS_CLASS}`}
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
          className={`${MY_STICKY_CTA_PRIMARY_BUTTON_CLASS} ${FORM_INTERACTIVE_PRESS_CLASS}`}
        >
          {saving ? t("profile_edit_saving") : t("common_save")}
        </button>
      </div>
    </div>
  );
}
