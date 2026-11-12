/**
 * 커뮤니티 Admin 권한 매핑 (설계 v2 §E-1-2) — 신규 키 없이 기존 권한 키를 쓴다.
 * 클라이언트·서버 공용 (상수만).
 */
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { MessageKey } from "@/lib/i18n/messages";

export type CommunityAdminArea =
  /** 게시글·댓글·카테고리·섹션·외부 글·공지·고정·모임·운영 설정·문의 */
  | "content"
  /** 신고 처리·경고·커뮤니티 활동 제한 */
  | "moderation"
  /** 상위노출 노출 중지·재개·종료·환급 */
  | "promotion"
  /** 포인트 지급·회수·충전·포인트 정책 */
  | "points"
  /** 조회 전용 화면 (작성자·기록·통계·상위노출 목록·보상 원장) */
  | "read"
  /** 모임 어드민 (설계 moim §8 · 권한 키 `moim`) — 커뮤니티 대시보드의 모임 지표 표시 판정 */
  | "moim";

export const COMMUNITY_ADMIN_AREA_PERMISSIONS: Record<CommunityAdminArea, readonly AdminPermissionKey[]> = {
  content: ["boards"],
  moderation: ["reports"],
  promotion: ["ads"],
  points: ["point"],
  read: ["boards", "reports", "ads", "point"],
  moim: ["moim"],
};

/** 영역 이름 — 카탈로그 키 (화면에서 `t(key)`) */
export const COMMUNITY_ADMIN_AREA_LABEL_KEY: Record<CommunityAdminArea, MessageKey> = {
  content: "admin_community_area_content",
  moderation: "admin_community_area_moderation",
  promotion: "admin_community_area_promotion",
  points: "admin_community_area_points",
  read: "admin_community_area_read",
  moim: "admin_community_area_moim",
};

export function communityAreaAllowed(
  permissions: readonly AdminPermissionKey[] | null | undefined,
  area: CommunityAdminArea,
  isSuperAdmin = false
): boolean {
  if (isSuperAdmin) return true;
  const have = new Set(permissions ?? []);
  return COMMUNITY_ADMIN_AREA_PERMISSIONS[area].some((k) => have.has(k));
}
