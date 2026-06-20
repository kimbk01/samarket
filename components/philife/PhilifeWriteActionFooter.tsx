"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { PHILIFE_WRITE_SHEET_FOOTER_PB_CLASS } from "@/lib/ui/philife-write-sheet-keyboard-layout";
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";

export const PHILIFE_WRITE_FORM_ID = "philife-neighborhood-write-form";

export type PhilifeWriteActionFooterLayout = "sheet" | "page";

type PhilifeWriteActionFooterProps = {
  busy: boolean;
  submitDisabled: boolean;
  onCancel: () => void;
  error?: string | null;
  /**
   * `sheet`: `/philife` 시트 flex footer — `usePhilifeWriteSheetFooterPadding` (keyboard open 시 safe-bottom 제거).
   * `page`: `/philife/write` 풀페이지 — viewport 하단 고정 + keyboard inset.
   */
  layout?: PhilifeWriteActionFooterLayout;
  /** 시트 헤더 × 로 닫을 때 하단 취소 버튼 숨김 */
  showCancel?: boolean;
};

/**
 * Philife 글쓰기 하단 취소·등록 바.
 * - 시트: flex `shrink-0` (폼 column 안)
 * - 풀페이지: `fixed` + `useMobileKeyboardInset`
 */
export function PhilifeWriteActionFooter({
  busy,
  submitDisabled,
  onCancel,
  error,
  layout = "page",
  showCancel = true,
}: PhilifeWriteActionFooterProps) {
  const { t } = useI18n();
  const keyboardInset = useMobileKeyboardInset({ enabled: layout === "page" });
  const isSheet = layout === "sheet";

  return (
    <div
      role="contentinfo"
      aria-label={t("philife_write_footer_aria")}
      className={
        isSheet
          ? `shrink-0 border-t border-[#e4e6eb] bg-white ${PHILIFE_WRITE_SHEET_FOOTER_PB_CLASS} shadow-[0_-2px_8px_rgba(0,0,0,0.06)]`
          : "fixed bottom-0 left-0 right-0 z-[55] border-t border-[#e4e6eb] bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
      }
      style={
        isSheet
          ? undefined
          : {
              paddingBottom: `calc(var(--safe-bottom) + ${keyboardInset}px)`,
            }
      }
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
        {showCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] shrink-0 rounded-ui-rect border border-[#ccd0d5] bg-white px-4 py-2.5 sam-text-body font-medium text-[#050505] disabled:opacity-50"
          >
            {t("philife_write_sheet_cancel")}
          </button>
        ) : null}
        <button
          type="submit"
          form={PHILIFE_WRITE_FORM_ID}
          disabled={busy || submitDisabled}
          className={`min-h-[44px] rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white disabled:opacity-50 ${showCancel ? "flex-1" : "w-full"}`}
        >
          {busy ? t("philife_write_submitting") : t("philife_write_submit")}
        </button>
      </div>
    </div>
  );
}
