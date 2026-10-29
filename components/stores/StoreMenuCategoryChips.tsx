"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useEffect, useRef } from "react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { DeliveryTheme } from "@/lib/design/delivery-theme";
import {
  resolveChipRowScrollLeft,
  shouldFollowActiveChip,
} from "@/lib/stores/store-detail-baemin-presentation";

/**
 * 매장 메뉴 구역(배민식) — 가로 스크롤 카테고리 칩, 클릭 시 해당 섹션으로 스크롤.
 * 모바일: 터치 스와이프·모멘텀 스크롤(`HorizontalDragScroll` + overflow-x-auto).
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchingRef = useRef(false);

  /**
   * WP6 — scroll spy 로 선택 칩이 바뀌면 칩 줄을 가로로만 따라 움직인다 (inline "nearest" 규칙).
   * `scrollIntoView` 는 페이지 세로 스크롤까지 움직일 수 있어 칩 줄 scrollLeft 만 직접 바꾼다.
   */
  useEffect(() => {
    if (variant !== "orderDetail") return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const row = wrap.querySelector<HTMLElement>('[role="tablist"]');
    const chip = wrap.querySelector<HTMLElement>(`[data-chip-index="${activeIndex}"]`);
    if (!row || !chip) return;
    const rect = row.getBoundingClientRect();
    if (
      !shouldFollowActiveChip({
        rowTop: rect.top,
        rowBottom: rect.bottom,
        viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
        userTouchingRow: touchingRef.current,
      })
    ) {
      return;
    }
    const chipLeftInRow = chip.getBoundingClientRect().left - rect.left + row.scrollLeft;
    const next = resolveChipRowScrollLeft({
      rowScrollLeft: row.scrollLeft,
      rowClientWidth: row.clientWidth,
      rowScrollWidth: row.scrollWidth,
      chipOffsetLeft: chipLeftInRow,
      chipWidth: chip.offsetWidth,
    });
    if (next == null) return;
    row.scrollTo({ left: next, behavior: "smooth" });
  }, [activeIndex, variant, sections.length]);

  if (sections.length <= 1) return null;

  const wrapPad =
    variant === "orderDetail"
      ? "bg-white px-0 py-2"
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
      ? `sam-i18n-chip-row flex flex-nowrap gap-2 overflow-x-auto px-3 [-webkit-overflow-scrolling:touch] ${scrollHide}`
      : `sam-tabs sam-tabs--scroll sam-i18n-chip-row -mx-4 ${scrollHide}`;

  const chipCls = (on: boolean) =>
    variant === "orderDetail"
      ? on
        ? DeliveryTheme.categoryTabActive
        : DeliveryTheme.categoryTab
      : `sam-tab ${on ? "sam-tab--active" : ""}`;

  return (
    <div
      ref={wrapRef}
      className={`${wrapPad} ${borderCls}`}
      onPointerDown={() => {
        touchingRef.current = true;
      }}
      onPointerUp={() => {
        touchingRef.current = false;
      }}
      onPointerCancel={() => {
        touchingRef.current = false;
      }}
    >
      <HorizontalDragScroll className={scrollCls} role="tablist" aria-label={t("store_menu_category_aria")}>
        {showSearchButton ? (
          <button
            type="button"
            onClick={onSearchClick}
            className={
              variant === "orderDetail"
                ? `${DeliveryTheme.categoryTab} ${DeliveryTheme.categorySearch}`
                : DeliveryTheme.categorySearch
            }
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
              data-chip-index={i}
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
