"use client";

import type { CSSProperties, ReactNode } from "react";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay/DibayOverlayRoot";

const SUPPORT_SHEET_HEIGHT_RATIO = 0.8;
const SUPPORT_SHEET_MAX_W_CLASS = "max-w-[560px]";

export type SupportSheetShellProps = {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  ariaLabel: string;
  children: ReactNode;
};

/**
 * Sole Support modal geometry owner.
 * Proven DibayOverlayRoot portal + VV stage + 80% bottom sheet + effectiveBottomInset once.
 * Keyboard changes the band — never switches to full-band fill.
 */
export function SupportSheetShell({
  open,
  onClose,
  dismissible = true,
  ariaLabel,
  children,
}: SupportSheetShellProps) {
  const {
    effectiveBottomInset,
    keyboardOpen,
    visualViewportHeight,
    visualViewportOffsetTop,
  } = useFormKeyboardViewport({ enabled: open });

  const bandKnown = visualViewportHeight > 0;
  const bandHeight = bandKnown ? Math.round(visualViewportHeight) : 0;
  const bandTop = bandKnown ? Math.max(0, Math.round(visualViewportOffsetTop)) : 0;
  const sheetHeightPx = bandKnown
    ? Math.max(1, Math.min(Math.round(bandHeight * SUPPORT_SHEET_HEIGHT_RATIO), bandHeight))
    : null;

  const stageStyle: CSSProperties | undefined = bandKnown
    ? {
        top: bandTop,
        height: bandHeight,
        left: 0,
        right: 0,
        bottom: "auto",
      }
    : undefined;

  const panelStyle: CSSProperties = {
    paddingBottom: Math.max(0, Math.round(effectiveBottomInset)),
    ...(sheetHeightPx != null
      ? {
          height: sheetHeightPx,
          maxHeight: sheetHeightPx,
          minHeight: sheetHeightPx,
        }
      : {
          height: `${Math.round(SUPPORT_SHEET_HEIGHT_RATIO * 100)}dvh`,
          maxHeight: `${Math.round(SUPPORT_SHEET_HEIGHT_RATIO * 100)}dvh`,
          minHeight: `${Math.round(SUPPORT_SHEET_HEIGHT_RATIO * 100)}dvh`,
        }),
  };

  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      placement="sheet"
      zRole="sheet"
      zIndexClass={MAIN_BOTTOM_NAV_SHEET_Z_CLASS}
      sheetAnchor="device-bottom"
      stageClassName="items-end justify-center"
      stageStyle={stageStyle}
      ariaLabel={ariaLabel}
      lockScroll
    >
      <div
        data-support-sheet-shell="1"
        data-form-keyboard-open={keyboardOpen ? "true" : "false"}
        data-sheet-height-ratio={String(SUPPORT_SHEET_HEIGHT_RATIO)}
        data-form-keyboard-surface="1"
        data-support-sheet-panel="1"
        className={`${OverlayUi.sheetPanel} relative z-[1] mx-auto flex w-full ${SUPPORT_SHEET_MAX_W_CLASS} min-h-0 flex-col overflow-hidden`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </DibayOverlayRoot>
  );
}
