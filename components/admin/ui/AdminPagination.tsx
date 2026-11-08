"use client";

/**
 * Admin 서버 페이지네이션 (설계 v4 §7 「페이지네이션」) — 목록 하단 우측.
 * 「전체 1,234건 중 1–50」 · 이전 · 번호(최대 7칸, 생략 기호) · 다음 · 페이지 크기 20/50/100.
 * 상태는 갖지 않는다 — `useAdminListQuery` 의 `query.page`·`query.size`·`setPage`·`setSize` 를 그대로 넘긴다.
 */

import {
  adminPaginationPageCount,
  adminPaginationSummary,
  adminPaginationWindow,
  clampAdminPage,
  formatAdminCount,
} from "@/lib/admin/pagination/admin-pagination-window";
import { ADMIN_LIST_PAGE_SIZES, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

const BTN =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-ui-rect border px-2 text-[13px] font-medium leading-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent)] disabled:cursor-not-allowed disabled:opacity-40";
const BTN_IDLE =
  "border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)]";
const BTN_CURRENT =
  "border-[var(--admin-console-accent)] bg-[var(--admin-console-active-bg)] font-semibold text-[var(--admin-console-accent)]";

export function AdminPagination({
  ko,
  page,
  size,
  total,
  onPageChange,
  onSizeChange,
  sizes = ADMIN_LIST_PAGE_SIZES,
  disabled = false,
  className = "",
}: {
  ko: boolean;
  /** 1부터 */
  page: number;
  size: AdminListPageSize;
  /** 서버가 돌려준 전체 건수 */
  total: number;
  onPageChange: (page: number) => void;
  /** 생략하면 페이지 크기 선택을 숨긴다. */
  onSizeChange?: (size: AdminListPageSize) => void;
  sizes?: readonly AdminListPageSize[];
  /** 불러오는 중 — 버튼 비활성 */
  disabled?: boolean;
  className?: string;
}) {
  const pageCount = adminPaginationPageCount(total, size);
  const current = clampAdminPage(page, pageCount);
  const items = adminPaginationWindow(current, pageCount);
  const go = (p: number) => {
    const next = clampAdminPage(p, pageCount);
    if (next !== current && !disabled) onPageChange(next);
  };

  return (
    <nav
      data-admin-pagination="1"
      aria-label={tx(ko, "admin_ui_pagination")}
      className={`flex flex-wrap items-center justify-end gap-x-3 gap-y-2 py-3 ${className}`.trim()}
    >
      <p className="text-[13px] text-[var(--admin-console-muted)]" data-admin-pagination-summary="1" aria-live="polite">
        {adminPaginationSummary(current, size, total, ko)}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`${BTN} ${BTN_IDLE}`}
          disabled={disabled || current <= 1}
          onClick={() => go(current - 1)}
          aria-label={tx(ko, "admin_ui_previous_page")}
        >
          {tx(ko, "admin_ui_prev")}
        </button>
        {items.map((it) =>
          typeof it === "number" ? (
            <button
              key={it}
              type="button"
              className={`${BTN} ${it === current ? BTN_CURRENT : BTN_IDLE}`}
              disabled={disabled && it !== current}
              aria-current={it === current ? "page" : undefined}
              aria-label={tx(ko, "admin_ui_page", { page: String(formatAdminCount(it)) })}
              onClick={() => go(it)}
            >
              {formatAdminCount(it)}
            </button>
          ) : (
            <span key={it} aria-hidden className="inline-flex h-9 min-w-6 items-center justify-center text-[13px] text-[var(--admin-console-muted)]">
              …
            </span>
          )
        )}
        <button
          type="button"
          className={`${BTN} ${BTN_IDLE}`}
          disabled={disabled || current >= pageCount}
          onClick={() => go(current + 1)}
          aria-label={tx(ko, "admin_ui_next_page")}
        >
          {tx(ko, "common_next")}
        </button>
      </div>
      {onSizeChange ? (
        <label className="flex items-center gap-1.5 text-[13px] text-[var(--admin-console-muted)]">
          <span>{tx(ko, "admin_ui_per_page")}</span>
          <select
            value={size}
            disabled={disabled}
            onChange={(e) => onSizeChange(Number(e.target.value) as AdminListPageSize)}
            className="h-9 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2 text-[13px] text-[var(--admin-console-fg)]"
            data-admin-pagination-size="1"
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {tx(ko, "admin_count_items", { n: s })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </nav>
  );
}
