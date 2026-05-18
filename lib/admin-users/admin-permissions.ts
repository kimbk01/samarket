/**
 * 당근 운영 분석 기준 관리자 권한 라벨·그룹
 * - 실질 운영 / 광고·노출 / 포인트 / 운영 설정 / 관리·보고 / 개발·시스템
 */

import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";

export {
  getPermissionLabel,
  ADMIN_PERMISSION_GROUPS,
  adminPermissionGroupLabel,
} from "@/lib/admin-users/admin-permissions-label-i18n";

/** 역할별 기본 권한 (한 번에 적용용) */
export const DEFAULT_PERMISSIONS_BY_ROLE: Record<AdminRole, AdminPermissionKey[]> = {
  operator: [
    "users",
    "users_edit_membership",
    "regions",
    "products",
    "product_edit",
    "boards",
    "post_write",
    "comment_write",
    "business",
    "jobs",
    "real_estate",
    "used_car",
    "chats",
    "reviews",
    "reports",
  ],
  manager: [
    "users",
    "users_edit_membership",
    "regions",
    "products",
    "product_edit",
    "boards",
    "post_write",
    "comment_write",
    "business",
    "jobs",
    "real_estate",
    "used_car",
    "chats",
    "reviews",
    "reports",
    "ads",
    "point",
    "settings",
    "manage",
  ],
  master: [
    "users",
    "users_edit_membership",
    "regions",
    "products",
    "product_edit",
    "boards",
    "post_write",
    "comment_write",
    "business",
    "jobs",
    "real_estate",
    "used_car",
    "chats",
    "reviews",
    "reports",
    "ads",
    "point",
    "settings",
    "manage",
    "dev",
    "create_admin",
  ],
};
