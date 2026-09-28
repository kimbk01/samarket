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
  autoFocus,
}: SearchInputBarProps) {
  const { safeT } = useI18n();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = value.trim();
    if (keyword) onSubmit(keyword);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
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
        className="min-w-0 flex-1 rounded-full border border-sam-border bg-sam-app-soft px-4 py-2.5 text-[15px] text-sam-fg outline-none placeholder:text-sam-fg-subtle"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-sam-brand px-4 py-2.5 text-sm font-semibold text-white"
      >
        {safeT("common_search", { fallbackKo: "검색", fallbackEn: "Search" })}
      </button>
    </form>
  );
}
