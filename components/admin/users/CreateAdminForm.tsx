"use client";

import { useState, useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey, CreateAdminInput } from "@/lib/types/admin-staff";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import { createAdminStaffApi } from "@/lib/admin-users/admin-staff-api";
import { useAdminMe } from "@/hooks/useAdminMe";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminPermissionToggles } from "./AdminPermissionToggles";
import type { MessageKey } from "@/lib/i18n/messages";

const ROLE_OPTIONS: { value: AdminRole; labelKey: MessageKey }[] = [
  { value: "operator", labelKey: "admin_users_role_operator" },
  { value: "manager", labelKey: "admin_users_role_manager" },
];

interface CreateAdminFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateAdminForm({ onClose, onSuccess }: CreateAdminFormProps) {
  const { t } = useI18n();
  const { isSuperAdmin } = useAdminMe();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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

  const handleApplyRoleDefaults = useCallback((r: AdminRole) => {
    setPermissions(DEFAULT_PERMISSIONS_BY_ROLE[r]);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isSuperAdmin) {
      setError(t("admin_users_err_master_only_create"));
      return;
    }
    if (!loginId.trim()) {
      setError(t("admin_users_err_login_id_required"));
      return;
    }
    if (loginId.trim().length < 2 || loginId.trim().length > 64) {
      setError(t("admin_users_err_login_id_length"));
      return;
    }
    if (!password || password.length < 4) {
      setError(t("admin_users_err_password_min"));
      return;
    }
    if (displayName.trim().length > 64) {
      setError(t("admin_users_err_display_name_max"));
      return;
    }

    setSubmitting(true);
    const input: CreateAdminInput = {
      loginId: loginId.trim(),
      password,
      displayName: displayName.trim() || loginId.trim(),
      role,
      permissions,
    };
    const result = await createAdminStaffApi(input);
    setSubmitting(false);

    if (result.ok) {
      onSuccess();
      onClose();
    } else {
      setError(result.error);
    }
  };

  return (
    <AdminFormSheet
      title={t("admin_users_form_create_admin_title")}
      subtitle={t("admin_users_form_create_admin_hint")}
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
            form="create-admin-form"
            disabled={submitting}
            className="rounded-ui-rect bg-[#00704A] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t("admin_users_creating") : t("admin_users_create")}
          </button>
        </div>
      }
    >
        <form id="create-admin-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_login_id")}</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                maxLength={64}
                autoComplete="username"
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={t("admin_users_ph_login_id")}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={4}
                maxLength={128}
                autoComplete="new-password"
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={t("admin_users_ph_password_min")}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_role")}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AdminRole)}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
            </div>
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

          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </form>
    </AdminFormSheet>
  );
}
