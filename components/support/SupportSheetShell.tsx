"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

const SUPPORT_SHEET_HEIGHT_RATIO = 0.8;
const SUPPORT_SHEET_MAX_W_CLASS = "max-w-[560px]";
const SUPPORT_SHEET_Z_CLASS = "z-[var(--z-overlay-sheet,80)]";

export type SupportSheetShellProps = {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  ariaLabel: string;
  children: ReactNode;
};

/**
 * Sole Support modal geometry owner.
 * VV stage + 80% bottom-anchored sheet + effectiveBottomInset once.
 * Keyboard changes the band — never switches to full-band fill.
 */
export function SupportSheetShell({
  open,
  onClose,
  dismissible = true,
  ariaLabel,
  children,
}: SupportSheetShellProps) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const {
    effectiveBottomInset,
    keyboardOpen,
    visualViewportHeight,
    visualViewportOffsetTop,
  } = useFormKeyboardViewport({ enabled: open });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    if (!mounted) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !dismissible || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open || !mounted || typeof document === "undefined" || !document.body) {
    return null;
  }

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

  return createPortal(
    <div
      className={`fixed inset-0 flex items-end justify-center ${SUPPORT_SHEET_Z_CLASS}`}
      style={stageStyle}
      role="presentation"
      data-support-sheet-shell="1"
      data-support-sheet-entered={entered ? "true" : "false"}
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      data-sheet-height-ratio={String(SUPPORT_SHEET_HEIGHT_RATIO)}
    >
      {dismissible ? (
        <button
          type="button"
          className={`${OverlayUi.backdrop} !opacity-100`}
          aria-label="Close"
          onClick={onClose}
        />
      ) : (
        <div className={`${OverlayUi.backdrop} !opacity-100`} aria-hidden />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-form-keyboard-surface="1"
        data-support-sheet-panel="1"
        className={`${OverlayUi.sheetPanel} relative z-[1] mx-auto flex w-full ${SUPPORT_SHEET_MAX_W_CLASS} min-h-0 flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,0.9,0.32,1)] ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
