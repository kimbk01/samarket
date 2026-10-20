"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";

type Props = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

/**
 * 회원 목록 서버 페이지네이션 — 표준 `AdminPagination` (R7: 20/50/100 · 「총 N건」).
 * 회원 목록 URL 계약(`parseMemberListQueryState`)의 `pageSize` 도 20/50/100 (그 외 20).
 */
export function AdminUserListPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const { language } = useI18n();
  const ko = language !== "en";
  return (
    <AdminPagination
      ko={ko}
      page={page}
      size={normalizeAdminListPageSize(pageSize)}
      total={totalItems}
      onPageChange={onPageChange}
      onSizeChange={(size) => onPageSizeChange(size)}
      className="border-t border-sam-border bg-sam-surface px-4"
    />
  );
}
