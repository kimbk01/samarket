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
  const staff = getCurrentAdminStaff();
  if (!staff) return true;
  return staff.permissions.includes(key);
}

export const getCurrentAdminLoginIdForDisplay = getCurrentAdminLoginId;
export const setAdminTestLoginAndReload = setAndReload;
