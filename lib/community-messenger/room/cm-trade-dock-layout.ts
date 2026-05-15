"use client";

/** 거래 도크 높이·펼침 상태 변경 — 타임라인 하단 앵커용 */
export const CM_TRADE_DOCK_LAYOUT_EVENT = "cm-trade-dock-layout-change";

export function notifyCmTradeDockLayoutChange(detail?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CM_TRADE_DOCK_LAYOUT_EVENT, {
      detail: detail ?? "layout",
    })
  );
}
