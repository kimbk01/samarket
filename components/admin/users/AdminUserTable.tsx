"use client";

import { forwardRef, memo, useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ADMIN_USERS_LITE_TABLE_ACTION } from "@/lib/ui/admin-users-lite-styles";
import { AdminUserListPagination } from "./AdminUserListPagination";
import { AdminUserProviderIcon } from "./AdminUserProviderIcon";
import {
  formatAdminLiteDate,
  publicIdForAdminUser,
  roleBadgeClass,
  roleCategoryForAdminUser,
  roleRowClass,
  statusBadgeClass,
  statusCategoryForAdminUser,
} from "./admin-user-lite-display";
import type { AdminAccountCategory, AdminAuthProvider, AdminUser } from "@/lib/types/admin-user";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

interface AdminUserTableProps {
  users: AdminUser[];
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onViewDetail: (user: AdminUser) => void;
  onEditMember: (user: AdminUser) => void;
  onSendMessage: (user: AdminUser) => void;
  onHorizontalScroll?: React.UIEventHandler<HTMLDivElement>;
}

const PROVIDER_LABEL_KEYS: Record<AdminAuthProvider, MessageKey> = {
  google: "admin_user_provider_google",
  kakao: "admin_user_provider_kakao",
  naver: "admin_user_provider_naver",
  apple: "admin_user_provider_apple",
  facebook: "admin_user_provider_facebook",
  email: "admin_user_provider_email",
  manual: "admin_user_provider_manual",
  unknown: "admin_user_provider_unknown",
};

const ROLE_LABEL_KEYS: Record<AdminAccountCategory, MessageKey> = {
  member: "admin_users_lite_role_member",
  store_manager: "admin_users_lite_role_store_manager",
  admin: "admin_users_lite_role_admin",
};

const STATUS_LABEL_KEYS = {
  active: "admin_users_lite_status_active",
  needs_review: "admin_users_lite_status_needs_review",
  suspended: "admin_users_lite_status_suspended",
  deleted: "admin_users_lite_status_deleted",
} as const;

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

function roleLabelKeyForUser(user: AdminUser): MessageKey {
  const role = String(user.profileRole ?? "").trim().toLowerCase();
  if (role === "super_admin" || role === "master") return "admin_users_lite_role_super_admin";
  return ROLE_LABEL_KEYS[roleCategoryForAdminUser(user)];
}

const AdminUserTableRow = memo(function AdminUserTableRow({
  user,
  onViewDetail,
  onEditMember,
  onSendMessage,
}: {
  user: AdminUser;
  onViewDetail: (user: AdminUser) => void;
  onEditMember: (user: AdminUser) => void;
  onSendMessage: (user: AdminUser) => void;
}) {
  const { t, language } = useI18n();
  const emptyCell = t("admin_users_empty_placeholder");
  const dateLocale = dateLocaleTag(language);
  const provider = user.authProvider ?? "unknown";
  const publicId = publicIdForAdminUser(user);
  const role = roleCategoryForAdminUser(user);
  const status = statusCategoryForAdminUser(user);
  const handleEdit = useCallback(() => onEditMember(user), [onEditMember, user]);
  const handleViewDetail = useCallback(() => onViewDetail(user), [onViewDetail, user]);
  const handleSendMessage = useCallback(() => onSendMessage(user), [onSendMessage, user]);
  const initial = (user.displayName ?? user.nickname ?? "?").trim().slice(0, 1).toUpperCase() || "?";
  const rowClass = roleRowClass(role);

  return (
    <tr className={`border-b border-[#eaecf0] transition ${rowClass}`}>
      <td className="min-w-[220px] px-4 py-3.5">
        <button
          type="button"
          onClick={handleViewDetail}
          className="flex w-full items-center gap-3 text-left transition hover:opacity-90"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-sm font-bold text-[#2563eb]">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#101828]">{user.displayName ?? user.nickname}</p>
            <p className="mt-0.5 truncate text-xs text-[#667085]">{publicId || emptyCell}</p>
          </div>
        </button>
      </td>
      <td className="min-w-[200px] px-4 py-3.5 text-sm text-[#475467]">
        {user.email?.trim() || t("admin_users_lite_no_email")}
      </td>
      <td className="whitespace-nowrap px-4 py-3.5">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#344054]">
          <AdminUserProviderIcon provider={provider} />
          {t(PROVIDER_LABEL_KEYS[provider] ?? PROVIDER_LABEL_KEYS.unknown)}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleBadgeClass(role)}`}>
          {t(roleLabelKeyForUser(user))}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}>
          {t(STATUS_LABEL_KEYS[status])}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-[#475467]">
        {formatAdminLiteDate(user.joinedAt, dateLocale, emptyCell)}
      </td>
      <td className="min-w-[280px] whitespace-nowrap px-4 py-3.5">
        <div className="flex flex-nowrap items-center gap-1">
          <button type="button" className={ADMIN_USERS_LITE_TABLE_ACTION} onClick={handleViewDetail}>
            {t("admin_users_action_detail")}
          </button>
          <button type="button" className={ADMIN_USERS_LITE_TABLE_ACTION} onClick={handleEdit}>
            {t("admin_users_action_edit")}
          </button>
          <button type="button" disabled className={ADMIN_USERS_LITE_TABLE_ACTION} title={t("admin_users_lite_action_todo")}>
            {t("admin_users_lite_action_notify")}
          </button>
          <button type="button" className={ADMIN_USERS_LITE_TABLE_ACTION} onClick={handleSendMessage}>
            {t("admin_users_lite_action_message")}
          </button>
          <button type="button" disabled className={ADMIN_USERS_LITE_TABLE_ACTION} title={t("admin_users_lite_action_todo")}>
            {t("admin_users_lite_action_suspend")}
          </button>
        </div>
      </td>
    </tr>
  );
});

AdminUserTableRow.displayName = "AdminUserTableRow";

export const AdminUserTable = forwardRef<HTMLDivElement, AdminUserTableProps>(function AdminUserTable(
  {
    users,
    totalItems,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onViewDetail,
    onEditMember,
    onSendMessage,
    onHorizontalScroll,
  },
  ref,
) {
  const { t } = useI18n();
  return (
    <div
      ref={ref}
      onScroll={onHorizontalScroll}
      className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-visible rounded-xl border border-[#e4e7ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
    >
      <table className="min-w-[1080px] w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#eaecf0] bg-[#f9fafb] text-left text-xs font-semibold text-[#475467]">
            <th className="px-4 py-3">{t("admin_users_lite_col_member")}</th>
            <th className="px-4 py-3">{t("admin_users_col_email")}</th>
            <th className="px-4 py-3">{t("admin_users_col_provider")}</th>
            <th className="px-4 py-3">{t("admin_users_lite_col_role")}</th>
            <th className="px-4 py-3">{t("admin_users_lite_col_status")}</th>
            <th className="px-4 py-3">{t("admin_users_col_joined")}</th>
            <th className="px-4 py-3">{t("admin_users_col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <AdminUserTableRow
              key={u.id}
              user={u}
              onViewDetail={onViewDetail}
              onEditMember={onEditMember}
              onSendMessage={onSendMessage}
            />
          ))}
        </tbody>
      </table>
      <AdminUserListPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
});
