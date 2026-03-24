"use client";

import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  ADMIN_PERMISSION_GROUPS,
  getPermissionLabel,
} from "@/lib/admin-users/admin-permissions";

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
  const applyRoleDefaults = () => {
    onApplyRoleDefaults?.(currentRole);
  };

  return (
    <div className="space-y-4">
      {showRoleDefaultsButton && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-[13px] text-gray-600">역할에 맞춰 권한을 한 번에 적용</span>
          <button
            type="button"
            onClick={applyRoleDefaults}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-[13px] text-gray-700 hover:bg-gray-100"
          >
            {currentRole === "master" ? "최고관리자 기본값 적용" : currentRole === "manager" ? "총괄 기본값 적용" : "운영자 기본값 적용"}
          </button>
        </div>
      )}
      <p className="text-[13px] font-medium text-gray-700">
        아이디별로 항목을 클릭해 권한 부여 여부를 선택하세요. (예: 글쓰기 권한 부여 O/X)
      </p>
      {ADMIN_PERMISSION_GROUPS.map((g) => (
        <div key={g.groupLabel} className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-[12px] font-medium text-gray-500">
            {g.groupLabel}
          </div>
          <ul className="divide-y divide-gray-100">
            {g.keys
              .filter((key) => key !== "create_admin" || canGrantCreateAdmin)
              .map((key) => (
                <li key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-[14px] text-gray-800">{getPermissionLabel(key)}</span>
                  <label className="flex shrink-0 items-center gap-2">
                    <span className="text-[13px] text-gray-500">권한 부여</span>
                    <input
                      type="checkbox"
                      checked={permissions.includes(key)}
                      onChange={() => onToggle(key)}
                      className="h-4 w-4 rounded border-gray-300 text-signature focus:ring-signature"
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
