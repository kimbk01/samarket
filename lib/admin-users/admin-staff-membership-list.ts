/**
 * 관리자 계정·권한(`/admin/staff`) — 멤버십 목록 계약 (설계 v4 F3).
 * `GET /api/admin/staff/memberships` (super_admin) 응답 행 + 정렬·상태 필터 (client-safe 순수 함수).
 */

import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

export type AdminStaffMembershipStatus = "active" | "suspended" | "revoked";

export type AdminStaffMembershipRow = {
  membershipId: string;
  userId: string;
  nickname: string | null;
  loginId: string | null;
  /** admin_memberships.role 원시값 (admin | super_admin) */
  role: string;
  /** 화면 역할 (operator | manager | master) */
  uiRole: AdminRole;
  adminTier: string | null;
  status: string;
  /** 활성 일반 관리자만 — super_admin 은 전체 권한(빈 배열), 해제된 행은 빈 배열 */
  permissions: AdminPermissionKey[];
  grantedAt: string | null;
  grantedBy: string | null;
  grantedByNickname: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedByNickname: string | null;
  revokeReason: string | null;
};

export const ADMIN_STAFF_STATUS_FILTERS = ["active", "revoked", "all"] as const;
export type AdminStaffStatusFilter = (typeof ADMIN_STAFF_STATUS_FILTERS)[number];

export function parseAdminStaffStatusFilter(raw: string | null | undefined): AdminStaffStatusFilter {
  const v = String(raw ?? "").trim();
  return (ADMIN_STAFF_STATUS_FILTERS as readonly string[]).includes(v) ? (v as AdminStaffStatusFilter) : "active";
}

/** 활성 먼저, 그다음 부여 시각 최신순. */
export function sortAdminStaffMemberships(rows: readonly AdminStaffMembershipRow[]): AdminStaffMembershipRow[] {
  const rank = (s: string) => (s === "active" ? 0 : s === "suspended" ? 1 : 2);
  return [...rows].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      String(b.grantedAt ?? "").localeCompare(String(a.grantedAt ?? "")) ||
      a.membershipId.localeCompare(b.membershipId)
  );
}

/** 상태 필터 + 검색(닉네임·로그인 아이디·회원 id 부분 일치). `revoked` 는 활성 외 전부(정지 포함). */
export function filterAdminStaffMemberships(
  rows: readonly AdminStaffMembershipRow[],
  status: AdminStaffStatusFilter,
  q: string
): AdminStaffMembershipRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (status === "active" && r.status !== "active") return false;
    if (status === "revoked" && r.status === "active") return false;
    if (!needle) return true;
    return [r.nickname, r.loginId, r.userId].some((v) => String(v ?? "").toLowerCase().includes(needle));
  });
}

/** 해제 확인 입력값 — 닉네임(없으면 로그인 아이디, 그것도 없으면 회원 id 앞 8자). */
export function adminStaffRevokeMatchText(row: Pick<AdminStaffMembershipRow, "nickname" | "loginId" | "userId">): string {
  return (row.nickname ?? "").trim() || (row.loginId ?? "").trim() || row.userId.slice(0, 8);
}

/** 상태 라벨 namespace (AdminStatusLabel) — admin_memberships.status. */
export const ADMIN_STAFF_MEMBERSHIP_STATUS_NAMESPACE = "admin_membership";

registerAdminStatusLabels(ADMIN_STAFF_MEMBERSHIP_STATUS_NAMESPACE, {
  active: { ko: "사용 중", en: "Active", tone: "success" },
  suspended: { ko: "정지", en: "Suspended", tone: "warning" },
  revoked: { ko: "해제됨", en: "Revoked", tone: "neutral" },
});
