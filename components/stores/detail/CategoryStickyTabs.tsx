"use client";

import { StoreMenuCategoryChips } from "@/components/stores/StoreMenuCategoryChips";

export function CategoryStickyTabs(props: {
  measureRef?: React.RefObject<HTMLDivElement | null>;
  sections: { label: string }[];
  activeIndex: number;
  menuSearchOpen: boolean;
  menuQuery: string;
  setMenuQuery: (v: string) => void;
  setMenuSearchOpen: (v: boolean) => void;
  onSelect: (i: number) => void;
  stickyTopCss: string;
}) {
  return (
    <div
      ref={props.measureRef}
      className="sticky z-[40] border-b border-neutral-100 bg-white"
      style={{ top: props.stickyTopCss }}
    >
      <label className="sr-only" htmlFor="store-menu-search">
        메뉴 검색
      </label>
      {props.menuSearchOpen ? (
        <div className="px-5 pb-2 pt-2">
          <div className="flex h-[42px] items-center gap-2 rounded-full bg-[#F5F6F7] px-4">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#777" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
            <input
              id="store-menu-search"
              type="search"
              enterKeyHint="search"
              placeholder="메뉴명을 검색해보세요"
              value={props.menuQuery}
              onChange={(e) => props.setMenuQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                /** 기본 submit·페이지 스크롤 점프 방지 — 필터는 이미 onChange 로 반영됨 */
                e.preventDefault();
              }}
              className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <button
              type="button"
              onClick={() => {
                props.setMenuQuery("");
                props.setMenuSearchOpen(false);
              }}
              className="text-[13px] font-bold text-neutral-500"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
      <StoreMenuCategoryChips
        variant="orderDetail"
        sections={props.sections}
        activeIndex={props.activeIndex}
        omitTopBorder
        plainBackground
        showSearchButton
        onSearchClick={() => {
          props.setMenuSearchOpen(true);
          window.setTimeout(() => document.getElementById("store-menu-search")?.focus(), 0);
        }}
        onSelect={props.onSelect}
      />
    </div>
  );
}
