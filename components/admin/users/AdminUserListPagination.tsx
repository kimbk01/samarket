"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

type Props = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function AdminUserListPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  const pages: number[] = [];
  const start = Math.max(1, safePage - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i += 1) pages.push(i);

  return (
    <div className="flex flex-col gap-3 border-t border-[#e4e7ec] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-[#667085]">
        <span>{t("admin_users_lite_rows_per_page")}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border border-[#d0d5dd] bg-white px-2 py-1 text-sm font-medium text-[#344054] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d0d5dd] bg-white text-[#344054] disabled:opacity-40"
          aria-label={t("admin_users_lite_page_prev")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-semibold ${
              p === safePage
                ? "bg-[#2563eb] text-white"
                : "border border-[#d0d5dd] bg-white text-[#344054] hover:bg-[#f9fafb]"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d0d5dd] bg-white text-[#344054] disabled:opacity-40"
          aria-label={t("admin_users_lite_page_next")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
