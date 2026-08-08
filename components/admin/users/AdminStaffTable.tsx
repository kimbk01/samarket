"use client";

import { forwardRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminStaff } from "@/lib/types/admin-staff";
import { getPermissionLabel } from "@/lib/admin-users/admin-permissions";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

const ROLE_LABEL_KEYS: Record<AdminStaff["role"], MessageKey> = {
  operator: "admin_users_role_operator",
  manager: "admin_users_role_manager",
  master: "admin_users_role_master",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

interface AdminStaffTableProps {
  staffList: AdminStaff[];
  /** 최고관리자일 때만 수정 버튼 노출 */
  isMaster?: boolean;
  onEdit?: (staffId: string) => void;
  /** 가로 스크롤 동기화·측정용 (하단 고정 스크롤바) */
  onHorizontalScroll?: React.UIEventHandler<HTMLDivElement>;
}

export const AdminStaffTable = forwardRef<HTMLDivElement, AdminStaffTableProps>(function AdminStaffTable(
  { staffList, isMaster, onEdit, onHorizontalScroll },
  ref
) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);

  return (
    <div
      ref={ref}
      onScroll={onHorizontalScroll}
      className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-visible rounded-ui-rect border border-sam-border bg-sam-surface [-webkit-overflow-scrolling:touch] [scroll-padding-inline-end:1.25rem]"
    >
      <table className="w-full min-w-[1180px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_login_id")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_name")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_role")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_admin_tier")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_permissions")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_created")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_created_by")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_users_staff_col_last_login")}</th>
            {isMaster && onEdit && (
              <th className="w-[72px] px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_users_staff_col_actions")}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {staffList.map((s) => (
            <tr key={s.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {s.role === "master" && !s.loginId.includes("@") ? `@${s.loginId}` : s.loginId}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{s.displayName}</td>
              <td className="px-3 py-2.5">
                <span className={`rounded px-2 py-0.5 sam-text-body-secondary font-semibold ${s.role === "master" ? "bg-violet-100 text-violet-800" : "bg-sam-surface-muted text-sam-fg"}`}>
                  {t(ROLE_LABEL_KEYS[s.role])}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{s.adminTier || "-"}</td>
              <td className="max-w-[280px] px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                <span className="line-clamp-2">
                  {s.permissions.length === 0
                    ? "-"
                    : `${s.permissions.slice(0, 5).map(getPermissionLabel).join(", ")}${s.permissions.length > 5 ? t("admin_users_staff_permissions_more", { count: s.permissions.length - 5 }) : ""}`}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{s.status || "active"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(s.createdAt).toLocaleDateString(dateLocale)}
              </td>
              <td className="px-3 py-2.5 font-mono sam-text-body-secondary text-sam-muted">{s.createdBy || "-"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString(dateLocale) : "-"}
              </td>
              {isMaster && onEdit && (
                <td className="px-3 py-2.5 text-right">
                  {s.role === "master" ? null : (
                    <button
                      type="button"
                      onClick={() => onEdit(s.id)}
                      className="rounded border border-sam-border px-2 py-1 sam-text-body-secondary text-sam-fg hover:bg-sam-surface-muted"
                    >
                      {t("admin_users_action_edit")}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
