/**
 * 커뮤니티 문의·이의신청 필터 (커뮤니티 Admin 설계 §C-16 · §F-4 · C-23).
 * 같은 `support_cases` 를 걸러 보는 화면 — 별도 테이블·중복 처리 없음.
 * 카테고리 그룹(SUPPORT_CATEGORY_GROUPS)은 카테고리마다 정확히 1그룹이라 커뮤니티는
 * 「참조 유형 + 카테고리」 교차 필터로 둔다. 클라이언트·서버 공용 (상수·순수 함수만).
 */

/** 커뮤니티 전용 참조 유형 */
export const SUPPORT_COMMUNITY_REFERENCE_TYPES = [
  "COMMUNITY_POST",
  "COMMUNITY_COMMENT",
  "COMMUNITY_REPORT",
  "COMMUNITY_SANCTION",
] as const;

export type SupportCommunityReferenceType = (typeof SUPPORT_COMMUNITY_REFERENCE_TYPES)[number];

/**
 * 커뮤니티 워크스페이스에서 함께 보는 참조 유형 — 포인트 충전·홍보 주문 포함.
 * 충전은 커뮤니티 전용 구분이 없어 전체 회원 충전 문의가 함께 보인다 (설계 §F-3-1).
 * 홍보 주문은 거래 도메인 주문도 같은 참조 유형이다.
 */
export const SUPPORT_COMMUNITY_RELATED_REFERENCE_TYPES = [
  ...SUPPORT_COMMUNITY_REFERENCE_TYPES,
  "POINT_CHARGE_REQUEST",
  "POINT_PROMOTION_ORDER",
] as const;

/** 참조가 없어도 커뮤니티 문의로 보는 카테고리 (신고) */
export const SUPPORT_COMMUNITY_CATEGORIES = ["REPORT"] as const;

/** 이의신청: 제재 참조 전부 + 게시물·댓글 참조 중 신고 카테고리가 아닌 것 */
export const SUPPORT_APPEAL_SANCTION_REFERENCE_TYPES = ["COMMUNITY_SANCTION"] as const;
export const SUPPORT_APPEAL_CONTENT_REFERENCE_TYPES = ["COMMUNITY_POST", "COMMUNITY_COMMENT"] as const;

export type SupportCaseScope = "community" | null;
export type SupportCaseKind = "appeal" | null;

/** `?group=community` → "community" (대소문자 무시). 다른 값은 null — 기존 카테고리 그룹 처리 그대로. */
export function parseSupportCaseScope(raw: string | null | undefined): SupportCaseScope {
  return String(raw ?? "").trim().toLowerCase() === "community" ? "community" : null;
}

/** `?type=appeal` → "appeal" */
export function parseSupportCaseKind(raw: string | null | undefined): SupportCaseKind {
  return String(raw ?? "").trim().toLowerCase() === "appeal" ? "appeal" : null;
}

/** PostgREST `or()` 식 — 커뮤니티 범위 */
export function supportCommunityScopeOrFilter(): string {
  return [
    `reference_type.in.(${SUPPORT_COMMUNITY_RELATED_REFERENCE_TYPES.join(",")})`,
    `category.in.(${SUPPORT_COMMUNITY_CATEGORIES.join(",")})`,
  ].join(",");
}

/** PostgREST `or()` 식 — 이의신청 */
export function supportAppealOrFilter(): string {
  return [
    `reference_type.in.(${SUPPORT_APPEAL_SANCTION_REFERENCE_TYPES.join(",")})`,
    `and(reference_type.in.(${SUPPORT_APPEAL_CONTENT_REFERENCE_TYPES.join(",")}),category.neq.${SUPPORT_COMMUNITY_CATEGORIES[0]})`,
  ].join(",");
}

/** 메모리 판정 (테스트·집계 검증용) — 위 or() 식과 같은 규칙 */
export function isSupportCaseInCommunityScope(c: {
  category?: string | null;
  reference_type?: string | null;
}): boolean {
  const ref = String(c.reference_type ?? "");
  if ((SUPPORT_COMMUNITY_RELATED_REFERENCE_TYPES as readonly string[]).includes(ref)) return true;
  return (SUPPORT_COMMUNITY_CATEGORIES as readonly string[]).includes(String(c.category ?? ""));
}

export function isSupportCaseAppeal(c: { category?: string | null; reference_type?: string | null }): boolean {
  const ref = String(c.reference_type ?? "");
  if ((SUPPORT_APPEAL_SANCTION_REFERENCE_TYPES as readonly string[]).includes(ref)) return true;
  return (
    (SUPPORT_APPEAL_CONTENT_REFERENCE_TYPES as readonly string[]).includes(ref) &&
    String(c.category ?? "") !== SUPPORT_COMMUNITY_CATEGORIES[0]
  );
}
