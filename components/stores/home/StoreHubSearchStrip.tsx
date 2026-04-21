"use client";

import { FB } from "@/components/stores/store-facebook-feed-tokens";

/** Facebook 상단 검색 — 회색 알약 필, 테두리 최소화 */
export function StoreHubSearchStrip({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="-mx-1 px-1 pb-2">
      <label htmlFor="stores-hub-global-search" className="sr-only">
        매장 검색
      </label>
      <div
        className={`flex items-center gap-2 px-3 py-2 ${FB.searchWell}`}
      >
        <svg
          className="h-5 w-5 shrink-0 text-[#65676B] dark:text-[#B0B3B8]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id="stores-hub-global-search"
          type="search"
          enterKeyHint="search"
          placeholder="매장 검색"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent sam-text-body text-[#050505] placeholder:text-[#65676B] focus:outline-none dark:text-[#E4E6EB] dark:placeholder:text-[#B0B3B8]"
        />
      </div>
    </div>
  );
}
