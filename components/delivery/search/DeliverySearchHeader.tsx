"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function DeliverySearchHeader({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-sam-border bg-sam-surface/95 backdrop-blur-[10px] pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-12 max-w-lg items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="sam-header-action h-10 w-10 shrink-0 text-sam-fg"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(value);
          }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-sam-border bg-sam-surface-muted px-4">
            <button
              type="submit"
              aria-label="검색"
              className="shrink-0 text-sam-muted"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="먹고 싶은 메뉴나 가게를 찾아보세요"
              className="min-w-0 flex-1 bg-transparent sam-text-body text-sam-fg placeholder:text-sam-meta focus:outline-none"
              aria-label="배달 검색어 입력"
            />

            {value.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => onChange("")}
                aria-label="검색어 지우기"
                className="shrink-0 text-sam-muted"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </header>
  );
}

