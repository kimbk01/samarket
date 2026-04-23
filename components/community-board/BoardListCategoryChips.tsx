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
      <span className="w-full sam-text-xxs font-medium uppercase tracking-wide text-sam-meta">카테고리</span>
      <Link
        href={baseHref}
        className={`rounded-sam-sm border px-3 py-1.5 sam-text-helper font-medium ${
          !categorySlug
            ? "border-sam-primary-border bg-sam-primary-soft text-sam-primary"
            : "border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-surface-muted"
        }`}
      >
        전체
      </Link>
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={`${baseHref}?category=${encodeURIComponent(c.slug)}`}
          className={`rounded-sam-sm border px-3 py-1.5 sam-text-helper font-medium ${
            categorySlug === c.slug
              ? "border-sam-primary-border bg-sam-primary-soft text-sam-primary"
              : "border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-surface-muted"
          }`}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
