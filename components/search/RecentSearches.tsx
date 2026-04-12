"use client";

import { useState, useEffect } from "react";
import {
  getRecentSearches,
  removeRecentSearch,
  clearRecentSearches,
  type RecentSearch,
} from "@/lib/search/mock-search-data";

interface RecentSearchesProps {
  onSelectKeyword: (keyword: string) => void;
}

export function RecentSearches({ onSelectKeyword }: RecentSearchesProps) {
  const [list, setList] = useState<RecentSearch[]>([]);

  useEffect(() => {
    setList(getRecentSearches());
  }, []);

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    removeRecentSearch(id);
    setList(getRecentSearches());
  };

  const handleClear = () => {
    clearRecentSearches();
    setList([]);
  };

  if (list.length === 0) return null;

  return (
    <section className="px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-sam-fg">최근 검색어</p>
        <button
          type="button"
          onClick={handleClear}
          className="text-[12px] text-sam-muted"
        >
          전체 삭제
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {list.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelectKeyword(r.keyword)}
              className="flex items-center gap-1 rounded-full border border-sam-border bg-sam-surface px-3 py-1.5 text-[13px] text-sam-fg"
            >
              <span>{r.keyword}</span>
              <button
                type="button"
                onClick={(e) => handleRemove(e, r.id)}
                className="rounded-full p-0.5 text-sam-meta hover:text-sam-muted"
                aria-label="삭제"
              >
                ×
              </button>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
