"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * iOS Safari 등에서 `window.confirm`이 비동기/중첩 UI와 맞물려 실패하는 경우를 피하기 위한 인앱 확인창.
 */
export function NotificationDeleteConfirmDialog({
  open,
  message,
  cancelLabel,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label={cancelLabel}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] mx-auto w-full max-w-sm rounded-ui-rect border border-sam-border/80 bg-sam-surface p-4 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p id={titleId} className="text-[14px] leading-snug text-sam-fg">
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!busy) onCancel();
            }}
            className="touch-manipulation rounded-ui-rect border-0 bg-sam-surface-muted px-4 py-2 text-[14px] font-medium text-sam-fg disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!busy) onConfirm();
            }}
            className="touch-manipulation rounded-ui-rect border-0 bg-red-600 px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
