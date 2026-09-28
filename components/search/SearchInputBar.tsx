"use client";

import { type FormEvent, type KeyboardEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type SearchInputBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (keyword: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function SearchInputBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus = false,
}: SearchInputBarProps) {
  const { safeT } = useI18n();
  const hasQuery = value.trim().length > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = value.trim();
    if (keyword) onSubmit(keyword);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <input
          type="search"
          value={value}
          autoFocus={autoFocus}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "Enter") return;
            if (!event.nativeEvent.isComposing) return;
            event.preventDefault();
          }}
          placeholder={
            placeholder ??
            safeT("global_search_placeholder", {
              fallbackKo: "검색어를 입력하세요",
              fallbackEn: "Search",
            })
          }
          className="min-w-0 w-full rounded-full border border-sam-border bg-sam-app-soft py-2.5 pl-4 pr-10 text-[15px] text-sam-fg outline-none placeholder:text-sam-fg-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {hasQuery ? (
          <button
            type="button"
            data-global-search-clear-query="true"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-sam-muted"
            aria-label={safeT("global_search_clear_query", {
              fallbackKo: "검색어 지우기",
              fallbackEn: "Clear search",
            })}
            onClick={() => onChange("")}
          >
            ×
          </button>
        ) : null}
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-full bg-sam-brand px-4 py-2.5 text-sm font-semibold text-white"
      >
        {safeT("common_search", { fallbackKo: "검색", fallbackEn: "Search" })}
      </button>
    </form>
  );
}
