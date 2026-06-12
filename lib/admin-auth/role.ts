/**
 * 어드민 역할 해석 (메뉴/권한용)
 * - 스토리지/env 로그인 ID → 역할(operator|manager|master)
 */

import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminStaff } from "@/lib/types/admin-staff";
import { peekAdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import { getCurrentAdminLoginId } from "./storage";

const ROLE_ORDER: AdminRole[] = ["operator", "manager", "master"];

function roleLevel(role: AdminRole): number {
  const i = ROLE_ORDER.indexOf(role);
  return i >= 0 ? i : -1;
}

/**
 * 현재 관리자 역할 (메뉴 노출 기준)
 */
export function getAdminRole(): AdminRole {
  const apiMe = peekAdminMeSnapshot();
  if (apiMe?.uiRole) return apiMe.uiRole;

  const v = process.env.NEXT_PUBLIC_ADMIN_ROLE;
  if (v === "operator" || v === "manager" || v === "master") return v;
  return "master";
}

/**
 * 현재 로그인한 관리자 (테스트/권한 체크용)
 */
export function getCurrentAdminStaff(): AdminStaff | null {
  const apiMe = peekAdminMeSnapshot();
  if (!apiMe?.uiRole) return null;
  return {
    id: apiMe.userId ?? "",
    loginId: apiMe.loginId ?? "",
    displayName: apiMe.displayName ?? "",
    role: apiMe.uiRole,
    permissions: apiMe.permissions ?? [],
    createdAt: "",
    disabled: false,
  };
}

export function getRoleLevel(role: AdminRole): number {
  return roleLevel(role);
}
