"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_GHOST_BTN_CLASS,
  MYPAGE_HOME_OUTLINE_BTN_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

type LogoutConfirmModalProps = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  title?: string;
  body?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 설정 등에서 사용자가 로그아웃을 눌렀을 때만 표시되는 확인 모달.
 */
export function LogoutConfirmModal({
  open,
  submitting,
  error,
  title,
  body,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
      aria-describedby="logout-confirm-desc"
    >
      <div className={`w-full max-w-sm p-5 ${MYPAGE_HOME_CARD_CLASS}`}>
        <p id="logout-confirm-title" className="text-[17px] font-bold leading-tight text-[#1E3932]">
          {title ?? t("auth_logout_confirm_title")}
        </p>
        <p id="logout-confirm-desc" className="mt-2 text-[14px] leading-snug text-[#6F4E37]">
          {body ?? t("auth_logout_confirm_body")}
        </p>
        {error ? <p className="mt-3 text-[13px] text-[#C0392B]">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={`${MYPAGE_HOME_OUTLINE_BTN_CLASS} disabled:opacity-50`}
          >
            {t("common_cancel")}
          </button>
          <button
            type="button"
            data-testid="auth_logout_submit"
            onClick={() => void onConfirm()}
            disabled={submitting}
            className={`${MYPAGE_HOME_GHOST_BTN_CLASS} font-semibold text-[#C0392B] hover:text-[#C0392B] disabled:opacity-50`}
          >
            {submitting ? t("auth_logout_submitting") : t("auth_logout_submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
