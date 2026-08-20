"use client";

import { TradeCategoryWriteForm } from "@/components/write/trade/TradeCategoryWriteForm";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OVERLAY_Z_CLASS, OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type Props = {
  open: boolean;
  category: CategoryWithSettings;
  onClose: () => void;
};

/**
 * T3 — Admin WRITE preview using the real Trade write renderer.
 * Draft composition is already applied on `category.settings.field_composition`.
 * previewOnly prevents createPost.
 */
export function TradeMenuWritePreviewSheet({ open, category, onClose }: Props) {
  const { safeT } = useI18n();
  if (!open) return null;

  return (
    <DibayDialog
      open
      onClose={onClose}
      dismissible
      title={safeT("admin_menu_trade_preview_title", {
        fallbackKo: "글쓰기 미리보기",
        fallbackEn: "Write preview",
      })}
      description={safeT("admin_menu_trade_preview_desc", {
        fallbackKo: "실제 거래 등록 화면입니다. 미리보기에서는 게시물이 저장되지 않습니다.",
        fallbackEn: "Real trade write UI. Preview does not create a listing.",
      })}
      zIndexClass={OVERLAY_Z_CLASS.nested}
    >
      <div className="mt-2 max-h-[min(75vh,720px)] overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-app">
        <TradeCategoryWriteForm
          category={category}
          previewOnly
          suppressTier1Chrome
          onSuccess={() => {
            /* no-op — previewOnly blocks writes */
          }}
          onCancel={onClose}
        />
      </div>
      <div className={`${OverlayUi.actionsRow} pt-3`}>
        <DibayOverlayButton roleTone="secondary" type="button" onClick={onClose}>
          {safeT("common_cancel", { fallbackKo: "닫기", fallbackEn: "Close" })}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
