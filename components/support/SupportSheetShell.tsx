"use client";

import type { ReactNode } from "react";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";

/**
 * Presentation ratio only (~80% usable screen so business context stays visible).
 * Not a keyboard / visualViewport equation.
 */
export const SUPPORT_SHEET_HEIGHT_RATIO = 0.8;
const SUPPORT_SHEET_MAX_W_CLASS = "max-w-[560px]";

export type SupportSheetShellProps = {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  ariaLabel: string;
  children: ReactNode;
};

/**
 * Thin Support presentation wiring after CUT1 FIT GATE = PASS.
 * Reuses DibayBottomSheet unchanged — no Support viewport/keyboard geometry module.
 * Shared bottom inset only: Form `effectiveBottomInset` → `contentPaddingBottomPx`.
 */
export function SupportSheetShell({
  open,
  onClose,
  dismissible = true,
  ariaLabel,
  children,
}: SupportSheetShellProps) {
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport({ enabled: open });

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      ariaLabel={ariaLabel}
      anchor="device-bottom"
      heightRatio={SUPPORT_SHEET_HEIGHT_RATIO}
      showHandle={false}
      zIndexClass={MAIN_BOTTOM_NAV_SHEET_Z_CLASS}
      contentPaddingBottomPx={Math.max(0, Math.round(effectiveBottomInset))}
      panelClassName={`mx-auto w-full ${SUPPORT_SHEET_MAX_W_CLASS}`}
    >
      <div
        data-support-sheet-shell="1"
        data-support-sheet-panel="1"
        data-form-keyboard-open={keyboardOpen ? "true" : "false"}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </div>
    </DibayBottomSheet>
  );
}
