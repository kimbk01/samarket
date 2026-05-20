"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  /** 주문 매장 상세 전용 칩(간격·색) */
  variant = "default",
  showSearchButton = false,
  onSearchClick,
}: {
  sections: { label: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  omitTopBorder?: boolean;
  plainBackground?: boolean;
  variant?: "default" | "orderDetail";
  showSearchButton?: boolean;
  onSearchClick?: () => void;
}) {
  const { t } = useI18n();
  if (sections.length <= 1) return null;

  const wrapPad =
    variant === "orderDetail"
      ? "px-0 py-1.5"
      : plainBackground
        ? "px-0 py-0"
        : "bg-sam-surface px-4";

  const borderCls =
    variant === "orderDetail"
      ? ""
      : omitTopBorder || plainBackground
        ? ""
        : "border-t border-sam-border";

  const scrollHide =
    "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const scrollCls =
    variant === "orderDetail"
      ? `sam-i18n-chip-row flex flex-nowrap touch-pan-x gap-1.5 overflow-x-auto px-4 pb-1.5 [-webkit-overflow-scrolling:touch] ${scrollHide}`
      : `sam-tabs sam-tabs--scroll sam-i18n-chip-row -mx-4 ${scrollHide}`;

  const chipCls = (on: boolean) =>
    variant === "orderDetail"
      ? `shrink-0 whitespace-nowrap rounded-full border px-[12px] text-[12px] font-bold transition-colors duration-[180ms] ${
          on ? "h-[32px] border-neutral-900 bg-neutral-900 text-white" : "h-[32px] border-neutral-200 bg-white text-neutral-900"
        }`
      : `sam-tab ${on ? "sam-tab--active" : ""}`;

  return (
    <div className={`${wrapPad} ${borderCls}`}>
      <HorizontalDragScroll className={scrollCls} role="tablist" aria-label={t("store_menu_category_aria")}>
        {showSearchButton ? (
          <button
            type="button"
            onClick={onSearchClick}
            className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-900"
            aria-label={t("store_menu_search_aria")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        ) : null}
        {sections.map((s, i) => {
          const on = i === activeIndex;
          return (
            <button
              key={`${s.label}-${i}`}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(i)}
              className={chipCls(on)}
            >
              {s.label}
            </button>
          );
        })}
      </HorizontalDragScroll>
    </div>
  );
}
