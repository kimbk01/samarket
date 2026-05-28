"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";

export const PHILIFE_WRITE_FORM_ID = "philife-neighborhood-write-form";

type PhilifeWriteActionFooterProps = {
  busy: boolean;
  submitDisabled: boolean;
  onCancel: () => void;
  error?: string | null;
};

/**
 * 거래 `SubmitButton` 과 동일 — 뷰포트 하단 고정 + visualViewport 키보드 inset.
 * (시트·풀페이지 공통; 메인 BottomNav 는 시트 열릴 때 셸에서 숨김)
 */
export function PhilifeWriteActionFooter({
  busy,
  submitDisabled,
  onCancel,
  error,
}: PhilifeWriteActionFooterProps) {
  const { t } = useI18n();
  const keyboardInset = useMobileKeyboardInset();

  return (
    <div
      role="contentinfo"
      aria-label={t("philife_write_footer_aria")}
      className="fixed bottom-0 left-0 right-0 z-[55] border-t border-[#e4e6eb] bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
      style={{
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
      }}
    >
      {error ? (
        <div
          className="max-h-20 overflow-y-auto border-b border-red-100 bg-red-50 px-3 py-1.5 sam-text-xxs leading-snug text-red-800"
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
          className="min-h-[44px] shrink-0 rounded-ui-rect border border-[#ccd0d5] bg-white px-4 py-2.5 sam-text-body font-medium text-[#050505] disabled:opacity-50"
        >
          {t("philife_write_sheet_cancel")}
        </button>
        <button
          type="submit"
          form={PHILIFE_WRITE_FORM_ID}
          disabled={busy || submitDisabled}
          className="min-h-[44px] flex-1 rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {busy ? t("philife_write_submitting") : t("philife_write_submit")}
        </button>
      </div>
    </div>
  );
}
