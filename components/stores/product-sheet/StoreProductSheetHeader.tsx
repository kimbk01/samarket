"use client";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/** 매장 상품 담기 시트 머리 — 팝업 SSOT T3: 핸들·제목 18/600·X 원 40 (시트 전용 · 페이지 사용처 없음) */
export function StoreProductSheetHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 flex-col border-b border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 pb-2.5 pt-3">
      <div className={`${OverlayUi.sheetHandle} !mb-2 !mt-0 shrink-0`} aria-hidden />
      <div className="relative flex min-h-[40px] w-full items-center justify-center">
        <h2
          id="store-add-sheet-title"
          className={`${OverlayUi.title} ${OverlayUi.titleSheet} line-clamp-1 px-10`}
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="dibay-overlay-icon-btn absolute -right-2 top-1/2 -translate-y-1/2"
          aria-label={t("common_close")}
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
