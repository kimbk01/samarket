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

export type SupportCaseScope = "community" | "trade" | null;
export type SupportCaseKind = "appeal" | null;

/** `?group=community|trade` (대소문자 무시). 다른 값은 null — 기존 카테고리 그룹 처리 그대로. */
export function parseSupportCaseScope(raw: string | null | undefined): SupportCaseScope {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "community" ? "community" : v === "trade" ? "trade" : null;
}

/**
 * 거래 문의 범위 (거래 Admin 설계 v2 §G-4 · D-29) — 같은 support_cases 를 거래 참조로 거른다.
 * 홍보 주문 참조(POINT_PROMOTION_ORDER)는 거래·커뮤니티 공용 유형이라 주문 도메인으로 나눈다
 * (`promotionOrderIds` = 해당 도메인 주문 id — 서버에서 조회해 넘긴다).
 */
export const SUPPORT_TRADE_REFERENCE_TYPES = ["TRADE_POST", "TRADE_CHAT_ROOM", "TRADE_SANCTION"] as const;
export const SUPPORT_TRADE_APPEAL_REFERENCE_TYPES = ["TRADE_SANCTION"] as const;

export function supportTradeScopeOrFilter(promotionOrderIds: string[]): string {
  const parts = [`reference_type.in.(${SUPPORT_TRADE_REFERENCE_TYPES.join(",")})`];
  if (promotionOrderIds.length) {
    parts.push(`and(reference_type.eq.POINT_PROMOTION_ORDER,reference_id.in.(${promotionOrderIds.join(",")}))`);
  }
  return parts.join(",");
}

/** 거래 이의신청: 거래 제재 참조 + 본인 거래글 참조 중 신고 카테고리가 아닌 것 */
export function supportTradeAppealOrFilter(): string {
  return [
    `reference_type.in.(${SUPPORT_TRADE_APPEAL_REFERENCE_TYPES.join(",")})`,
    `and(reference_type.eq.TRADE_POST,category.neq.${SUPPORT_COMMUNITY_CATEGORIES[0]})`,
  ].join(",");
}

export function isSupportCaseInTradeScope(
  c: { reference_type?: string | null; reference_id?: string | null },
  tradePromotionOrderIds: readonly string[]
): boolean {
  const ref = String(c.reference_type ?? "");
  if ((SUPPORT_TRADE_REFERENCE_TYPES as readonly string[]).includes(ref)) return true;
  return ref === "POINT_PROMOTION_ORDER" && tradePromotionOrderIds.includes(String(c.reference_id ?? ""));
}

/** `?type=appeal` → "appeal" */
export function parseSupportCaseKind(raw: string | null | undefined): SupportCaseKind {
  return String(raw ?? "").trim().toLowerCase() === "appeal" ? "appeal" : null;
}

/**
 * PostgREST `or()` 식 — 커뮤니티 범위.
 * `communityPromotionOrderIds` 를 주면 홍보 주문 참조는 커뮤니티 주문만 (D-29: 거래 홍보 문의 섞임 해소).
 * 주지 않으면 기존 동작(홍보 주문 참조 전부).
 */
export function supportCommunityScopeOrFilter(communityPromotionOrderIds?: string[]): string {
  if (!communityPromotionOrderIds) {
    return [
      `reference_type.in.(${SUPPORT_COMMUNITY_RELATED_REFERENCE_TYPES.join(",")})`,
      `category.in.(${SUPPORT_COMMUNITY_CATEGORIES.join(",")})`,
    ].join(",");
  }
  const plain = SUPPORT_COMMUNITY_RELATED_REFERENCE_TYPES.filter((t) => t !== "POINT_PROMOTION_ORDER");
  return [
    `reference_type.in.(${plain.join(",")})`,
    ...(communityPromotionOrderIds.length
      ? [`and(reference_type.eq.POINT_PROMOTION_ORDER,reference_id.in.(${communityPromotionOrderIds.join(",")}))`]
      : []),
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
