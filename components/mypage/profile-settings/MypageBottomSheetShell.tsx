"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayUsableAreaSheet } from "@/components/ui/dibay-overlay/DibayUsableAreaSheet";

/**
 * Mypage sheets consume the shared usable-area authority (OPTION B).
 * No parallel VV portal — migration complete for this shell.
 */
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
  return (
    <DibayUsableAreaSheet
      open={open}
      onClose={onClose}
      ariaLabel={ariaLabel ?? title}
      anchor="above-bottom-nav"
      preferredHeightRatio={null}
      showHandle={false}
      zIndexClass={MAIN_BOTTOM_NAV_SHEET_Z_CLASS}
      header={
        <div className="flex items-center justify-between border-b border-[color:var(--overlay-border)] px-1 py-1">
          <h2 className={`truncate ${OverlayUi.title} ${OverlayUi.titleSheet} !text-left`}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="dibay-overlay-btn dibay-overlay-btn--text !min-h-9 !w-9 !flex-none !p-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-3">{children}</div>
    </DibayUsableAreaSheet>
  );
}
