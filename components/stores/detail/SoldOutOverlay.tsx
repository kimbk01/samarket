"use client";

import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";

export function SoldOutOverlay() {
  const s = DibayMenuBoard.badge.soldOut;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
      <span
        className="font-bold"
        style={{
          backgroundColor: s.bg,
          color: s.fg,
          borderRadius: s.radiusPx,
          fontSize: s.fontSizePx,
          fontWeight: s.fontWeight,
          padding: s.padding,
        }}
      >
        {s.text}
      </span>
    </div>
  );
}
