"use client";

import Link from "next/link";

export function SearchButton() {
  return (
    <Link
      href="/search"
      className="flex flex-1 items-center gap-2 rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-left sam-text-body text-sam-muted"
    >
      <SearchIcon />
      <span>검색</span>
    </Link>
  );
}

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
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
