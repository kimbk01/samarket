"use client";

import {
  MEMBER_LIST_SEARCH_PLACEHOLDER_KO,
  memberListStatusCategoryLabelKo,
} from "@/lib/admin-users/member-list-presentation";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import {
  ADMIN_USERS_LITE_BTN_PRIMARY,
  ADMIN_USERS_LITE_CARD,
} from "@/lib/ui/admin-users-lite-styles";
import type { AdminUserStatusCategory } from "@/lib/types/admin-user";

interface AdminUserFilterBarProps {
  searchDraft: string;
  onSearchDraftChange: (q: string) => void;
  onSearchSubmit: () => void;
  onSearchClear: () => void;
  statusFilter: AdminUserStatusCategory | "";
  onStatusFilterChange: (value: AdminUserStatusCategory | "") => void;
  roleFilter: "store_manager" | "admin" | "";
  onRoleFilterChange: (value: "store_manager" | "admin" | "") => void;
  loading?: boolean;
}

export function AdminUserFilterBar({
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
  onSearchClear,
  statusFilter,
  onStatusFilterChange,
  roleFilter,
  onRoleFilterChange,
  loading = false,
}: AdminUserFilterBarProps) {
  return (
    <form
      className={`${ADMIN_USERS_LITE_CARD} flex w-full min-w-0 flex-col gap-3 p-3 lg:flex-row lg:items-center`}
      onSubmit={(e) => {
        e.preventDefault();
        onSearchSubmit();
      }}
      data-member-list-filter-bar="1"
    >
      <div className="relative min-w-0 flex-1">
        <input
          type="search"
          placeholder={MEMBER_LIST_SEARCH_PLACEHOLDER_KO}
          value={searchDraft}
          onChange={(e) => onSearchDraftChange(e.target.value)}
          className="w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2.5 pr-10 text-sm text-[#101828] outline-none placeholder:text-[#98a2b3] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
          aria-label={MEMBER_LIST_SEARCH_PLACEHOLDER_KO}
        />
        {searchDraft ? (
          <button
            type="button"
            onClick={onSearchClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-[12px] font-semibold text-[#667085] hover:bg-[#f2f4f7]"
            aria-label="검색 초기화"
          >
            ✕
          </button>
        ) : null}
      </div>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as AdminUserStatusCategory | "")}
        className="w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-medium text-[#344054] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 lg:w-[160px]"
        aria-label="계정 상태"
      >
        <option value="">계정 상태 전체</option>
        <option value="active">{memberListStatusCategoryLabelKo("active")}</option>
        <option value="needs_review">{memberListStatusCategoryLabelKo("needs_review")}</option>
        <option value="suspended">{memberListStatusCategoryLabelKo("suspended")}</option>
        <option value="blocked">{memberListStatusCategoryLabelKo("blocked")}</option>
        <option value="deleted">{memberListStatusCategoryLabelKo("deleted")}</option>
      </select>
      <select
        value={roleFilter}
        onChange={(e) => onRoleFilterChange(e.target.value as "store_manager" | "admin" | "")}
        className="w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-medium text-[#344054] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 lg:w-[160px]"
        aria-label="회원 관계/운영 정보"
      >
        <option value="">관계 전체</option>
        <option value="store_manager">{MEMBER_ADMIN_COPY.store_ops}</option>
        <option value="admin">{MEMBER_ADMIN_COPY.privilege_admin}</option>
      </select>
      <button type="submit" className={`${ADMIN_USERS_LITE_BTN_PRIMARY} w-full lg:w-auto`} disabled={loading}>
        {loading ? "검색 중…" : "검색"}
      </button>
    </form>
  );
}
