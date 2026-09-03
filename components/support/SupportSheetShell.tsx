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
 * Sole Support modal geometry owner (HANDOFF + ACTIVE).
 * VV height shrinks the band; stage top stays 0 so Cap focus pan is not double-counted.
 * Keyboard changes usable height — never relocates the whole sheet via offsetTop.
 */
export function SupportSheetShell({
  open,
  onClose,
  dismissible = true,
  ariaLabel,
  children,
}: SupportSheetShellProps) {
  const { effectiveBottomInset, keyboardOpen, visualViewportHeight, visualViewportOffsetTop } =
    useFormKeyboardViewport({ enabled: open });

  const geo = resolveSupportSheetGeometry({
    visualViewportHeight,
    visualViewportOffsetTop,
    layoutHeight: 0,
    heightRatio: SUPPORT_SHEET_HEIGHT_RATIO,
  });

  const stageStyle: CSSProperties | undefined = geo.bandKnown
    ? {
        top: geo.stageTopPx,
        height: geo.stageHeightPx,
        left: 0,
        right: 0,
        bottom: "auto",
      }
    : undefined;

  const panelStyle: CSSProperties = {
    paddingBottom: Math.max(0, Math.round(effectiveBottomInset)),
    ...(geo.bandKnown
      ? {
          height: geo.sheetHeightPx,
          maxHeight: geo.sheetHeightPx,
          minHeight: geo.sheetHeightPx,
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
        data-support-stage-top={String(geo.stageTopPx)}
        data-support-applies-offset-top={geo.appliesOffsetTopToStage ? "1" : "0"}
        className={`${OverlayUi.sheetPanel} relative z-[1] mx-auto flex w-full ${SUPPORT_SHEET_MAX_W_CLASS} min-h-0 flex-col overflow-hidden`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </DibayOverlayRoot>
  );
}
