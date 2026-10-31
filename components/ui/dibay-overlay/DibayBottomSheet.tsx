"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { OVERLAY_SHEET_MAX_H_CLASS, OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { DibayOverlayRoot, useOverlayTitleIds } from "./DibayOverlayRoot";

export type DibayBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
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
  /** Replaces the panel bottom padding (default CSS `max(20px, safe-bottom)`) — Form inset consumers. */
  contentPaddingBottomPx?: number;
  /** Forwarded to overlay root (non-Support consumers). */
  stageStyle?: CSSProperties;
};

/**
 * Bottom sheet — 기기 맨 아래(`bottom: 0`)에서 열리고 하단 탭을 덮는다 (Owner 2026-11-01).
 * safe-bottom 은 패널 padding 한 번(`.dibay-overlay-sheet` CSS). Optional: `heightRatio`,
 * `contentPaddingBottomPx` (Form inset consumers).
 * Do not add Support-specific behavior here.
 *
 * Keyboard (Form SSOT, shared store — no own listeners): keyboard CLOSED = geometry unchanged
 * (dvh caps · `contentPaddingBottomPx` / safe-bottom). Keyboard OPEN = the stage is the
 * visualViewport band (same band rule as the usable-area sheet): bottom = keyboard top on iOS and Android,
 * height capped to the band, bottom padding without safe-bottom / keyboard px (the band already
 * excludes the keyboard — never band + inset).
 */
export function DibayBottomSheet({
  open,
  onClose,
  title,
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { keyboardOpen, effectiveViewportBottom, visualViewportHeight, visualViewportOffsetTop } =
    useFormKeyboardViewport({ enabled: open });
  useFormKeyboardFocusVisibility({
    enabled: open,
    scrollRootRef: panelRef,
    effectiveViewportBottom,
  });
  /** Keyboard open + measured band → stage = visible band (KB-02/03 · K-01/K-02/K-03). */
  const kbBand = keyboardOpen && visualViewportHeight > 0;
  const bandHeight = Math.round(visualViewportHeight);
  const hasFooter = footer != null;
  const ratio =
    typeof heightRatio === "number" && heightRatio > 0 && heightRatio <= 1
      ? heightRatio
      : null;

  const stageClassName = "items-end";
  const usesFixedHeight = ratio != null;

  /** Keyboard closed = CSS `max(20px, safe-bottom)` once; open = band already excludes keyboard/safe. */
  const closedPadding: CSSProperties =
    contentPaddingBottomPx != null ? { paddingBottom: contentPaddingBottomPx } : {};
  const openPadding: CSSProperties =
    contentPaddingBottomPx != null ? { paddingBottom: 0 } : { paddingBottom: "var(--overlay-space-4)" };
  const ratioHeightPx =
    kbBand && ratio != null ? Math.max(1, Math.min(Math.round(bandHeight * ratio), bandHeight)) : null;
  const panelStyle: CSSProperties = {
    ...(kbBand ? openPadding : closedPadding),
    ...(ratioHeightPx != null
      ? { height: ratioHeightPx, maxHeight: ratioHeightPx, minHeight: ratioHeightPx }
      : ratio != null
        ? {
            height: `${Math.round(ratio * 100)}dvh`,
            maxHeight: `${Math.round(ratio * 100)}dvh`,
            minHeight: `${Math.round(ratio * 100)}dvh`,
          }
        : kbBand
          ? { maxHeight: bandHeight }
          : {}),
  };
  const resolvedStageStyle: CSSProperties | undefined = kbBand
    ? {
        ...stageStyle,
        top: Math.max(0, Math.round(visualViewportOffsetTop)),
        height: bandHeight,
        left: 0,
        right: 0,
        bottom: "auto",
      }
    : stageStyle;

  const overflowClass =
    hasFooter || usesFixedHeight
      ? "flex flex-col overflow-hidden overscroll-contain"
      : "overflow-y-auto overscroll-contain";

  const heightClass = usesFixedHeight || kbBand ? "min-h-0" : OVERLAY_SHEET_MAX_H_CLASS;

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
      stageStyle={resolvedStageStyle}
    >
      <div
        ref={panelRef}
        className={`${OverlayUi.sheetPanel} ${heightClass} ${overflowClass} ${panelClassName}`.trim()}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        data-sheet-height-ratio={ratio != null ? String(ratio) : undefined}
        data-form-keyboard-surface={usesFixedHeight ? "1" : undefined}
        data-form-keyboard-open={keyboardOpen ? "true" : "false"}
        data-keyboard-tap-dismiss="1"
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
