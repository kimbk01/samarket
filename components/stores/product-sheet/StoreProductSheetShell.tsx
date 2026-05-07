"use client";

import type { ReactNode } from "react";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

export function StoreProductSheetShell({
  children,
  onBackdropClose,
}: {
  children: ReactNode;
  onBackdropClose: () => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-add-sheet-title"
    >
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 cursor-default bg-transparent"
        aria-label="시트 닫기"
        tabIndex={-1}
        onClick={onBackdropClose}
      />
      <div
        className={`pointer-events-auto relative z-[1] mx-auto flex max-h-[min(92dvh,720px)] w-full min-w-0 flex-col overflow-hidden rounded-t-[18px] bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.18)] ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
      >
        {children}
      </div>
    </div>
  );
}
