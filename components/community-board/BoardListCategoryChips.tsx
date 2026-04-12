"use client";

import Link from "next/link";

export interface BoardListCategoryChipsProps {
  baseHref: string;
  categorySlug?: string | null;
  categories: { slug: string; name: string }[];
}

/** 게시판 목록 — board_category 모드용 카테고리 칩 (?category=slug) */
export function BoardListCategoryChips({ baseHref, categorySlug, categories }: BoardListCategoryChipsProps) {
  if (categories.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2.5">
      <span className="w-full text-[11px] font-medium uppercase tracking-wide text-sam-meta">카테고리</span>
      <Link
        href={baseHref}
        className={`rounded-full px-3 py-1 text-[12px] font-medium ${
          !categorySlug ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-fg hover:bg-sam-border-soft"
        }`}
      >
        전체
      </Link>
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={`${baseHref}?category=${encodeURIComponent(c.slug)}`}
          className={`rounded-full px-3 py-1 text-[12px] font-medium ${
            categorySlug === c.slug ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
          }`}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
