"use client";

/**
 * 매장 메뉴 구역(배민식) — 가로 스크롤 카테고리 칩, 클릭 시 해당 섹션으로 스크롤.
 */
export function StoreMenuCategoryChips({
  sections,
  activeIndex,
  onSelect,
  /** 위쪽에 이미 구분선(예: 가게정보 피크 행)이 있으면 true */
  omitTopBorder = false,
}: {
  sections: { label: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  omitTopBorder?: boolean;
}) {
  if (sections.length <= 1) return null;

  return (
    <div
      className={`bg-transparent px-4 py-2.5 ${omitTopBorder ? "" : "border-t border-gray-200/80"}`}
    >
      <div
        className="-mx-1 flex gap-2 overflow-x-auto pb-0.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                on
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 shadow-sm active:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
