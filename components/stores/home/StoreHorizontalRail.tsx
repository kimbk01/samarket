"use client";

import type { ReactNode } from "react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";

const SCROLL_CLASS =
  "-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

/** 섹션 제목 + 가로 스크롤 (인스타/라핏 스타일 레일) */
export function StoreHorizontalRail({
  title,
  action,
  children,
  ariaLabel,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2 px-0.5">
        <h3 className="sam-text-body font-bold tracking-tight text-sam-fg">{title}</h3>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <HorizontalDragScroll className={SCROLL_CLASS} style={{ WebkitOverflowScrolling: "touch" }} aria-label={ariaLabel ?? title}>
        {children}
      </HorizontalDragScroll>
    </div>
  );
}
