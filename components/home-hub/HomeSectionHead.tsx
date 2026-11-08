"use client";

import { ChevronRight } from "lucide-react";

/** 홈 칸 제목 줄 — 네이버 홈 비율(16 · 600). 홈은 요약만 보이므로 「더보기 ›」 는 쓰지 않는다 (Owner 2026-11-09) */
export function HomeSectionHead({
  title,
  moreLabel,
  onMore,
}: {
  title: string;
  moreLabel?: string;
  onMore?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between px-[18px]">
      <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#141a16]">{title}</h2>
      {onMore && moreLabel ? (
        <button type="button" onClick={onMore} className="flex items-center text-[13px] text-[#767676] active:opacity-60">
          {moreLabel}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
