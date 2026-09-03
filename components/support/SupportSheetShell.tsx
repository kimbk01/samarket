"use client";

import type { ReactNode } from "react";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { DibayUsableAreaSheet } from "@/components/ui/dibay-overlay/DibayUsableAreaSheet";
import { DIBAY_USABLE_AREA_DEFAULT_HEIGHT_RATIO } from "@/lib/ui/dibay-usable-area-sheet-contract";

/** Presentation preference only — shared usable-area owns geometry. */
export const SUPPORT_SHEET_HEIGHT_RATIO = DIBAY_USABLE_AREA_DEFAULT_HEIGHT_RATIO;
const SUPPORT_SHEET_MAX_W_CLASS = "max-w-[560px]";

export type SupportSheetShellProps = {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  ariaLabel: string;
  children: ReactNode;
};

/**
 * Support presentation wiring — consumes shared DibayUsableAreaSheet only.
 * No Support VV / geometry module / inset-as-bounds.
 */
export function SupportSheetShell({
  open,
  onClose,
  dismissible = true,
  ariaLabel,
  children,
}: SupportSheetShellProps) {
  return (
    <DibayUsableAreaSheet
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      ariaLabel={ariaLabel}
      anchor="device-bottom"
      preferredHeightRatio={SUPPORT_SHEET_HEIGHT_RATIO}
      maxWidthClass={SUPPORT_SHEET_MAX_W_CLASS}
      showHandle={false}
      zIndexClass={MAIN_BOTTOM_NAV_SHEET_Z_CLASS}
    >
      <div
        data-support-sheet-shell="1"
        data-support-sheet-panel="1"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </div>
    </DibayUsableAreaSheet>
  );
}
