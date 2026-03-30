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
  if (staff.permissions.includes(key)) return true;
  /** 예전 스태프 배열에 키가 없을 때 — 회원관리 권한이면 구분·전화인증 수정도 동일 메뉴에서 허용 */
  if (key === "users_edit_membership" && staff.permissions.includes("users")) {
    return true;
  }
  return false;
}

export const getCurrentAdminLoginIdForDisplay = getCurrentAdminLoginId;
export const setAdminTestLoginAndReload = setAndReload;
