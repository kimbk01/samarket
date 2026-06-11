"use client";

import { useState, useCallback, useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey, AdminStaff } from "@/lib/types/admin-staff";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import { fetchAdminStaffList, updateAdminStaffApi } from "@/lib/admin-users/admin-staff-api";
import { useAdminMe } from "@/hooks/useAdminMe";
import { AdminPermissionToggles } from "./AdminPermissionToggles";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
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
  const { isSuperAdmin } = useAdminMe();
  const [staff, setStaff] = useState<AdminStaff | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AdminRole>("operator");
  const [permissions, setPermissions] = useState<AdminPermissionKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingStaff(true);
    void fetchAdminStaffList().then((list) => {
      if (cancelled) return;
      const found = list.find((s) => s.id === staffId) ?? null;
      setStaff(found);
      if (found) {
        setDisplayName(found.displayName);
        setRole(found.role);
        setPermissions([...found.permissions]);
      }
      setLoadingStaff(false);
    });
    return () => {
      cancelled = true;
    };
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
    if (!isSuperAdmin) {
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
    const result = await updateAdminStaffApi(staff.id, {
      displayName: displayName.trim(),
      role: staff.role === "master" ? undefined : role,
      permissions: staff.role === "master" ? undefined : permissions,
    });
    setSubmitting(false);

    if (result.ok) {
      onSuccess();
      onClose();
    } else {
      setError(result.error);
    }
  };

  if (loadingStaff) {
    return (
      <AdminFormSheet title={t("admin_users_form_edit_admin_title")} onClose={onClose}>
        <p className="text-[13px] text-[#6F4E37]">{t("admin_users_detail_loading")}</p>
      </AdminFormSheet>
    );
  }

  if (!staff) {
    return (
      <AdminFormSheet title={t("admin_users_form_edit_admin_title")} onClose={onClose}>
        <p className="text-[#6F4E37]">{t("admin_users_form_staff_not_found")}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-ui-rect border border-[#00704A]/25 px-4 py-2 text-[13px] font-semibold text-[#1E3932]"
        >
          {t("common_close")}
        </button>
      </AdminFormSheet>
    );
  }

  return (
    <AdminFormSheet
      title={t("admin_users_form_edit_admin_title")}
      subtitle={t("admin_users_form_edit_admin_hint", { loginId: staff.loginId })}
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
            form="edit-admin-form"
            disabled={submitting}
            className="rounded-ui-rect bg-[#00704A] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t("admin_users_saving") : t("common_save")}
          </button>
        </div>
      }
    >
      <form id="edit-admin-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[#1E3932]">{t("admin_users_label_login_id")}</label>
            <input
              type="text"
              value={staff.loginId}
              readOnly
              className="w-full rounded-ui-rect border border-[#D4E9E2] bg-[#F2F0EB] px-3 py-2 text-[13px] text-[#6F4E37]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[#1E3932]">{t("admin_users_label_display_name")}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
              className="w-full rounded-ui-rect border border-[#D4E9E2] px-3 py-2 text-[13px]"
              placeholder={t("admin_users_ph_display_name")}
            />
          </div>
        </div>
        {staff.role !== "master" ? (
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[#1E3932]">{t("admin_users_label_role")}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="w-full max-w-xs rounded-ui-rect border border-[#D4E9E2] px-3 py-2 text-[13px]"
            >
              {ROLE_OPTIONS.filter((o) => o.value !== "master").map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {staff.role !== "master" ? (
          <div className="border-t border-[#D4E9E2]/80 pt-4">
            <AdminPermissionToggles
              permissions={permissions}
              onToggle={togglePermission}
              onApplyRoleDefaults={handleApplyRoleDefaults}
              canGrantCreateAdmin={isSuperAdmin}
              showRoleDefaultsButton={true}
              currentRole={role}
            />
          </div>
        ) : null}

        {error && <p className="text-[13px] text-red-600">{error}</p>}
      </form>
    </AdminFormSheet>
  );
}
