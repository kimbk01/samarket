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
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import type { AdminUserStatusCategory } from "@/lib/types/admin-user";

interface AdminUserFilterBarProps {
  searchDraft: string;
  onSearchDraftChange: (q: string) => void;
  onSearchSubmit: () => void;
  onSearchClear: () => void;
  /** 필터가 걸려 있을 때만 — 검색어·필터·정렬을 기본값으로 */
  onReset?: () => void;
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
  "h-10 w-[132px] shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-sm font-medium text-sam-fg outline-none focus:border-sam-primary focus:ring-2 focus:ring-sam-primary/20";

const dateClass =
  "h-10 w-[138px] shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-sm font-medium text-sam-fg outline-none focus:border-sam-primary focus:ring-2 focus:ring-sam-primary/20";

export function AdminUserFilterBar({
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
  onSearchClear,
  onReset,
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
  const { language } = useI18n();
  const ko = language !== "en";
  return (
    <form
      className={`${ADMIN_USERS_LITE_CARD} flex w-full min-w-0 items-center gap-2 overflow-x-auto p-2.5`}
      onSubmit={(e) => {
        e.preventDefault();
        onSearchSubmit();
      }}
      data-member-list-filter-bar="1"
      data-member-list-filter-layout="single-row"
      data-member-list-filter-axes="status,verify,store,privilege,origin,joined,sort"
    >
      <div className="relative min-w-[200px] max-w-md flex-1 basis-[220px]">
        <input
          type="search"
          placeholder={MEMBER_LIST_SEARCH_PLACEHOLDER_KO}
          value={searchDraft}
          onChange={(e) => onSearchDraftChange(e.target.value)}
          className="h-10 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 pr-10 text-sm text-sam-fg outline-none placeholder:text-sam-meta focus:border-sam-primary focus:ring-2 focus:ring-sam-primary/20"
          aria-label={MEMBER_LIST_SEARCH_PLACEHOLDER_KO}
          data-member-list-search="1"
        />
        {searchDraft ? (
          <AdminActionButton
            variant="quiet"
            size="sm"
            onClick={onSearchClear}
            className="absolute right-1 top-1/2 !h-8 -translate-y-1/2 !px-1.5 !no-underline"
            aria-label={ko ? "검색어 지우기" : "Clear search text"}
            data-member-list-search-clear="1"
          >
            ✕
          </AdminActionButton>
        ) : null}
      </div>
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
      <input
        type="date"
        value={joinedFrom}
        onChange={(e) => onJoinedFromChange(e.target.value)}
        className={dateClass}
        aria-label="가입일 시작"
        data-member-list-filter="joinedFrom"
      />
      <input
        type="date"
        value={joinedTo}
        onChange={(e) => onJoinedToChange(e.target.value)}
        className={dateClass}
        aria-label="가입일 종료"
        data-member-list-filter="joinedTo"
      />
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
      <div className="ml-auto flex shrink-0 items-center gap-2" data-admin-filter-actions="1">
        {onReset ? (
          <AdminActionButton variant="secondary" onClick={onReset} disabled={loading} data-member-list-filter-reset="1">
            {adminCta("reset", ko)}
          </AdminActionButton>
        ) : null}
        <AdminActionButton
          type="submit"
          variant="primary"
          className="shrink-0"
          disabled={loading}
          data-member-list-search-submit="1"
        >
          {adminCta("search", ko)}
        </AdminActionButton>
      </div>
    </form>
  );
}
