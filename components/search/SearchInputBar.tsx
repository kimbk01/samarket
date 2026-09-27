"use client";

import { useRef, type FormEvent, type KeyboardEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type NativeComposingEvent = {
  isComposing?: boolean;
  nativeEvent?: Event & { isComposing?: boolean };
};

function readNativeComposing(event: NativeComposingEvent): boolean | undefined {
  if (typeof event.isComposing === "boolean") return event.isComposing;
  const native = event.nativeEvent;
  if (native && typeof native.isComposing === "boolean") return native.isComposing;
  return undefined;
}

type SearchInputBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (keyword: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Parent records whether IME composition is in progress. */
  onComposingChange?: (composing: boolean) => void;
  /** Fired when composition ends so parent can treat the value as searchable. */
  onCompositionCommit?: (value: string) => void;
};

export function SearchInputBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus,
  onComposingChange,
  onCompositionCommit,
}: SearchInputBarProps) {
  const { safeT } = useI18n();
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setComposing = (next: boolean) => {
    if (composingRef.current === next) return;
    composingRef.current = next;
    onComposingChange?.(next);
  };

  const commitComposition = (nextValue: string) => {
    composingRef.current = false;
    onComposingChange?.(false);
    onChange(nextValue);
    onCompositionCommit?.(nextValue);
  };

  const isBlockedSubmit = (event?: NativeComposingEvent) => {
    if (composingRef.current) return true;
    if (event && readNativeComposing(event) === true) return true;
    const el = inputRef.current as (HTMLInputElement & { composing?: boolean }) | null;
    return el?.composing === true;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBlockedSubmit(event)) return;
    const keyword = value.trim();
    if (keyword) onSubmit(keyword);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="search"
        value={value}
        autoFocus={autoFocus}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event) => {
          const nativeComposing = readNativeComposing(event);
          if (nativeComposing === true) {
            setComposing(true);
          } else if (nativeComposing === false && composingRef.current) {
            commitComposition(event.target.value);
            return;
          }
          onChange(event.target.value);
        }}
        onCompositionStart={() => {
          setComposing(true);
        }}
        onCompositionUpdate={(event) => {
          setComposing(true);
          onChange((event.target as HTMLInputElement).value);
        }}
        onCompositionEnd={(event) => {
          commitComposition((event.target as HTMLInputElement).value);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Enter") return;
          if (!isBlockedSubmit(event)) return;
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
