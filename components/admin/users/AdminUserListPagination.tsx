"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import type { AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";

/** 회원 목록 URL 계약(`parseMemberListQueryState`)의 페이지 크기 — 기본 10, 최대 50. */
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

type Props = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

/**
 * 회원 목록 서버 페이지네이션 — 표준 `AdminPagination` 부품으로 그린다.
 * 페이지 크기 10/20/50 은 회원 목록 URL 계약 그대로 유지 (표준 20/50/100 과 다름 — 서버 상한 50).
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
      size={pageSize as AdminListPageSize}
      total={totalItems}
      onPageChange={onPageChange}
      onSizeChange={(size) => onPageSizeChange(size)}
      sizes={PAGE_SIZE_OPTIONS as unknown as readonly AdminListPageSize[]}
      className="border-t border-sam-border bg-sam-surface px-4"
    />
  );
}
