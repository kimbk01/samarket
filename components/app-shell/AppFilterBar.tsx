import type { ReactNode } from "react";

export type AppFilterBarProps = {
  children: ReactNode;
  className?: string;
};

/** 검색·칩·정렬 한 줄 — 상단 고정 보조 바 */
export function AppFilterBar({ children, className }: AppFilterBarProps) {
  return (
    <div
      className={`flex min-h-[length:var(--sam-segment-tab-height)] w-full min-w-0 items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2 sm:px-4 ${className ?? ""}`.trim()}
    >
      {children}
    </div>
  );
}
