"use client";

import type { CSSProperties, ReactNode } from "react";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  resolveSupportSheetGeometry,
  SUPPORT_SHEET_HEIGHT_RATIO,
} from "@/lib/support/support-sheet-geometry";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay/DibayOverlayRoot";

const SUPPORT_SHEET_MAX_W_CLASS = "max-w-[560px]";

export type SupportSheetShellProps = {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  ariaLabel: string;
  children: ReactNode;
};

/**
 * Sole Support modal geometry owner (HANDOFF + ACTIVE) — iPhone / iPad / Cap / Android.
 *
 * HEADER (shrink-0) + TIMELINE (flex-1) + COMPOSER (shrink-0).
 * Keyboard: size/lift into the visualViewport∩layout band (see support-sheet-geometry).
 * Never stage top=offsetTop (Cap double-count). Never height + paddingBottom keyboard together.
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
    keyboardOcclusionInset,
    safeBottom,
    visualViewportHeight,
    visualViewportOffsetTop,
    runtimeContext,
  } = useFormKeyboardViewport({ enabled: open });

  const layoutHeight = Math.max(0, Math.round(runtimeContext?.viewportHeight || 0));

  const geo = resolveSupportSheetGeometry({
    visualViewportHeight,
    visualViewportOffsetTop,
    layoutHeight,
    keyboardOpen,
    keyboardOcclusionInset,
    safeBottom,
    heightRatio: SUPPORT_SHEET_HEIGHT_RATIO,
  });

  // Layout-anchored overlay root (CSS fixed inset-0). Never pin stage via offsetTop.
  const stageStyle: CSSProperties | undefined = undefined;

  const panelStyle: CSSProperties = {
    ...(geo.bandKnown
      ? {
          height: geo.sheetHeightPx,
          maxHeight: geo.sheetHeightPx,
          minHeight: geo.sheetHeightPx,
        }
      : {
          height: "100dvh",
          maxHeight: "100dvh",
          minHeight: "100dvh",
        }),
    marginBottom: geo.sheetLiftPx > 0 ? geo.sheetLiftPx : undefined,
    paddingBottom: geo.paddingBottomPx > 0 ? geo.paddingBottomPx : undefined,
    // Keep enter translate only — never animate height/margin (Cap VV flicker).
    transition: "transform 300ms cubic-bezier(0.22, 0.9, 0.32, 1)",
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
        data-support-stage-top="0"
        data-support-apply-stage-band="0"
        data-support-applies-offset-top="0"
        data-support-sheet-lift={String(geo.sheetLiftPx)}
        data-support-effective-bottom-inset={String(effectiveBottomInset)}
        className={`${OverlayUi.sheetPanel} relative z-[1] mx-auto flex w-full ${SUPPORT_SHEET_MAX_W_CLASS} min-h-0 flex-col overflow-hidden`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </DibayOverlayRoot>
  );
}
