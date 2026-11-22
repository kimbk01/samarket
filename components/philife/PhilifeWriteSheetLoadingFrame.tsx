"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySpinner } from "@/components/ui/DibaySpinner";
import { usePhilifeWriteSheetOptional } from "@/contexts/PhilifeWriteSheetContext";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";

/**
 * 필라이프 글쓰기 시트 코드가 오는 동안 — 거래 글쓰기(`TradeWriteSheetLoadingFrame`, D1 Owner 2026-11-03)와 같은 방식.
 * 예전에는 `dynamic(ssr:false)` 에 loading 이 없어 「글쓰기」를 누른 뒤 코드가 올 때까지 아무것도 안 보였다
 * (`docs/audit/loading-spinner-network-notice-design-2026-11-22.md` W4). 열림 상태가 아니면 그리지 않는다.
 */
export function PhilifeWriteSheetLoadingFrame() {
  const { t } = useI18n();
  const sheet = usePhilifeWriteSheetOptional();
  useRegisterOpenOverlay(Boolean(sheet?.isOpen));
  if (!sheet?.isOpen) return null;
  return (
    <div
      className={`fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS} flex flex-col bg-[color:var(--overlay-surface)] pt-[var(--safe-top)]`}
      role="dialog"
      aria-modal
      aria-label={t("philife_write_composer_title")}
      aria-busy="true"
      data-philife-write-sheet-loading="1"
    >
      <div className="relative shrink-0 border-b border-[color:var(--overlay-border)] px-3 py-2.5 pr-11">
        <h2 className="dibay-overlay-title dibay-overlay-title--sheet">{t("philife_write_composer_title")}</h2>
        <button
          type="button"
          onClick={sheet.close}
          className="dibay-overlay-btn dibay-overlay-btn--text absolute right-2 top-1/2 !min-h-9 !w-9 !flex-none !-translate-y-1/2 !p-0"
          aria-label={t("common_close")}
        >
          <span className="text-[22px] font-light leading-none" aria-hidden>
            ×
          </span>
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <DibaySpinner size="lg" label={t("common_loading")} />
      </div>
    </div>
  );
}
