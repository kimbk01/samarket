"use client";

import { useRef, useEffect } from "react";

interface SearchInputBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (keyword: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = "검색",
  autoFocus,
}: SearchInputBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const k = value.trim();
    if (k) onSubmit(k);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
      <div className="flex h-10 flex-1 items-stretch gap-2 rounded-[20px] bg-[#F7F7F7] px-4">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-0 min-w-0 flex-1 self-stretch border-0 bg-transparent py-0 text-[15px] font-normal leading-[1.35] text-foreground placeholder:text-[#A8A8A8] focus:outline-none focus:ring-0"
          aria-label="검색어 입력"
        />
      </div>
      <button
        type="submit"
        className="flex min-h-[44px] shrink-0 items-center rounded-[12px] bg-signature px-4 text-[15px] font-semibold text-white"
      >
        검색
      </button>
    </form>
  );
}

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 self-center text-gray-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}
