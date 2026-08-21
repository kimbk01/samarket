"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminPermissionToggles } from "@/components/admin/users/AdminPermissionToggles";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import { promoteMemberToAdminApi } from "@/lib/admin-users/admin-staff-api";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { MessageKey } from "@/lib/i18n/messages";

const ROLE_OPTIONS: { value: AdminRole; labelKey: MessageKey }[] = [
  { value: "operator", labelKey: "admin_users_role_operator" },
  { value: "manager", labelKey: "admin_users_role_manager" },
];

export function PromoteMemberToAdminSheet({
  userId,
  displayName,
  onClose,
  onSuccess,
}: {
  userId: string;
  displayName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t, safeT } = useI18n();
  const [role, setRole] = useState<AdminRole>("operator");
  const [permissions, setPermissions] = useState<AdminPermissionKey[]>(
    () => DEFAULT_PERMISSIONS_BY_ROLE.operator
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const togglePermission = useCallback((key: AdminPermissionKey) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await promoteMemberToAdminApi({
      userId,
      role,
      permissions,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <AdminFormSheet
      title={t("admin_users_action_promote_admin")}
      subtitle={safeT("admin_users_promote_confirm", {
        fallbackKo: `「${displayName}」에게 관리자 권한을 부여합니다.`,
        fallbackEn: `Grant admin access to 「${displayName}」.`,
      })}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect border border-[#00704A]/25 px-4 py-2 text-[13px] font-semibold text-[#1E3932]"
          >
            {t("common_cancel")}
          </button>
          <button
            type="submit"
            form="promote-member-admin-form"
            disabled={submitting}
            className="rounded-ui-rect bg-[#00704A] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t("admin_users_saving") : t("admin_users_action_promote_admin")}
          </button>
        </div>
      }
    >
      <form id="promote-member-admin-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <p className="rounded-md border border-[#e4e7ec] bg-[#f9fafb] px-3 py-2 text-[13px] text-[#344054]">
          <span className="font-semibold">{displayName}</span>
          <span className="mt-1 block font-mono text-[11px] text-[#667085]">{userId}</span>
        </p>
        <div>
          <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
            {t("admin_users_label_role")}
          </label>
          <select
            value={role}
            onChange={(e) => {
              const next = e.target.value as AdminRole;
              setRole(next);
              setPermissions(DEFAULT_PERMISSIONS_BY_ROLE[next]);
            }}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <AdminPermissionToggles
          permissions={permissions}
          onToggle={togglePermission}
          currentRole={role}
          onApplyRoleDefaults={(r) => setPermissions(DEFAULT_PERMISSIONS_BY_ROLE[r])}
        />
        {error ? (
          <p className="sam-text-helper font-medium text-sam-danger" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </AdminFormSheet>
  );
}
