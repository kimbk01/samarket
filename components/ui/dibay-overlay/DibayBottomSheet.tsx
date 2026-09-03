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
   * When set, overrides default max-height caps.
   */
  heightRatio?: number;
  children: ReactNode;
  footer?: ReactNode;
  zIndexClass?: string;
  ariaLabel?: string;
  panelClassName?: string;
  /** Extra bottom padding inside panel (e.g. safe area). */
  contentPaddingBottomPx?: number;
  /** Forwarded to overlay root (non-Support consumers). */
  stageStyle?: CSSProperties;
};

/**
 * Bottom sheet — default ABOVE_BOTTOM_NAV using MAIN_BOTTOM_NAV_SHEET_* authority.
 * Optional: `heightRatio`, `anchor`, `contentPaddingBottomPx` (Form inset consumers).
 * Do not add Support-specific or keyboard-formula behavior here.
 */
export function DibayBottomSheet({
  open,
  onClose,
  title,
  anchor = "above-bottom-nav",
  showHandle = true,
  dismissible = true,
  heightRatio,
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
  const ratio =
    typeof heightRatio === "number" && heightRatio > 0 && heightRatio <= 1
      ? heightRatio
      : null;

  const stageClassName = "items-end";
  const usesFixedHeight = ratio != null;

  const panelStyle: CSSProperties = {
    ...(contentPaddingBottomPx != null
      ? { paddingBottom: contentPaddingBottomPx }
      : aboveNav
        ? {}
        : { paddingBottom: "max(1rem, var(--safe-bottom))" }),
    ...(ratio != null
      ? {
          height: `${Math.round(ratio * 100)}dvh`,
          maxHeight: `${Math.round(ratio * 100)}dvh`,
          minHeight: `${Math.round(ratio * 100)}dvh`,
        }
      : {}),
  };

  const overflowClass =
    hasFooter || usesFixedHeight
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
