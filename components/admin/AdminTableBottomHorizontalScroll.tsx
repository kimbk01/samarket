"use client";

import type { RefObject, UIEventHandler } from "react";

/**
 * 넓은 어드민 표 — 본문 `overflow-x-auto` 와 동기화되는 하단 고정 가로 스크롤.
 * (flex 부모 `overflow-x-hidden` + 자식 `min-w-0` 조합에서 표 끝열이 잘리는 경우 대비)
 */
export function AdminTableBottomHorizontalScroll(props: {
  show: boolean;
  tableScrollWidth: number;
  bottomScrollRef: RefObject<HTMLDivElement | null>;
  onScroll: UIEventHandler<HTMLDivElement>;
  ariaLabel: string;
  /** 사이드바 펼침 시 본문 열과 맞춤 (`--admin-sidebar-width`) */
  insetForAdminSidebar?: boolean;
}) {
  const { show, tableScrollWidth, bottomScrollRef, onScroll, ariaLabel, insetForAdminSidebar } = props;
  if (!show || tableScrollWidth <= 0) return null;

  return (
    <div
      data-admin-table-bottom-hscroll="1"
      className={[
        /* z-30: below Admin header (z-40) and far below dibay dialog (z-[1300]). */
        "pointer-events-auto fixed bottom-0 right-0 z-30 border-t border-[#d0d7e2] bg-white/95 shadow-[0_-6px_16px_rgba(16,24,40,0.12)] backdrop-blur-sm",
        insetForAdminSidebar ? "left-[var(--admin-sidebar-width,16rem)]" : "left-0",
      ].join(" ")}
    >
      <div
        ref={bottomScrollRef}
        onScroll={onScroll}
        role="region"
        aria-label={ariaLabel}
        className="h-12 w-full overflow-x-auto overflow-y-hidden overscroll-x-contain px-3 pt-2 pb-[max(0.5rem,var(--safe-bottom))] [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#98a2b3] [&::-webkit-scrollbar-track]:bg-[#eef2f6]"
      >
        <div className="h-2 shrink-0" style={{ width: Math.max(tableScrollWidth, 1) }} aria-hidden />
      </div>
    </div>
  );
}
