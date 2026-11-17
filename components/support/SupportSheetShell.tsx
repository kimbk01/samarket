"use client";

import type { ReactNode } from "react";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { DibayUsableAreaSheet } from "@/components/ui/dibay-overlay/DibayUsableAreaSheet";

/**
 * 접수형 문의(Owner 2026-11-10) — 전체 화면(사용 가능 영역 100%)으로 열어 머리글·하단 버튼 위치를 항상 같게 한다.
 * Presentation preference only — shared usable-area owns geometry.
 */
export const SUPPORT_SHEET_HEIGHT_RATIO = 1;
/** 전체 화면 — 위 모서리·테두리·안쪽 여백 없음(머리글 48px 격자가 직접 가장자리를 맞춘다) */
const SUPPORT_SHEET_FULLSCREEN_PANEL_CLASS = "!rounded-none !border-0 !px-0 !shadow-none";
const SUPPORT_SHEET_MAX_W_CLASS = "max-w-[560px]";

export type SupportSheetShellProps = {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  ariaLabel: string;
  children: ReactNode;
};

/**
 * Support presentation wiring — consumes shared DibayUsableAreaSheet only.
 * No Support VV / geometry module / inset-as-bounds.
 */
export function SupportSheetShell({
  open,
  onClose,
  dismissible = true,
  ariaLabel,
  children,
}: SupportSheetShellProps) {
  return (
    <DibayUsableAreaSheet
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      ariaLabel={ariaLabel}
      preferredHeightRatio={SUPPORT_SHEET_HEIGHT_RATIO}
      maxWidthClass={SUPPORT_SHEET_MAX_W_CLASS}
      showHandle={false}
      panelClassName={SUPPORT_SHEET_FULLSCREEN_PANEL_CLASS}
      zIndexClass={MAIN_BOTTOM_NAV_SHEET_Z_CLASS}
    >
      <div
        data-support-sheet-shell="1"
        data-support-sheet-panel="1"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </div>
    </DibayUsableAreaSheet>
  );
}
