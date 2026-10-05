"use client";

import {
  MEMBER_LIST_SEARCH_PLACEHOLDER_KO,
  MEMBER_LIST_STORE_NONE_KO,
  MEMBER_LIST_VERIFY_DONE_KO,
  MEMBER_LIST_VERIFY_INCOMPLETE_KO,
  memberListOriginFilterLabelKo,
  memberListStatusCategoryLabelKo,
} from "@/lib/admin-users/member-list-presentation";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import type {
  AdminMemberOriginFilter,
  AdminMemberPrivilegeFilter,
  AdminMemberStoreFilter,
  AdminMemberVerifyFilter,
} from "@/lib/admin-users/admin-member-list-query";
import type { MemberListSortId } from "@/lib/admin-users/member-list-presentation";
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
  verifyFilter: AdminMemberVerifyFilter | "";
  onVerifyFilterChange: (value: AdminMemberVerifyFilter | "") => void;
  storeFilter: AdminMemberStoreFilter | "";
  onStoreFilterChange: (value: AdminMemberStoreFilter | "") => void;
  privilegeFilter: AdminMemberPrivilegeFilter | "";
  onPrivilegeFilterChange: (value: AdminMemberPrivilegeFilter | "") => void;
  originFilter: AdminMemberOriginFilter | "";
  onOriginFilterChange: (value: AdminMemberOriginFilter | "") => void;
  joinedFrom: string;
  onJoinedFromChange: (value: string) => void;
  joinedTo: string;
  onJoinedToChange: (value: string) => void;
  sort: MemberListSortId;
  onSortChange: (value: MemberListSortId) => void;
  loading?: boolean;
}

const selectClass =
  "w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-medium text-[#344054] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 lg:w-[148px]";

export function AdminUserFilterBar({
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
  onSearchClear,
  statusFilter,
  onStatusFilterChange,
  verifyFilter,
  onVerifyFilterChange,
  storeFilter,
  onStoreFilterChange,
  privilegeFilter,
  onPrivilegeFilterChange,
  originFilter,
  onOriginFilterChange,
  joinedFrom,
  onJoinedFromChange,
  joinedTo,
  onJoinedToChange,
  sort,
  onSortChange,
  loading = false,
}: AdminUserFilterBarProps) {
  return (
    <form
      className={`${ADMIN_USERS_LITE_CARD} flex w-full min-w-0 flex-col gap-3 p-3`}
      onSubmit={(e) => {
        e.preventDefault();
        onSearchSubmit();
      }}
      data-member-list-filter-bar="1"
      data-member-list-filter-axes="status,verify,store,privilege,origin,joined,sort"
    >
      <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            placeholder={MEMBER_LIST_SEARCH_PLACEHOLDER_KO}
            value={searchDraft}
            onChange={(e) => onSearchDraftChange(e.target.value)}
            className="w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2.5 pr-10 text-sm text-[#101828] outline-none placeholder:text-[#98a2b3] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            aria-label={MEMBER_LIST_SEARCH_PLACEHOLDER_KO}
            data-member-list-search="1"
          />
          {searchDraft ? (
            <button
              type="button"
              onClick={onSearchClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-[12px] font-semibold text-[#667085] hover:bg-[#f2f4f7]"
              aria-label="검색 초기화"
              data-member-list-search-clear="1"
            >
              ✕
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          className={`${ADMIN_USERS_LITE_BTN_PRIMARY} w-full lg:w-auto`}
          disabled={loading}
          data-member-list-search-submit="1"
        >
          {loading ? "검색 중…" : "검색"}
        </button>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:items-center">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as AdminUserStatusCategory | "")}
          className={selectClass}
          aria-label="계정 상태"
          data-member-list-filter="status"
        >
          <option value="">계정 상태 전체</option>
          <option value="active">{memberListStatusCategoryLabelKo("active")}</option>
          <option value="suspended">{memberListStatusCategoryLabelKo("suspended")}</option>
          <option value="blocked">{memberListStatusCategoryLabelKo("blocked")}</option>
          <option value="deleted">{memberListStatusCategoryLabelKo("deleted")}</option>
        </select>
        <select
          value={verifyFilter}
          onChange={(e) => onVerifyFilterChange(e.target.value as AdminMemberVerifyFilter | "")}
          className={selectClass}
          aria-label="인증"
          data-member-list-filter="verify"
        >
          <option value="">인증 전체</option>
          <option value="verified">{MEMBER_LIST_VERIFY_DONE_KO}</option>
          <option value="unverified">{MEMBER_LIST_VERIFY_INCOMPLETE_KO}</option>
        </select>
        <select
          value={storeFilter}
          onChange={(e) => onStoreFilterChange(e.target.value as AdminMemberStoreFilter | "")}
          className={selectClass}
          aria-label="매장"
          data-member-list-filter="store"
        >
          <option value="">매장 전체</option>
          <option value="has_store">{MEMBER_ADMIN_COPY.store_ops}</option>
          <option value="no_store">{MEMBER_LIST_STORE_NONE_KO}</option>
        </select>
        <select
          value={privilegeFilter}
          onChange={(e) => onPrivilegeFilterChange(e.target.value as AdminMemberPrivilegeFilter | "")}
          className={selectClass}
          aria-label="관리 권한"
          data-member-list-filter="privilege"
        >
          <option value="">관리 권한 전체</option>
          <option value="admin">{MEMBER_ADMIN_COPY.privilege_admin}</option>
          <option value="member">{MEMBER_ADMIN_COPY.privilege_member}</option>
        </select>
        <select
          value={originFilter}
          onChange={(e) => onOriginFilterChange(e.target.value as AdminMemberOriginFilter | "")}
          className={selectClass}
          aria-label="가입 방식"
          data-member-list-filter="origin"
        >
          <option value="">가입 방식 전체</option>
          <option value="email">{memberListOriginFilterLabelKo("email")}</option>
          <option value="manual">{memberListOriginFilterLabelKo("manual")}</option>
          <option value="kakao">{memberListOriginFilterLabelKo("kakao")}</option>
          <option value="other">{memberListOriginFilterLabelKo("other")}</option>
        </select>
        <label className="flex w-full flex-col gap-1 text-[11px] font-semibold text-[#667085] sm:w-auto">
          가입일 시작
          <input
            type="date"
            value={joinedFrom}
            onChange={(e) => onJoinedFromChange(e.target.value)}
            className={selectClass}
            data-member-list-filter="joinedFrom"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-[11px] font-semibold text-[#667085] sm:w-auto">
          가입일 종료
          <input
            type="date"
            value={joinedTo}
            onChange={(e) => onJoinedToChange(e.target.value)}
            className={selectClass}
            data-member-list-filter="joinedTo"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as MemberListSortId)}
          className={selectClass}
          aria-label="정렬"
          data-member-list-filter="sort"
        >
          <option value="created_at_desc">가입일 ↓</option>
          <option value="created_at_asc">가입일 ↑</option>
          <option value="last_login_desc">최근 로그인 ↓</option>
          <option value="last_login_asc">최근 로그인 ↑</option>
        </select>
      </div>
    </form>
  );
}
