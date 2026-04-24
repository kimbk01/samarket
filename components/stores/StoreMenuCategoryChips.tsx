"use client";

import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";

/**
 * 매장 메뉴 구역(배민식) — 가로 스크롤 카테고리 칩, 클릭 시 해당 섹션으로 스크롤.
 * 모바일: 터치 스와이프·모멘텀 스크롤(`HorizontalDragScroll` + touch-pan-x).
 */
export function StoreMenuCategoryChips({
  sections,
  activeIndex,
  onSelect,
  /** 위쪽에 이미 구분선(예: 가게정보 피크 행)이 있으면 true */
  omitTopBorder = false,
  /** 부모가 스티키·배경을 잡은 경우 패딩만 사용 */
  plainBackground = false,
}: {
  sections: { label: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  omitTopBorder?: boolean;
  plainBackground?: boolean;
}) {
  if (sections.length <= 1) return null;

  return (
    <div className={`${plainBackground ? "px-0 py-0" : "bg-sam-surface px-4"} ${omitTopBorder || plainBackground ? "" : "border-t border-sam-border"}`}>
      <HorizontalDragScroll
        className="sam-tabs sam-tabs--scroll -mx-4"
        role="tablist"
        aria-label="메뉴 카테고리"
      >
        {sections.map((s, i) => {
          const on = i === activeIndex;
          return (
            <button
              key={`${s.label}-${i}`}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(i)}
              className={`sam-tab ${on ? "sam-tab--active" : ""}`}
            >
              {s.label}
            </button>
          );
        })}
      </HorizontalDragScroll>
    </div>
  );
}
