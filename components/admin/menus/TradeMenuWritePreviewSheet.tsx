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
      title={safeT("admin_menu_trade_preview_title")}
      description={safeT("admin_menu_trade_preview_desc")}
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
          {safeT("common_cancel")}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
