"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";

export function SoldOutOverlay() {
  const { t } = useI18n();
  const s = DibayMenuBoard.badge.soldOut;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
      <span
        className="font-bold"
        style={{
          backgroundColor: s.bg,
          color: s.fg,
          borderRadius: s.radiusPx,
          fontSize: s.fontSizePx,
          fontWeight: s.fontWeight,
          padding: s.padding,
        }}
      >
        {t("store_sold_out")}
      </span>
    </div>
  );
}
