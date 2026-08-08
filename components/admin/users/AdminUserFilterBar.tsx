"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_USERS_LITE_BTN_PRIMARY,
  ADMIN_USERS_LITE_CARD,
} from "@/lib/ui/admin-users-lite-styles";
import type { AdminAccountCategory, AdminUserStatusCategory } from "@/lib/types/admin-user";

interface AdminUserFilterBarProps {
  searchDraft: string;
  onSearchDraftChange: (q: string) => void;
  onSearchSubmit: () => void;
  roleFilter: AdminAccountCategory | "";
  onRoleFilterChange: (value: AdminAccountCategory | "") => void;
  hideRoleFilter?: boolean;
  statusFilter: AdminUserStatusCategory | "";
  onStatusFilterChange: (value: AdminUserStatusCategory | "") => void;
}

export function AdminUserFilterBar({
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
  roleFilter,
  onRoleFilterChange,
  hideRoleFilter = false,
  statusFilter,
  onStatusFilterChange,
}: AdminUserFilterBarProps) {
  const { t } = useI18n();

  return (
    <form
      className={`${ADMIN_USERS_LITE_CARD} flex w-full min-w-0 flex-col gap-3 p-3 lg:flex-row lg:items-center`}
      onSubmit={(e) => {
        e.preventDefault();
        onSearchSubmit();
      }}
    >
      <input
        type="search"
        placeholder={t("admin_users_lite_search_placeholder")}
        value={searchDraft}
        onChange={(e) => onSearchDraftChange(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm text-[#101828] outline-none placeholder:text-[#98a2b3] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
      />
      {!hideRoleFilter ? (
        <select
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value as AdminAccountCategory | "")}
          className="w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-medium text-[#344054] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 lg:w-[160px]"
        >
          <option value="">{t("admin_users_lite_role_all")}</option>
          <option value="member">{t("admin_users_lite_role_member")}</option>
          <option value="store_manager">{t("admin_users_lite_role_store_manager")}</option>
          <option value="admin">{t("admin_users_lite_role_admin")}</option>
        </select>
      ) : null}
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as AdminUserStatusCategory | "")}
        className="w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-medium text-[#344054] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 lg:w-[160px]"
      >
        <option value="">{t("admin_users_lite_status_all")}</option>
        <option value="active">{t("admin_users_lite_status_active")}</option>
        <option value="needs_review">{t("admin_users_lite_status_needs_review")}</option>
        <option value="suspended">{t("admin_users_lite_status_suspended")}</option>
        <option value="deleted">{t("admin_users_lite_status_deleted")}</option>
      </select>
      <button type="submit" className={`${ADMIN_USERS_LITE_BTN_PRIMARY} w-full lg:w-auto`}>
        {t("common_search")}
      </button>
    </form>
  );
}
