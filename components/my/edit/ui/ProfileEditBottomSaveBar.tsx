"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PROFILE_EDIT_PRIMARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";

export function ProfileEditBottomSaveBar({
  formId,
  backHref,
  saving,
  onCancel,
}: {
  formId: string;
  backHref: string;
  saving: boolean;
  /** setup=1 등 — Link 대신 버튼(게이트 defer·명시 이동) */
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const keyboardInset = useMobileKeyboardInset();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-[#00704A]/12 bg-[#F2F0EB]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[#F2F0EB]/88"
      style={{
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
      }}
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-[768px] gap-2 px-4 py-3">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center rounded-ui-rect border border-[#00704A]/25 bg-white py-3 text-[15px] font-semibold text-[#1E3932] active:bg-[#E8F3EE]"
          >
            {t("common_cancel")}
          </button>
        ) : (
          <Link
            href={backHref}
            className="flex flex-1 items-center justify-center rounded-ui-rect border border-[#00704A]/25 bg-white py-3 text-[15px] font-semibold text-[#1E3932] active:bg-[#E8F3EE]"
          >
            {t("common_cancel")}
          </Link>
        )}
        <button
          type="submit"
          form={formId}
          disabled={saving}
          className={`${PROFILE_EDIT_PRIMARY_BTN_CLASS} flex-[1.2] py-3 text-[15px]`}
        >
          {saving ? t("profile_edit_saving") : t("common_save")}
        </button>
      </div>
    </div>
  );
}
