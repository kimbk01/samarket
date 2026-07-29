"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

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

  return createPortal(
    <div className={`fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS}`} role="presentation" data-dibay-kb-overlay-shell="1">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/30"
        aria-label={ariaLabel ?? title}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        className={`absolute inset-x-0 bottom-0 flex max-h-[min(88vh,720px)] flex-col rounded-t-2xl bg-sam-surface shadow-xl transition-transform duration-200 ease-out ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-sam-border px-4 py-3">
          <h2 className="truncate sam-text-body font-semibold text-sam-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sam-muted hover:bg-sam-app"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
