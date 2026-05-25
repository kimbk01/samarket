"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { FB } from "@/components/stores/store-facebook-feed-tokens";

/** Facebook 상단 검색 — 회색 알약 필, 테두리 최소화 */
export function StoreHubSearchStrip({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="pb-2">
      <label htmlFor="stores-hub-global-search" className="sr-only">
        {t("store_search_placeholder")}
      </label>
      <div
        className={`flex items-center gap-2 px-4 ${FB.searchWell}`}
      >
        <svg
          className="h-4 w-4 shrink-0 text-[color:var(--delivery-text-muted)]"
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
          placeholder={t("store_search_placeholder")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[14px] font-normal leading-[var(--delivery-lh-body)] text-[color:var(--delivery-text-main)] placeholder:text-[13px] placeholder:font-normal placeholder:leading-[var(--delivery-lh-sub)] placeholder:text-[color:var(--delivery-text-muted)] focus:outline-none"
        />
      </div>
    </div>
  );
}
