import type { AdminStaff } from "@/lib/types/admin-staff";

const ROLE_LABELS: Record<AdminStaff["role"], string> = {
  operator: "운영자",
  manager: "총괄",
  master: "최고 관리자",
};

export function getRoleLabel(role: AdminStaff["role"]): string {
  return ROLE_LABELS[role];
}
