"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_SHEET_MAX_H_CLASS,
  MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

export function MypageBottomSheetShell({
  open,
  onClose,
  title,
  children,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
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
    if (!open || !mounted) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted || typeof document === "undefined" || !document.body) return null;

  const hostStyle =
    visualViewportHeight > 0
      ? {
          top: visualViewportOffsetTop,
          height: visualViewportHeight,
          left: 0,
          right: 0,
          bottom: "auto" as const,
        }
      : undefined;

  return createPortal(
    <div
      className={`fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS}`}
      style={hostStyle}
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      data-dibay-overlay="mypage-sheet"
      data-overlay-anchor="above-bottom-nav"
      role="presentation"
    >
      <button
        type="button"
        className={`${OverlayUi.backdrop} !opacity-100`}
        aria-label={ariaLabel ?? title}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        data-form-keyboard-surface="1"
        className={`${OverlayUi.sheetPanel} absolute inset-x-0 mx-auto flex ${MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS} ${MAIN_BOTTOM_NAV_SHEET_MAX_H_CLASS} flex-col overflow-hidden transition-transform duration-200 ease-out ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: `${effectiveBottomInset}px` }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--overlay-border)] px-1 py-1">
          <h2 className={`truncate ${OverlayUi.title} ${OverlayUi.titleSheet} !text-left`}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="dibay-overlay-btn dibay-overlay-btn--text !min-h-9 !w-9 !flex-none !p-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
