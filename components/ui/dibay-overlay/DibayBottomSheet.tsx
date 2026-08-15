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
  children: ReactNode;
  footer?: ReactNode;
  zIndexClass?: string;
  ariaLabel?: string;
  panelClassName?: string;
  /** Extra bottom padding inside panel (e.g. keyboard). */
  contentPaddingBottomPx?: number;
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
  children,
  footer,
  zIndexClass,
  ariaLabel,
  panelClassName = "",
  contentPaddingBottomPx,
}: DibayBottomSheetProps) {
  const { titleId } = useOverlayTitleIds("sheet");
  const aboveNav = anchor === "above-bottom-nav";

  const stageClassName = aboveNav
    ? `items-end ${OVERLAY_SHEET_ABOVE_NAV.bottomClass}`
    : "items-end";

  const panelStyle: CSSProperties | undefined = contentPaddingBottomPx
    ? { paddingBottom: contentPaddingBottomPx }
    : aboveNav
      ? undefined
      : { paddingBottom: "max(1rem, var(--safe-bottom))" };

  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose}
      dismissible
      placement="sheet"
      zRole="sheet"
      zIndexClass={zIndexClass}
      labelledBy={title ? titleId : undefined}
      ariaLabel={ariaLabel}
      stageClassName={stageClassName}
    >
      <div
        className={`${OverlayUi.sheetPanel} ${aboveNav ? OVERLAY_SHEET_ABOVE_NAV.maxHClass : "max-h-[min(82dvh,560px)]"} overflow-y-auto overscroll-contain ${panelClassName}`.trim()}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {showHandle ? <div className={OverlayUi.sheetHandle} aria-hidden /> : null}
        {title != null ? (
          <h2 id={titleId} className={`${OverlayUi.title} ${OverlayUi.titleSheet}`}>
            {title}
          </h2>
        ) : null}
        <div className="min-h-0 flex-1">{children}</div>
        {footer}
      </div>
    </DibayOverlayRoot>
  );
}
