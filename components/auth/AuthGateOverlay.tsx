"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 하단 탭 z-[1200]·시트 z-[1300] 위 — 로그인 게이트 전용 */
export const AUTH_GATE_OVERLAY_Z_CLASS = "z-[1310]";

type AuthGateOverlayProps = {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
};

export function AuthGateOverlay({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
  role = "dialog",
}: AuthGateOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${AUTH_GATE_OVERLAY_Z_CLASS} flex items-center justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]`}
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={onClose ? () => onClose() : undefined}
    >
      <div
        className="w-full max-w-md max-h-[min(88dvh,640px)] overflow-y-auto overscroll-y-contain rounded-[24px] border border-[#d9e5df] bg-[#ffffff] px-5 py-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
