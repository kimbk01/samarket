"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  OVERLAY_SHEET_ABOVE_NAV,
  OverlayUi,
  type DibayBottomSheetAnchor,
} from "@/lib/ui/dibay-overlay-contract";
import { DibayOverlayRoot, useOverlayTitleIds } from "./DibayOverlayRoot";

export type DibayBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** above-bottom-nav (default on nav routes) | device-bottom */
  anchor?: DibayBottomSheetAnchor;
  showHandle?: boolean;
  /** When false, backdrop / Escape do not close (caller X may still call onClose). */
  dismissible?: boolean;
  /**
   * Fixed sheet height as a fraction of dvh (e.g. 0.8 = ~80% usable viewport).
   * When set, overrides default max-height caps (Support Sheet contract).
   */
  heightRatio?: number;
  /**
   * Absolute panel height in CSS px (keyboard-visible band).
   * When set, wins over heightRatio — avoids 80dvh + keyboard padding double push.
   */
  heightPx?: number | null;
  children: ReactNode;
  footer?: ReactNode;
  zIndexClass?: string;
  ariaLabel?: string;
  panelClassName?: string;
  /** Extra bottom padding inside panel (e.g. safe area). Do not pass keyboard occlusion when heightPx already fits the visual band. */
  contentPaddingBottomPx?: number;
  /** Forwarded to overlay root — pin sheet stage to visualViewport while keyboard open. */
  stageStyle?: CSSProperties;
};

/**
 * Bottom sheet — default ABOVE_BOTTOM_NAV using MAIN_BOTTOM_NAV_SHEET_* authority.
 */
export function DibayBottomSheet({
  open,
  onClose,
  title,
  anchor = "above-bottom-nav",
  showHandle = true,
  dismissible = true,
  heightRatio,
  heightPx,
  children,
  footer,
  zIndexClass,
  ariaLabel,
  panelClassName = "",
  contentPaddingBottomPx,
  stageStyle,
}: DibayBottomSheetProps) {
  const { titleId } = useOverlayTitleIds("sheet");
  const aboveNav = anchor === "above-bottom-nav";
  const hasFooter = footer != null;
  const absoluteHeightPx =
    typeof heightPx === "number" && Number.isFinite(heightPx) && heightPx > 0
      ? Math.round(heightPx)
      : null;
  const ratio =
    absoluteHeightPx == null &&
    typeof heightRatio === "number" &&
    heightRatio > 0 &&
    heightRatio <= 1
      ? heightRatio
      : null;

  const stageClassName = "items-end";
  const usesFixedHeight = absoluteHeightPx != null || ratio != null;

  const panelStyle: CSSProperties = {
    ...(contentPaddingBottomPx != null
      ? { paddingBottom: contentPaddingBottomPx }
      : aboveNav
        ? {}
        : { paddingBottom: "max(1rem, var(--safe-bottom))" }),
    ...(absoluteHeightPx != null
      ? {
          height: absoluteHeightPx,
          maxHeight: absoluteHeightPx,
          minHeight: absoluteHeightPx,
        }
      : ratio != null
        ? {
            // Fixed usable height — do NOT use min(Ndvh, 100%) (parent % collapses to content).
            height: `${Math.round(ratio * 100)}dvh`,
            maxHeight: `${Math.round(ratio * 100)}dvh`,
            minHeight: `${Math.round(ratio * 100)}dvh`,
          }
        : {}),
  };

  // Footer present: outer must not scroll — body scrolls, footer stays as flex sibling.
  // heightRatio / heightPx (Support sheet): fixed panel height — flex column so chrome/composer layout.
  // Footer absent + no ratio: panel scrolls; do not wrap children in overflow-hidden (clips last actions).
  const overflowClass = usesFixedHeight || hasFooter
      ? "flex flex-col overflow-hidden overscroll-contain"
      : "overflow-y-auto overscroll-contain";

  const heightClass =
    usesFixedHeight
      ? "min-h-0"
      : aboveNav
        ? OVERLAY_SHEET_ABOVE_NAV.maxHClass
        : "max-h-[min(82dvh,560px)]";

  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      placement="sheet"
      zRole="sheet"
      zIndexClass={zIndexClass}
      labelledBy={title ? titleId : undefined}
      ariaLabel={ariaLabel}
      stageClassName={stageClassName}
      stageStyle={stageStyle}
      sheetAnchor={anchor}
    >
      <div
        className={`${OverlayUi.sheetPanel} ${heightClass} ${overflowClass} ${panelClassName}`.trim()}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        data-sheet-height-ratio={ratio != null ? String(ratio) : undefined}
        data-sheet-height-px={absoluteHeightPx != null ? String(absoluteHeightPx) : undefined}
        data-form-keyboard-surface={usesFixedHeight ? "1" : undefined}
      >
        {showHandle ? <div className={OverlayUi.sheetHandle} aria-hidden /> : null}
        {title != null ? (
          <h2 id={titleId} className={`${OverlayUi.title} ${OverlayUi.titleSheet}`}>
            {title}
          </h2>
        ) : null}
        {hasFooter ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
        ) : usesFixedHeight ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        ) : (
          children
        )}
        {hasFooter ? <div className="shrink-0">{footer}</div> : null}
      </div>
    </DibayOverlayRoot>
  );
}
