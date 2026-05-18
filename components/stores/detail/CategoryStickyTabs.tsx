"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { StoreMenuCategoryChips } from "@/components/stores/StoreMenuCategoryChips";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

function CategoryTabsBar(props: {
  measureRef?: React.RefObject<HTMLDivElement | null>;
  sections: { label: string }[];
  activeIndex: number;
  menuSearchOpen: boolean;
  menuQuery: string;
  setMenuQuery: (v: string) => void;
  setMenuSearchOpen: (v: boolean) => void;
  onSelect: (i: number) => void;
}) {
  const { t } = useI18n();
  return (
    <>
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
              placeholder={t("store_menu_search_placeholder")}
              value={props.menuQuery}
              onChange={(e) => props.setMenuQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
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
    </>
  );
}

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
  pinned?: boolean;
}) {
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const bar = (
    <CategoryTabsBar
      sections={props.sections}
      activeIndex={props.activeIndex}
      menuSearchOpen={props.menuSearchOpen}
      menuQuery={props.menuQuery}
      setMenuQuery={props.setMenuQuery}
      setMenuSearchOpen={props.setMenuSearchOpen}
      onSelect={props.onSelect}
    />
  );

  if (props.pinned && portalReady && typeof document !== "undefined") {
    return createPortal(
      <div
        ref={props.measureRef}
        className="fixed inset-x-0 z-[55] border-b border-neutral-100 bg-white"
        style={{ top: props.stickyTopCss }}
        data-store-category-tabs="pinned"
      >
        <div className={`${APP_MAIN_COLUMN_CLASS} bg-white`}>{bar}</div>
      </div>,
      document.body
    );
  }

  return (
    <div
      ref={props.measureRef}
      className="relative z-[40] border-b border-neutral-100 bg-white"
      data-store-category-tabs="flow"
    >
      {bar}
    </div>
  );
}
