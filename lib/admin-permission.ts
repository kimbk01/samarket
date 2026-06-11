/**
 * 관리자 권한: 메뉴/섹션 접근 판단
 * - 역할 해석·스토리지: lib/admin-auth
 */

import type { AdminRole, AdminMenuSection } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  getAdminRole as getRole,
  getCurrentAdminStaff as getStaff,
  getRoleLevel,
} from "@/lib/admin-auth";
import { peekAdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import { getCurrentAdminLoginId, setAdminTestLoginAndReload as setAndReload } from "@/lib/admin-auth";

export const getAdminRole = getRole;

export function canAccessSection(
  section: AdminMenuSection,
  userRole: AdminRole
): boolean {
  return getRoleLevel(userRole) >= getRoleLevel(section.requiredRole);
}

export function filterMenuByRole(
  sections: AdminMenuSection[],
  userRole: AdminRole
): AdminMenuSection[] {
  return sections.filter((s) => canAccessSection(s, userRole));
}

export const getCurrentAdminStaff = getStaff;

export function canAccessPermission(key: AdminPermissionKey): boolean {
  const apiMe = peekAdminMeSnapshot();
  if (apiMe) {
    if (apiMe.role === "super_admin" || apiMe.uiRole === "master") return true;
    if (apiMe.permissions.includes(key)) return true;
    if (key === "users_edit_membership" && apiMe.permissions.includes("users")) return true;
    return false;
  }

  const staff = getCurrentAdminStaff();
  if (!staff) return true;
  if (staff.permissions.includes(key)) return true;
  if (key === "users_edit_membership" && staff.permissions.includes("users")) {
    return true;
  }
  return false;
}

export const getCurrentAdminLoginIdForDisplay = getCurrentAdminLoginId;
export const setAdminTestLoginAndReload = setAndReload;
