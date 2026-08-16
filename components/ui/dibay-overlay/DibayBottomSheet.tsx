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
  const hasFooter = footer != null;

  const stageClassName = "items-end";

  const panelStyle: CSSProperties | undefined = contentPaddingBottomPx
    ? { paddingBottom: contentPaddingBottomPx }
    : aboveNav
      ? undefined
      : { paddingBottom: "max(1rem, var(--safe-bottom))" };

  // Footer present: outer must not scroll — body scrolls, footer stays as flex sibling.
  // Footer absent: keep legacy overflow-y-auto panel scroll.
  const overflowClass = hasFooter
    ? "flex flex-col overflow-hidden overscroll-contain"
    : "overflow-y-auto overscroll-contain";

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
      sheetAnchor={anchor}
    >
      <div
        className={`${OverlayUi.sheetPanel} ${aboveNav ? OVERLAY_SHEET_ABOVE_NAV.maxHClass : "max-h-[min(82dvh,560px)]"} ${overflowClass} ${panelClassName}`.trim()}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {showHandle ? <div className={OverlayUi.sheetHandle} aria-hidden /> : null}
        {title != null ? (
          <h2 id={titleId} className={`${OverlayUi.title} ${OverlayUi.titleSheet}`}>
            {title}
          </h2>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        {hasFooter ? <div className="shrink-0">{footer}</div> : null}
      </div>
    </DibayOverlayRoot>
  );
}
