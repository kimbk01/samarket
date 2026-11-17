"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";

/**
 * D1 (Owner 2026-11-03): 「판매하기」를 누른 순간 글쓰기 시트 코드가 아직 안 왔으면 2~3초 동안 아무것도 안 보이던 결함 —
 * 코드가 오는 동안 같은 자리·같은 모양의 시트 틀(제목·닫기·불러오는 중)을 바로 보여 준다. 열림 상태가 아니면 그리지 않는다.
 */
export function TradeWriteSheetLoadingFrame() {
  const { t } = useI18n();
  const sheet = useTradeWriteSheetOptional();
  useRegisterOpenOverlay(Boolean(sheet?.isOpen));
  if (!sheet?.isOpen) return null;
  return (
    <div
      className={`fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS} flex flex-col bg-[color:var(--overlay-surface)] pt-[var(--safe-top)]`}
      role="dialog"
      aria-modal
      aria-label={t("ui_write_trade_sheet_title")}
      aria-busy="true"
      data-trade-write-sheet-loading="1"
    >
      <div className="relative shrink-0 border-b border-[color:var(--overlay-border)] px-3 py-2.5 pr-11">
        <h2 className="dibay-overlay-title dibay-overlay-title--sheet">{t("ui_write_trade_sheet_title")}</h2>
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
        <span className="dibay-overlay-btn__spinner" aria-hidden />
        <span className="sr-only">{t("common_loading")}</span>
      </div>
    </div>
  );
}
