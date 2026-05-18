"use client";

import { useState, useCallback, useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import { updateAdminStaff, getAdminStaffById } from "@/lib/admin-users/mock-admin-staff";
import { getAdminRole } from "@/lib/admin-permission";
import { AdminPermissionToggles } from "./AdminPermissionToggles";
import type { MessageKey } from "@/lib/i18n/messages";

const ROLE_OPTIONS: { value: AdminRole; labelKey: MessageKey }[] = [
  { value: "operator", labelKey: "admin_users_role_operator" },
  { value: "manager", labelKey: "admin_users_role_manager" },
  { value: "master", labelKey: "admin_users_role_master" },
];

interface EditAdminFormProps {
  staffId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditAdminForm({ staffId, onClose, onSuccess }: EditAdminFormProps) {
  const { t } = useI18n();
  const staff = getAdminStaffById(staffId);
  const [displayName, setDisplayName] = useState(staff?.displayName ?? "");
  const [role, setRole] = useState<AdminRole>(staff?.role ?? "operator");
  const [permissions, setPermissions] = useState<AdminPermissionKey[]>(staff?.permissions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const s = getAdminStaffById(staffId);
    if (s) {
      setDisplayName(s.displayName);
      setRole(s.role);
      setPermissions([...s.permissions]);
    }
  }, [staffId]);

  const togglePermission = useCallback((key: AdminPermissionKey) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }, []);

  const handleApplyRoleDefaults = useCallback((r: AdminRole) => {
    setPermissions(DEFAULT_PERMISSIONS_BY_ROLE[r]);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    setError(null);
    if (getAdminRole() !== "master") {
      setError(t("admin_users_err_master_only_edit"));
      return;
    }
    if (!displayName.trim()) {
      setError(t("admin_users_err_display_name_required"));
      return;
    }
    if (displayName.trim().length > 64) {
      setError(t("admin_users_err_display_name_max"));
      return;
    }

    setSubmitting(true);
    const result = updateAdminStaff(staff.id, {
      displayName: displayName.trim(),
      role,
      permissions,
    });
    setSubmitting(false);

    if (result.ok) {
      onSuccess();
      onClose();
    } else {
      setError(result.error);
    }
  };

  if (!staff) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="rounded-ui-rect bg-sam-surface p-6 shadow-xl">
          <p className="text-sam-muted">{t("admin_users_form_staff_not_found")}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded border border-sam-border px-4 py-2 sam-text-body text-sam-fg"
          >
            {t("common_close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-ui-rect bg-sam-surface shadow-xl">
        <div className="sticky top-0 z-10 border-b border-sam-border bg-sam-surface px-5 py-4">
          <h2 className="text-lg font-semibold text-sam-fg">{t("admin_users_form_edit_admin_title")}</h2>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">
            {t("admin_users_form_edit_admin_hint", { loginId: staff.loginId })}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_login_id")}</label>
              <input
                type="text"
                value={staff.loginId}
                readOnly
                className="w-full rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-muted"
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_display_name")}</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={t("admin_users_ph_display_name")}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_role")}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-sam-border pt-4">
            <AdminPermissionToggles
              permissions={permissions}
              onToggle={togglePermission}
              onApplyRoleDefaults={handleApplyRoleDefaults}
              canGrantCreateAdmin={true}
              showRoleDefaultsButton={true}
              currentRole={role}
            />
          </div>

          {error && <p className="sam-text-body-secondary text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-sam-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-sam-border px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
            >
              {t("common_cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-signature px-4 py-2 sam-text-body text-white hover:bg-signature/90 disabled:opacity-50"
            >
              {submitting ? t("admin_users_saving") : t("common_save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
