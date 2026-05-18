"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  ADMIN_PERMISSION_GROUPS,
  adminPermissionGroupLabel,
  getPermissionLabel,
} from "@/lib/admin-users/admin-permissions";
import type { MessageKey } from "@/lib/i18n/messages";

const ROLE_DEFAULT_KEYS: Record<AdminRole, MessageKey> = {
  master: "admin_users_perm_default_master",
  manager: "admin_users_perm_default_manager",
  operator: "admin_users_perm_default_operator",
};

interface AdminPermissionTogglesProps {
  /** 현재 선택된 권한 목록 */
  permissions: AdminPermissionKey[];
  /** 권한 하나 클릭 시 (토글) */
  onToggle: (key: AdminPermissionKey) => void;
  /** 역할 기본값 적용 시 호출 (부모에서 permissions 전체 설정) */
  onApplyRoleDefaults?: (role: AdminRole) => void;
  /** 수정 모드에서만 표시할지 (create_admin 등) */
  canGrantCreateAdmin?: boolean;
  /** 역할 기본값 적용 버튼 표시 */
  showRoleDefaultsButton?: boolean;
  currentRole?: AdminRole;
}

export function AdminPermissionToggles({
  permissions,
  onToggle,
  onApplyRoleDefaults,
  canGrantCreateAdmin = true,
  showRoleDefaultsButton = true,
  currentRole = "operator",
}: AdminPermissionTogglesProps) {
  const { t } = useI18n();

  const applyRoleDefaults = () => {
    onApplyRoleDefaults?.(currentRole);
  };

  return (
    <div className="space-y-4">
      {showRoleDefaultsButton && (
        <div className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
          <span className="sam-text-body-secondary text-sam-muted">{t("admin_users_perm_apply_role_hint")}</span>
          <button
            type="button"
            onClick={applyRoleDefaults}
            className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg hover:bg-sam-surface-muted"
          >
            {t(ROLE_DEFAULT_KEYS[currentRole])}
          </button>
        </div>
      )}
      <p className="sam-text-body-secondary font-medium text-sam-fg">
        {t("admin_users_perm_click_hint")}
      </p>
      {ADMIN_PERMISSION_GROUPS.map((g) => (
        <div key={String(g.groupLabelKey)} className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="border-b border-sam-border-soft bg-sam-app px-3 py-2 sam-text-helper font-medium text-sam-muted">
            {adminPermissionGroupLabel(g.groupLabelKey)}
          </div>
          <ul className="divide-y divide-sam-border-soft">
            {g.keys
              .filter((key) => key !== "create_admin" || canGrantCreateAdmin)
              .map((key) => (
                <li key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="sam-text-body text-sam-fg">{getPermissionLabel(key)}</span>
                  <label className="flex shrink-0 items-center gap-2">
                    <span className="sam-text-body-secondary text-sam-muted">{t("admin_users_perm_grant_label")}</span>
                    <input
                      type="checkbox"
                      checked={permissions.includes(key)}
                      onChange={() => onToggle(key)}
                      className="h-4 w-4 rounded border-sam-border text-signature focus:ring-signature"
                    />
                  </label>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
