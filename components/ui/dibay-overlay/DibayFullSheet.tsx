"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { DibayOverlayRoot, useOverlayTitleIds } from "./DibayOverlayRoot";
import { DibayOverlayActions, type DibayOverlayAction } from "./DibayOverlayActions";

export type DibayFullSheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Footer actions — typically [취소][등록] horizontal. */
  actions?: DibayOverlayAction[];
  /** When true, sheet fills viewport (workflow). When false, sits above bottom nav. */
  hideBottomNav?: boolean;
  topOffsetPx?: number;
  zIndexClass?: string;
  headerExtra?: ReactNode;
  showCloseButton?: boolean;
};

/**
 * Full / Form sheet — header + scroll body + stable action footer.
 * Default: intentional fullscreen workflow (hideBottomNav=true).
 * For overlay-above-nav form, set hideBottomNav=false.
 */
export function DibayFullSheet({
  open,
  onClose,
  title,
  children,
  actions,
  hideBottomNav = true,
  topOffsetPx = 0,
  zIndexClass,
  headerExtra,
  showCloseButton = true,
}: DibayFullSheetProps) {
  const { titleId } = useOverlayTitleIds("full-sheet");
  const headerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { keyboardOpen, effectiveViewportBottom, visualViewportHeight, visualViewportOffsetTop } =
    useFormKeyboardViewport({ enabled: open });
  useFormKeyboardFocusVisibility({
    enabled: open,
    scrollRootRef: bodyRef,
    stickyChromeRef: headerRef,
    effectiveViewportBottom,
  });

  /**
   * Keyboard open → stage = visualViewport band (bottom = keyboard top on iOS and Android;
   * nav offset dropped — the nav is hidden while typing). Closed → geometry unchanged.
   */
  const kbBand = keyboardOpen && visualViewportHeight > 0;
  const bandTop = Math.max(topOffsetPx, Math.round(visualViewportOffsetTop));
  const bandBottom = Math.round(visualViewportOffsetTop + visualViewportHeight);
  const stageStyle: CSSProperties = kbBand
    ? { top: bandTop, height: Math.max(1, bandBottom - bandTop), bottom: "auto" }
    : hideBottomNav
      ? { top: topOffsetPx, bottom: 0, height: "auto" }
      : {
          top: topOffsetPx,
          bottom: "calc(var(--app-bottom-nav-height, 60px) + var(--safe-bottom))",
          height: "auto",
        };

  /**
   * UX-03: 스테이지가 화면 맨 위(상태바·Dynamic Island 아래)에서 시작하면 헤더가 safe-top 을 진다.
   * 스테이지 top 이 이미 safe-top 아래면 기본 여백(0.625rem)만 남는다.
   */
  const stageTopPx = kbBand ? bandTop : topOffsetPx;
  const headerPaddingTop = `max(0.625rem, calc(var(--safe-top, 0px) - ${stageTopPx}px + 0.625rem))`;

  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose}
      dismissible={false}
      placement="full"
      zRole="sheet"
      zIndexClass={zIndexClass}
      labelledBy={titleId}
      stageStyle={stageStyle}
      stageClassName="!p-0"
    >
      <div
        className={OverlayUi.fullSheet}
        data-form-keyboard-surface="1"
        data-form-keyboard-open={keyboardOpen ? "true" : "false"}
        data-keyboard-tap-dismiss="1"
      >
        <div
          ref={headerRef}
          data-form-keyboard-sticky-chrome="1"
          className="flex shrink-0 items-center justify-between border-b border-[color:var(--overlay-border)] px-3 pb-2.5"
          style={{ paddingTop: headerPaddingTop }}
        >
          <h2 id={titleId} className={`${OverlayUi.title} ${OverlayUi.titleSheet} flex-1 text-left`}>
            {title}
          </h2>
          {headerExtra}
          {showCloseButton ? (
            <button
              type="button"
              onClick={onClose}
              className="dibay-overlay-btn dibay-overlay-btn--text !min-h-9 !w-9 !flex-none !p-0"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {children}
        </div>
        {actions && actions.length > 0 ? (
          <div className="shrink-0 border-t border-[color:var(--overlay-border)] px-3 pb-[max(0.75rem,var(--kb-safe-bottom))] pt-3">
            <DibayOverlayActions layout="row" actions={actions} />
          </div>
        ) : null}
      </div>
    </DibayOverlayRoot>
  );
}
