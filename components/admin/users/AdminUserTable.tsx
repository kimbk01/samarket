"use client";

import { forwardRef, memo, useCallback, useEffect, useId, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  adminMemberNicknameSecondary,
  authEvidenceBadges,
} from "@/lib/admin-users/admin-member-identity";
import {
  memberStoresAdminHref,
  memberStorePublicHref,
} from "@/lib/admin-users/member-deep-links";
import { getPermissionLabel } from "@/lib/admin-users/admin-permissions";
import { ADMIN_USERS_LITE_TABLE_ACTION } from "@/lib/ui/admin-users-lite-styles";
import type { AdminStaff } from "@/lib/types/admin-staff";
import { AdminUserListPagination } from "./AdminUserListPagination";
import {
  displayNameForAdminUser,
  formatAdminLiteDate,
  formatAdminLiteDateTime,
  memberRoleBadgeClass,
  publicIdForAdminUser,
  roleBadgesForAdminUser,
  statusBadgeClass,
  statusCategoryForAdminUser,
} from "./admin-user-lite-display";
import type { AdminMemberRoleBadge, AdminUser } from "@/lib/types/admin-user";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

export type AdminUserTableVariant = "all" | "store" | "admin";

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
  onEditPermissions?: (userId: string) => void;
  variant: AdminUserTableVariant;
  staffByUserId?: Map<string, AdminStaff>;
  isMaster?: boolean;
  onHorizontalScroll?: React.UIEventHandler<HTMLDivElement>;
}

const ROLE_BADGE_LABEL_KEYS: Record<AdminMemberRoleBadge, MessageKey> = {
  member: "admin_users_role_badge_member",
  store_owner: "admin_users_role_badge_store_owner",
  admin: "admin_users_lite_role_admin",
  super_admin: "admin_users_lite_role_super_admin",
};

const STATUS_LABEL_KEYS = {
  active: "admin_users_lite_status_active",
  needs_review: "admin_users_lite_status_needs_review",
  suspended: "admin_users_lite_status_suspended",
  deleted: "admin_users_lite_status_deleted",
} as const;

const EVIDENCE_LABEL_KEYS = {
  email: "admin_users_lite_email_verified",
  phone: "admin_users_lite_label_phone_verified",
  kakao: "admin_user_provider_kakao",
  google: "admin_user_provider_google",
  apple: "admin_user_provider_apple",
} as const;

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

function RoleBadges({ user }: { user: AdminUser }) {
  const { t } = useI18n();
  const badges = roleBadgesForAdminUser(user);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {badges.map((badge) => (
        <span
          key={badge}
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${memberRoleBadgeClass(badge)}`}
        >
          {t(ROLE_BADGE_LABEL_KEYS[badge])}
        </span>
      ))}
    </span>
  );
}

function stopRowNav(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function RowMenu({
  user,
  onEditMember,
  onSendMessage,
  onEditPermissions,
  isMaster,
}: {
  user: AdminUser;
  onEditMember: (user: AdminUser) => void;
  onSendMessage: (user: AdminUser) => void;
  onEditPermissions?: (userId: string) => void;
  isMaster?: boolean;
}) {
  const { t, safeT } = useI18n();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const stores = user.storeRelation?.stores ?? [];
  const storeSlug = stores.find((s) => s.slug)?.slug ?? "";
  const isAdmin = Boolean(user.hasAdminMembership || user.isSuperAdmin);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest(`[data-row-menu="${menuId}"]`)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId, open]);

  return (
    <div className="relative" data-row-menu={menuId} onClick={stopRowNav} onKeyDown={stopRowNav}>
      <button
        type="button"
        className={ADMIN_USERS_LITE_TABLE_ACTION}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-md border border-[#e4e7ec] bg-white py-1 text-[13px] shadow-md">
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[#344054] hover:bg-[#f9fafb]"
            onClick={() => {
              onSendMessage(user);
              setOpen(false);
            }}
          >
            {t("admin_users_cc_cta_send_note")}
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[#344054] hover:bg-[#f9fafb]"
            onClick={() => {
              onEditMember(user);
              setOpen(false);
            }}
          >
            {t("admin_users_lite_action_edit_info")}
          </button>
          <a
            href={`/admin/users/${encodeURIComponent(user.id)}`}
            className="block px-3 py-1.5 text-left text-[#344054] hover:bg-[#f9fafb]"
          >
            {safeT("admin_users_cta_moderation", { fallbackKo: "제재 관리", fallbackEn: "Moderation" })}
          </a>
          {isAdmin && isMaster && onEditPermissions ? (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[#344054] hover:bg-[#f9fafb]"
              onClick={() => {
                onEditPermissions(user.id);
                setOpen(false);
              }}
            >
              {safeT("admin_users_cta_edit_permissions", { fallbackKo: "권한 관리", fallbackEn: "Edit permissions" })}
            </button>
          ) : null}
          {storeSlug ? (
            <a
              href={memberStorePublicHref(storeSlug)}
              className="block px-3 py-1.5 text-left text-[#344054] hover:bg-[#f9fafb]"
            >
              {safeT("admin_users_cta_store_public", { fallbackKo: "매장 보기", fallbackEn: "View store" })}
            </a>
          ) : stores[0]?.name ? (
            <a
              href={memberStoresAdminHref(stores[0]?.name)}
              className="block px-3 py-1.5 text-left text-[#344054] hover:bg-[#f9fafb]"
            >
              {safeT("admin_users_cta_store_public", { fallbackKo: "매장 보기", fallbackEn: "View store" })}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const AdminUserTableRow = memo(function AdminUserTableRow({
  user,
  onViewDetail,
  onEditMember,
  onSendMessage,
  onEditPermissions,
  variant,
  staff,
  isMaster,
}: {
  user: AdminUser;
  onViewDetail: (user: AdminUser) => void;
  onEditMember: (user: AdminUser) => void;
  onSendMessage: (user: AdminUser) => void;
  onEditPermissions?: (userId: string) => void;
  variant: AdminUserTableVariant;
  staff?: AdminStaff;
  isMaster?: boolean;
}) {
  const { t, safeT, language } = useI18n();
  const emptyCell = t("admin_users_empty_placeholder");
  const dateLocale = dateLocaleTag(language);
  const publicId = publicIdForAdminUser(user);
  const display = displayNameForAdminUser(user);
  const nick = adminMemberNicknameSecondary(display, user.nickname);
  const status = statusCategoryForAdminUser(user);
  const handleViewDetail = useCallback(() => onViewDetail(user), [onViewDetail, user]);
  const initial = display.trim().slice(0, 1).toUpperCase() || "?";
  const stores = user.storeRelation?.stores ?? [];
  const primaryStore = stores[0];
  const evidence = authEvidenceBadges(user);
  const permSummary = staff
    ? staff.permissions.slice(0, 4).map(getPermissionLabel).join(", ")
    : emptyCell;

  return (
    <tr
      className="cursor-pointer border-b border-[#eaecf0] bg-white text-[13px] hover:bg-[#f8fafc]"
      onClick={handleViewDetail}
    >
      <td className="min-w-[180px] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-xs font-bold text-[#2563eb]">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#101828]">{display}</p>
            {nick ? <p className="truncate text-[11px] text-[#667085]">{nick}</p> : null}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-medium text-[#344054]">{publicId || emptyCell}</td>
      {variant === "admin" ? (
        <td className="px-3 py-2 text-[#475467]">{user.email?.trim() || t("admin_users_lite_no_email")}</td>
      ) : (
        <td className="px-3 py-2 text-[#475467]">
          <p>{user.phone?.trim() || emptyCell}</p>
          <p className="text-[11px] text-[#667085]">{user.email?.trim() || t("admin_users_lite_no_email")}</p>
        </td>
      )}
      {variant !== "admin" ? (
        <td className="whitespace-nowrap px-3 py-2 text-[#475467]">{user.location?.trim() || emptyCell}</td>
      ) : null}
      {variant === "store" ? (
        <>
          <td className="px-3 py-2">
            <p className="font-medium text-[#101828]">{primaryStore?.name || emptyCell}</p>
            <p className="text-[11px] text-[#667085]">{primaryStore?.slug ? `@${primaryStore.slug}` : emptyCell}</p>
          </td>
          <td className="whitespace-nowrap px-3 py-2">
            <span className="inline-flex rounded-full border border-[#e4e7ec] bg-[#f9fafb] px-2 py-0.5 text-[11px] font-semibold text-[#344054]">
              {primaryStore?.approvalStatus || emptyCell}
            </span>
          </td>
        </>
      ) : null}
      {variant === "all" ? (
        <>
          <td className="whitespace-nowrap px-3 py-2">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
              {t(STATUS_LABEL_KEYS[status])}
            </span>
          </td>
          <td className="px-3 py-2">
            <span className="inline-flex flex-wrap gap-1">
              {evidence.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex rounded border border-[#e4e7ec] bg-[#f9fafb] px-1.5 py-0.5 text-[10px] font-semibold text-[#344054]"
                >
                  {t(EVIDENCE_LABEL_KEYS[badge])}
                </span>
              ))}
              {evidence.length === 0 ? emptyCell : null}
            </span>
          </td>
          <td className="px-3 py-2">
            <RoleBadges user={user} />
          </td>
        </>
      ) : null}
      {variant === "admin" ? (
        <>
          <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums text-[#475467]">
            {formatAdminLiteDateTime(user.lastSignInAt, dateLocale, emptyCell)}
          </td>
          <td className="whitespace-nowrap px-3 py-2 text-[#344054]">
            {staff?.role
              ? t(
                  staff.role === "master"
                    ? "admin_users_role_master"
                    : staff.role === "manager"
                      ? "admin_users_role_manager"
                      : "admin_users_role_operator",
                )
              : user.isSuperAdmin
                ? t("admin_users_lite_role_super_admin")
                : t("admin_users_lite_role_admin")}
          </td>
          <td className="whitespace-nowrap px-3 py-2">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
              {t(STATUS_LABEL_KEYS[status])}
            </span>
          </td>
          <td className="max-w-[220px] px-3 py-2 text-[12px] text-[#667085]">
            <span className="line-clamp-2">{permSummary || emptyCell}</span>
          </td>
        </>
      ) : (
        <>
          <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums text-[#475467]">
            {formatAdminLiteDate(user.joinedAt, dateLocale, emptyCell)}
          </td>
          <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums text-[#475467]">
            {formatAdminLiteDateTime(user.lastSignInAt, dateLocale, emptyCell)}
          </td>
        </>
      )}
      <td className="whitespace-nowrap px-3 py-2" onClick={stopRowNav}>
        <div className="flex items-center gap-1">
          <button type="button" className={ADMIN_USERS_LITE_TABLE_ACTION} onClick={handleViewDetail}>
            {t("admin_users_action_detail")}
          </button>
          {variant === "admin" && isMaster && onEditPermissions ? (
            <button
              type="button"
              className={ADMIN_USERS_LITE_TABLE_ACTION}
              onClick={() => onEditPermissions(user.id)}
            >
              {safeT("admin_users_cta_edit_permissions", { fallbackKo: "권한 편집", fallbackEn: "Edit permissions" })}
            </button>
          ) : (
            <RowMenu
              user={user}
              onEditMember={onEditMember}
              onSendMessage={onSendMessage}
              onEditPermissions={onEditPermissions}
              isMaster={isMaster}
            />
          )}
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
    onEditPermissions,
    variant,
    staffByUserId,
    isMaster,
    onHorizontalScroll,
  },
  ref,
) {
  const { t, safeT } = useI18n();
  return (
    <div
      ref={ref}
      onScroll={onHorizontalScroll}
      className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-visible rounded-lg border border-[#e4e7ec] bg-white"
    >
      <table className="min-w-[1100px] w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-[#eaecf0] bg-[#f8fafc] text-left text-[11px] font-semibold uppercase tracking-wide text-[#475467]">
            <th className="px-3 py-2">{t("admin_users_lite_col_member")}</th>
            <th className="px-3 py-2">{safeT("admin_users_col_member_id", { fallbackKo: "회원 ID", fallbackEn: "Member ID" })}</th>
            {variant === "admin" ? (
              <th className="px-3 py-2">{t("admin_users_col_email")}</th>
            ) : (
              <th className="px-3 py-2">{safeT("admin_users_col_contact", { fallbackKo: "연락처", fallbackEn: "Contact" })}</th>
            )}
            {variant !== "admin" ? <th className="px-3 py-2">{t("admin_users_col_region")}</th> : null}
            {variant === "store" ? (
              <>
                <th className="px-3 py-2">{t("admin_users_store_col_store_name")}</th>
                <th className="px-3 py-2">{t("admin_users_store_col_store_status")}</th>
              </>
            ) : null}
            {variant === "all" ? (
              <>
                <th className="px-3 py-2">{t("admin_users_col_member_status")}</th>
                <th className="px-3 py-2">{safeT("admin_users_col_auth", { fallbackKo: "인증", fallbackEn: "Auth" })}</th>
                <th className="px-3 py-2">{safeT("admin_users_col_relation", { fallbackKo: "관계", fallbackEn: "Relations" })}</th>
              </>
            ) : null}
            {variant === "admin" ? (
              <>
                <th className="px-3 py-2">{t("admin_users_col_last_login")}</th>
                <th className="px-3 py-2">{safeT("admin_users_col_admin_role", { fallbackKo: "Admin Role", fallbackEn: "Admin Role" })}</th>
                <th className="px-3 py-2">{t("admin_users_lite_col_status")}</th>
                <th className="px-3 py-2">{safeT("admin_users_col_perm_summary", { fallbackKo: "권한 요약", fallbackEn: "Permissions" })}</th>
              </>
            ) : (
              <>
                <th className="px-3 py-2">{t("admin_users_col_joined")}</th>
                <th className="px-3 py-2">{t("admin_users_col_last_login")}</th>
              </>
            )}
            <th className="px-3 py-2">{t("admin_users_col_actions")}</th>
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
              onEditPermissions={onEditPermissions}
              variant={variant}
              staff={staffByUserId?.get(u.id)}
              isMaster={isMaster}
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
