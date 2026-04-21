"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

export type AppModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * 단순 확인/폼용 모달 — 토큰 기반 플랫 패널.
 */
export function AppModal({ open, onClose, title, children, footer, className }: AppModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="sam-sheet-backdrop" role="presentation" onClick={onClose} />
      <div
        className={`relative z-[60] mx-auto w-full max-w-lg rounded-t-sam-lg border border-sam-border bg-sam-surface sm:rounded-sam-md ${className ?? ""}`.trim()}
      >
        {title != null ? (
          <div className="border-b border-sam-border px-4 py-3">
            <h2 className="sam-text-section-title">{title}</h2>
          </div>
        ) : null}
        <div className="max-h-[min(70dvh,560px)] overflow-y-auto px-4 py-3">{children}</div>
        {footer != null ? <div className="border-t border-sam-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
