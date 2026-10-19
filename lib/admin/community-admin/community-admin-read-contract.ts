/**
 * 커뮤니티 Admin 조회 화면 계약 (작성자·운영 기록·통계·포인트) — 클라이언트·서버 공용 상수.
 * SQL `admin_community_is_audit_target` (20270520121200_community_admin_read_rpcs.sql) 과 같은 목록을 유지한다.
 */

/** 운영 기록(감사) 대상 유형 — 정확히 일치 */
export const COMMUNITY_AUDIT_TARGET_TYPES = [
  "community_post",
  "community_comment",
  "community_report",
  "meeting_report",
  "community_sanction",
  "sanction",
  "community_topic",
  "community_section",
  "community_settings",
  "meeting",
  "point_promotion_order",
  "community_promotion_order",
  "user_points",
  "point_charge_request",
  "community_notice",
] as const;

/** 운영 기록 대상 유형 접두 (외부 글 가져오기: inbox·rule·source·board·draft·job) */
export const COMMUNITY_AUDIT_TARGET_PREFIXES = ["community_import"] as const;

export function isCommunityAuditTargetType(t: string | null | undefined): boolean {
  const s = String(t ?? "");
  if ((COMMUNITY_AUDIT_TARGET_TYPES as readonly string[]).includes(s)) return true;
  return COMMUNITY_AUDIT_TARGET_PREFIXES.some((p) => s.startsWith(p));
}

/** PostgREST `or()` 식 — 커뮤니티 감사 대상 */
export function communityAuditTargetOrFilter(): string {
  return [
    `target_type.in.(${COMMUNITY_AUDIT_TARGET_TYPES.join(",")})`,
    ...COMMUNITY_AUDIT_TARGET_PREFIXES.map((p) => `target_type.like.${p}*`),
  ].join(",");
}

/** 커뮤니티 관련 포인트 원장 유형 (`point_ledger.related_type`) */
export const COMMUNITY_POINT_RELATED_TYPES = [
  "community_reward",
  "community_reclaim",
  "promotion_order",
  "admin_manual",
] as const;
export type CommunityPointRelatedType = (typeof COMMUNITY_POINT_RELATED_TYPES)[number];

export function isCommunityPointRelatedType(t: string | null | undefined): t is CommunityPointRelatedType {
  return (COMMUNITY_POINT_RELATED_TYPES as readonly string[]).includes(String(t ?? ""));
}

/** 작성자 목록 정렬 (RPC `admin_community_members.p_sort`) */
export const COMMUNITY_MEMBER_SORTS = ["recent", "posts", "comments", "joined", "nickname"] as const;
export type CommunityMemberSort = (typeof COMMUNITY_MEMBER_SORTS)[number];

/** 계정 정지로 보는 `profiles.status` */
export const COMMUNITY_SUSPENDED_ACCOUNT_STATUSES = ["suspended", "blocked"] as const;

/** 운영 기록 조치 라벨 i18n 키 — 화면은 키가 없으면 「기타 조치」로 표시 */
export function communityAuditActionLabelKey(action: string | null | undefined): string {
  return `admin_community_audit_action.${String(action ?? "").trim() || "unknown"}`;
}
