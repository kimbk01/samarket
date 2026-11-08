"use client";

import {
  MEMBER_LIST_SEARCH_PLACEHOLDER_KEY,
  MEMBER_LIST_STORE_NONE_KEY,
  MEMBER_LIST_VERIFY_DONE_KEY,
  MEMBER_LIST_VERIFY_INCOMPLETE_KEY,
  memberListOriginFilterLabel,
  memberListStatusCategoryLabel,
} from "@/lib/admin-users/member-list-presentation";
import { MEMBER_ADMIN_COPY_KEY } from "@/lib/admin-users/member-admin-copy-ssot";
import type {
  AdminMemberOriginFilter,
  AdminMemberPrivilegeFilter,
  AdminMemberStoreFilter,
  AdminMemberVerifyFilter,
} from "@/lib/admin-users/admin-member-list-query";
import type { MemberListSortId } from "@/lib/admin-users/member-list-presentation";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUserStatusCategory } from "@/lib/types/admin-user";

interface AdminUserFilterBarProps {
  searchDraft: string;
  onSearchDraftChange: (q: string) => void;
  onSearchSubmit: () => void;
  /** 예전 검색어 지우기(✕) — 표준 필터 바는 검색 입력 자체의 지우기를 쓴다. 호환용으로 남김. */
  onSearchClear?: () => void;
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

/** `AdminFilterBar` 입력과 같은 규격 (높이 40 · 글자 16px). */
const selectClass =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]";
const labelClass = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";

/**
 * 회원 목록 필터 — 표준 `AdminFilterBar`(기간=가입일 PHT · 도메인 필터 · 검색어 · [조회]/[초기화]).
 * 주소 키는 회원 목록 계약 그대로(`search`·`status`·`verify`·`store`·`privilege`·`origin`·`joinedFrom`·`joinedTo`·`sort`) —
 * 상태 동기화는 `AdminUserListPage` 가 `buildMemberListQueryString` 으로 한다 (대시보드·빠른 검색 딥링크 호환).
 * 선택 필드·가입일은 바꾸는 즉시 적용, 검색어는 [조회]/Enter.
 */
export function AdminUserFilterBar({
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
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
  const { t, language } = useI18n();
  const ko = language !== "en";
  return (
    <div
      data-member-list-filter-bar="1"
      data-member-list-filter-layout="single-row"
      data-member-list-filter-axes="status,verify,store,privilege,origin,joined,sort"
    >
      <AdminFilterBar
        ko={ko}
        draft={{ q: searchDraft, from: joinedFrom, to: joinedTo }}
        onDraftChange={(patch) => {
          if (patch.q !== undefined) onSearchDraftChange(patch.q);
          if (patch.from !== undefined) onJoinedFromChange(patch.from);
          if (patch.to !== undefined) onJoinedToChange(patch.to);
        }}
        onSubmit={onSearchSubmit}
        onReset={onReset ?? (() => undefined)}
        pending={loading}
        searchPlaceholder={t(MEMBER_LIST_SEARCH_PLACEHOLDER_KEY)}
      >
        <label className={labelClass}>
          {t("admin_users_account_state")}
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as AdminUserStatusCategory | "")}
            className={selectClass}
            data-member-list-filter="status"
          >
            <option value="">{t("common_all")}</option>
            <option value="active">{memberListStatusCategoryLabel("active", language)}</option>
            <option value="suspended">{memberListStatusCategoryLabel("suspended", language)}</option>
            <option value="blocked">{memberListStatusCategoryLabel("blocked", language)}</option>
            <option value="deleted">{memberListStatusCategoryLabel("deleted", language)}</option>
          </select>
        </label>
        <label className={labelClass}>
          {t("admin_users_auth_verify")}
          <select
            value={verifyFilter}
            onChange={(e) => onVerifyFilterChange(e.target.value as AdminMemberVerifyFilter | "")}
            className={selectClass}
            data-member-list-filter="verify"
          >
            <option value="">{t("common_all")}</option>
            <option value="verified">{t(MEMBER_LIST_VERIFY_DONE_KEY)}</option>
            <option value="unverified">{t(MEMBER_LIST_VERIFY_INCOMPLETE_KEY)}</option>
          </select>
        </label>
        <label className={labelClass}>
          {t("common_store")}
          <select
            value={storeFilter}
            onChange={(e) => onStoreFilterChange(e.target.value as AdminMemberStoreFilter | "")}
            className={selectClass}
            data-member-list-filter="store"
          >
            <option value="">{t("common_all")}</option>
            <option value="has_store">{t(MEMBER_ADMIN_COPY_KEY.store_ops)}</option>
            <option value="no_store">{t(MEMBER_LIST_STORE_NONE_KEY)}</option>
          </select>
        </label>
        <label className={labelClass}>
          {t("admin_users_admin_privilege")}
          <select
            value={privilegeFilter}
            onChange={(e) => onPrivilegeFilterChange(e.target.value as AdminMemberPrivilegeFilter | "")}
            className={selectClass}
            data-member-list-filter="privilege"
          >
            <option value="">{t("common_all")}</option>
            <option value="admin">{t(MEMBER_ADMIN_COPY_KEY.privilege_admin)}</option>
            <option value="member">{t(MEMBER_ADMIN_COPY_KEY.privilege_member)}</option>
          </select>
        </label>
        <label className={labelClass}>
          {t("admin_users_sign_up_method")}
          <select
            value={originFilter}
            onChange={(e) => onOriginFilterChange(e.target.value as AdminMemberOriginFilter | "")}
            className={selectClass}
            data-member-list-filter="origin"
          >
            <option value="">{t("common_all")}</option>
            <option value="email">{memberListOriginFilterLabel("email", language)}</option>
            <option value="manual">{memberListOriginFilterLabel("manual", language)}</option>
            <option value="kakao">{memberListOriginFilterLabel("kakao", language)}</option>
            <option value="google">{memberListOriginFilterLabel("google", language)}</option>
            <option value="apple">{memberListOriginFilterLabel("apple", language)}</option>
            <option value="other">{memberListOriginFilterLabel("other", language)}</option>
          </select>
        </label>
        <label className={labelClass}>
          {t("common_sort")}
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as MemberListSortId)}
            className={selectClass}
            data-member-list-filter="sort"
          >
            <option value="created_at_desc">{t("admin_users_filter_sort_joined_desc")}</option>
            <option value="created_at_asc">{t("admin_users_filter_sort_joined_asc")}</option>
            <option value="last_login_desc">{t("admin_users_filter_sort_last_login_desc")}</option>
            <option value="last_login_asc">{t("admin_users_filter_sort_last_login_asc")}</option>
          </select>
        </label>
      </AdminFilterBar>
    </div>
  );
}
