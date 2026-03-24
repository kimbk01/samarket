/**
 * 당근 운영 분석 기준 관리자 권한 라벨·그룹
 * - 실질 운영 / 광고·노출 / 포인트 / 운영 설정 / 관리·보고 / 개발·시스템
 */

import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";

export const ADMIN_PERMISSION_LABELS: Record<AdminPermissionKey, string> = {
  users: "회원관리",
  regions: "지역관리",
  products: "중고거래",
  boards: "커뮤니티(게시판·카테고리)",
  post_write: "글쓰기(게시글 작성·수정·삭제)",
  comment_write: "댓글쓰기(댓글 작성·삭제)",
  product_edit: "상품 등록·수정·삭제",
  business: "매장 (배달관련)",
  jobs: "알바",
  real_estate: "부동산",
  used_car: "중고차",
  chats: "채팅관리",
  reviews: "리뷰관리",
  reports: "신고/제재관리",
  ads: "광고/노출",
  point: "포인트 운영",
  settings: "운영 설정",
  manage: "관리/보고",
  dev: "개발/시스템",
  create_admin: "관리자 수동 생성",
};

/** 그룹별 권한 (당근 메뉴 구조) — 항목별 클릭으로 부여 O/X */
export const ADMIN_PERMISSION_GROUPS: { groupLabel: string; keys: AdminPermissionKey[] }[] = [
  { groupLabel: "실질 운영", keys: ["users", "regions", "products", "product_edit", "boards", "post_write", "comment_write", "business", "jobs", "real_estate", "used_car", "chats", "reviews", "reports"] },
  { groupLabel: "광고·노출", keys: ["ads"] },
  { groupLabel: "포인트", keys: ["point"] },
  { groupLabel: "운영 설정", keys: ["settings"] },
  { groupLabel: "관리/보고", keys: ["manage"] },
  { groupLabel: "시스템", keys: ["dev", "create_admin"] },
];

/** 역할별 기본 권한 (한 번에 적용용) */
export const DEFAULT_PERMISSIONS_BY_ROLE: Record<AdminRole, AdminPermissionKey[]> = {
  operator: ["users", "regions", "products", "product_edit", "boards", "post_write", "comment_write", "business", "jobs", "real_estate", "used_car", "chats", "reviews", "reports"],
  manager: ["users", "regions", "products", "product_edit", "boards", "post_write", "comment_write", "business", "jobs", "real_estate", "used_car", "chats", "reviews", "reports", "ads", "point", "settings", "manage"],
  master: ["users", "regions", "products", "product_edit", "boards", "post_write", "comment_write", "business", "jobs", "real_estate", "used_car", "chats", "reviews", "reports", "ads", "point", "settings", "manage", "dev", "create_admin"],
};

export function getPermissionLabel(key: AdminPermissionKey): string {
  return ADMIN_PERMISSION_LABELS[key] ?? key;
}
