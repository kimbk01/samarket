"use client";

import type { ReactNode } from "react";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OVERLAY_SHEET_ABOVE_NAV, OverlayUi } from "@/lib/ui/dibay-overlay-contract";

export function StoreProductSheetShell({
  children,
  onBackdropClose,
}: {
  children: ReactNode;
  onBackdropClose: () => void;
}) {
  return (
    <DibayOverlayRoot
      open
      onClose={onBackdropClose}
      dismissible
      placement="sheet"
      zRole="sheet"
      labelledBy="store-add-sheet-title"
      stageClassName={`items-end ${OVERLAY_SHEET_ABOVE_NAV.bottomClass}`}
    >
      <div
        className={`delivery-ui ${OverlayUi.sheetPanel} ${OVERLAY_SHEET_ABOVE_NAV.maxHClass} pointer-events-auto relative z-[1] mx-auto flex w-full min-w-0 flex-col overflow-hidden !p-0 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
        data-dibay-overlay="store-product-sheet"
        /* UI-08 — body 포털이라 배달 셸 밖: 셸과 같은 라이트 고정 스코프 (`delivery-tokens.css`) */
        data-delivery-consumer-surface=""
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </DibayOverlayRoot>
  );
}
