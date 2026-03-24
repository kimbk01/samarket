/**
 * 관리자(스태프) 목록 — 회원과 분리. 최고관리자가 수동 생성한 관리자 + 시드
 * 실서비스에서는 Supabase auth + profiles.role + admin_permissions 테이블 등으로 대체
 */

import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminStaff, CreateAdminInput, AdminPermissionKey } from "@/lib/types/admin-staff";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "./admin-permissions";

const ROLE_LABELS: Record<AdminStaff["role"], string> = {
  operator: "운영자",
  manager: "총괄",
  master: "최고 관리자",
};

/** 시드: 테스트용 최고관리자 (aaaa) + 운영자 샘플 */
const SEED_STAFF: AdminStaff[] = [
  {
    id: "seed-master",
    loginId: "aaaa",
    displayName: "최고관리자",
    role: "master",
    permissions: DEFAULT_PERMISSIONS_BY_ROLE.master,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: undefined,
  },
  {
    id: "seed-operator",
    loginId: "operator1",
    displayName: "운영자1",
    role: "operator",
    permissions: DEFAULT_PERMISSIONS_BY_ROLE.operator,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: "seed-master",
  },
];

/** 런타임에 추가된 관리자 (수동 생성) */
const addedStaff: AdminStaff[] = [];

let nextId = 1;
function generateId(): string {
  return `admin-${Date.now()}-${nextId++}`;
}

export function getAdminStaffList(): AdminStaff[] {
  return [...SEED_STAFF, ...addedStaff].filter((s) => !s.disabled);
}

export function getAdminStaffById(id: string): AdminStaff | undefined {
  return [...SEED_STAFF, ...addedStaff].find((s) => s.id === id);
}

export function getAdminStaffByLoginId(loginId: string): AdminStaff | undefined {
  return [...SEED_STAFF, ...addedStaff].find(
    (s) => !s.disabled && s.loginId.toLowerCase() === loginId.toLowerCase()
  );
}

const LOGIN_ID_MIN = 2;
const LOGIN_ID_MAX = 64;
const DISPLAY_NAME_MAX = 64;

/** 최고관리자만 호출. 관리자 수동 생성 (목업: 메모리 저장) */
export function createAdminStaff(input: CreateAdminInput): { ok: true; staff: AdminStaff } | { ok: false; error: string } {
  const loginId = typeof input.loginId === "string" ? input.loginId.trim() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";

  if (!loginId) return { ok: false, error: "로그인 ID를 입력하세요." };
  if (loginId.length < LOGIN_ID_MIN || loginId.length > LOGIN_ID_MAX) {
    return { ok: false, error: `로그인 ID는 ${LOGIN_ID_MIN}~${LOGIN_ID_MAX}자로 입력하세요.` };
  }
  if (displayName.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `표시 이름은 ${DISPLAY_NAME_MAX}자 이내로 입력하세요.` };
  }

  const existing = getAdminStaffByLoginId(loginId);
  if (existing) return { ok: false, error: "이미 존재하는 로그인 아이디입니다." };

  const permissions =
    input.permissions?.length > 0
      ? [...input.permissions]
      : DEFAULT_PERMISSIONS_BY_ROLE[input.role];
  const staff: AdminStaff = {
    id: generateId(),
    loginId,
    displayName: displayName || loginId,
    role: input.role,
    permissions,
    createdAt: new Date().toISOString(),
    createdBy: undefined,
  };
  addedStaff.push(staff);
  return { ok: true, staff };
}

/** 수정 (displayName, role, permissions). 시드 항목도 수정 가능. */
export type UpdateAdminStaffInput = {
  displayName?: string;
  role?: AdminRole;
  permissions?: AdminPermissionKey[];
};

export function updateAdminStaff(
  id: string,
  input: UpdateAdminStaffInput
): { ok: true; staff: AdminStaff } | { ok: false; error: string } {
  const list = [...SEED_STAFF, ...addedStaff];
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, error: "해당 관리자를 찾을 수 없습니다." };

  let displayNameToSet: string | undefined;
  if (input.displayName !== undefined) {
    const trimmed = String(input.displayName).trim();
    if (trimmed.length > DISPLAY_NAME_MAX) {
      return { ok: false, error: `표시 이름은 ${DISPLAY_NAME_MAX}자 이내로 입력하세요.` };
    }
    displayNameToSet = trimmed;
  }
  const permissionsToSet =
    input.permissions !== undefined ? [...input.permissions] : undefined;

  const target = list[idx];
  if (displayNameToSet !== undefined) target.displayName = displayNameToSet;
  if (input.role !== undefined) target.role = input.role;
  if (permissionsToSet !== undefined) target.permissions = permissionsToSet;

  return { ok: true, staff: { ...target } };
}

export function getRoleLabel(role: AdminStaff["role"]): string {
  return ROLE_LABELS[role];
}
