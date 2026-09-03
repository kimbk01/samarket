"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import {
  MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_SHEET_MAX_H_CLASS,
  MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import {
  DIBAY_USABLE_AREA_DEFAULT_HEIGHT_RATIO,
  DIBAY_USABLE_AREA_MAX_WIDTH_CLASS,
  type DibayUsableAreaSheetAnchor,
} from "@/lib/ui/dibay-usable-area-sheet-contract";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { DibayOverlayRoot, useOverlayTitleIds } from "./DibayOverlayRoot";

export type DibayUsableAreaSheetProps = {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  ariaLabel?: string;
  /**
   * Height within the usable band.
   * - number 0–1: fixed fraction of usable band (Support ~0.8)
   * - omit / null with above-bottom-nav: max-h within band (Mypage-style)
   */
  preferredHeightRatio?: number | null;
  maxWidthClass?: string;
  anchor?: DibayUsableAreaSheetAnchor;
  showHandle?: boolean;
  zIndexClass?: string;
  panelClassName?: string;
  /** Optional built-in title row (non-scrolling). Prefer header slot for custom chrome. */
  title?: ReactNode;
  /** Non-scrolling header region (identity / close). */
  header?: ReactNode;
  /** Sole flexible / local-scroll region. */
  children: ReactNode;
  /** Non-scrolling footer / composer / CTA. */
  footer?: ReactNode;
};

/**
 * OPTION B — ONE shared mobile sheet usable-area authority.
 *
 * Owns: usable sheet region (visualViewport band), safe-top once on panel,
 * bottom padding via Form effectiveBottomInset (pad-only), phone/tablet max-width.
 * Does NOT leak offsetTop / VV height / keyboard px to product consumers.
 * Does NOT change DibayBottomSheet legacy semantics (leave legacy consumers alone).
 */
export function DibayUsableAreaSheet({
  open,
  onClose,
  dismissible = true,
  ariaLabel,
  preferredHeightRatio,
  maxWidthClass = DIBAY_USABLE_AREA_MAX_WIDTH_CLASS,
  anchor = "device-bottom",
  showHandle = false,
  zIndexClass = MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
  panelClassName = "",
  title,
  header,
  children,
  footer,
}: DibayUsableAreaSheetProps) {
  const { titleId } = useOverlayTitleIds("usable-area-sheet");
  const headerRef = useRef<HTMLDivElement | HTMLHeadingElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const {
    effectiveBottomInset,
    effectiveViewportBottom,
    keyboardOpen,
    visualViewportHeight,
    visualViewportOffsetTop,
  } = useFormKeyboardViewport({ enabled: open });
  useFormKeyboardFocusVisibility({
    enabled: open,
    scrollRootRef: bodyRef,
    stickyChromeRef: headerRef,
    effectiveViewportBottom,
  });

  const aboveNav = anchor === "above-bottom-nav";
  const ratio =
    typeof preferredHeightRatio === "number" &&
    preferredHeightRatio > 0 &&
    preferredHeightRatio <= 1
      ? preferredHeightRatio
      : aboveNav
        ? null
        : DIBAY_USABLE_AREA_DEFAULT_HEIGHT_RATIO;

  const bandKnown = visualViewportHeight > 0;
  const bandHeight = bandKnown ? Math.round(visualViewportHeight) : 0;
  const bandTop = bandKnown ? Math.max(0, Math.round(visualViewportOffsetTop)) : 0;
  const sheetHeightPx =
    bandKnown && ratio != null
      ? Math.max(1, Math.min(Math.round(bandHeight * ratio), bandHeight))
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
    // Consume safe-top once inside the usable band — products must not restack.
    paddingTop: "var(--safe-top)",
    ...(sheetHeightPx != null
      ? {
          height: sheetHeightPx,
          maxHeight: sheetHeightPx,
          minHeight: sheetHeightPx,
        }
      : ratio != null
        ? {
            height: `${Math.round(ratio * 100)}dvh`,
            maxHeight: `${Math.round(ratio * 100)}dvh`,
            minHeight: `${Math.round(ratio * 100)}dvh`,
          }
        : bandKnown
          ? { maxHeight: bandHeight }
          : {}),
  };

  const heightClass =
    sheetHeightPx != null || ratio != null
      ? "min-h-0"
      : aboveNav
        ? MAIN_BOTTOM_NAV_SHEET_MAX_H_CLASS
        : "min-h-0";
  const bottomClass = aboveNav ? MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS : "";

  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      placement="sheet"
      zRole="sheet"
      zIndexClass={zIndexClass}
      labelledBy={title != null ? titleId : undefined}
      ariaLabel={ariaLabel}
      stageClassName="items-end justify-center"
      stageStyle={stageStyle}
      sheetAnchor={anchor}
      lockScroll
    >
      <div
        className={`${OverlayUi.sheetPanel} relative z-[1] mx-auto flex w-full ${maxWidthClass} ${heightClass} ${bottomClass} flex-col overflow-hidden overscroll-contain ${panelClassName}`.trim()}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        data-dibay-usable-area-sheet="1"
        data-form-keyboard-surface="1"
        data-form-keyboard-open={keyboardOpen ? "true" : "false"}
        data-sheet-height-ratio={ratio != null ? String(ratio) : undefined}
        data-usable-area-band={bandKnown ? "1" : "0"}
      >
        {showHandle ? <div className={OverlayUi.sheetHandle} aria-hidden /> : null}
        {header != null ? (
          <div
            ref={headerRef}
            className="shrink-0"
            data-dibay-usable-area-header="1"
            data-form-keyboard-sticky-chrome="1"
          >
            {header}
          </div>
        ) : title != null ? (
          <h2
            ref={headerRef}
            id={titleId}
            className={`${OverlayUi.title} ${OverlayUi.titleSheet} shrink-0`}
            data-dibay-usable-area-header="1"
            data-form-keyboard-sticky-chrome="1"
          >
            {title}
          </h2>
        ) : null}
        <div
          ref={bodyRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-dibay-usable-area-body="1"
          data-form-keyboard-scroll-root="1"
        >
          {children}
        </div>
        {footer != null ? (
          <div className="shrink-0" data-dibay-usable-area-footer="1">
            {footer}
          </div>
        ) : null}
      </div>
    </DibayOverlayRoot>
  );
}
