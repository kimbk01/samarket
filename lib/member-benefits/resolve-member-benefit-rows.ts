/**
 * 회원 혜택(S47) — 정책 1건을 "값이 있는 혜택 필드마다 1행"으로 펼치고 사용처를 정한다.
 * X22·C8: 정책 레코드에 이동 대상 필드가 없으므로 **필드 종류로 목적지 파생**(DB 변경 없음).
 *   adDiscountRate>0 → /mypage/ads · pointRewardBonusRate>0 → /mypage/points ·
 *   canAccessPremiumPromotion → /mypage/points/promotions · canOpenBusinessProfile → /mypage/business ·
 *   노출 가중치(home/search/shopFeatured)·프로필 뱃지 → 이동 없음(정보 행, chevron 없음).
 * 행 순서: 광고 할인 · 포인트 적립 · 프리미엄 홍보 · 비즈 프로필 · 노출 우선 · 프로필 뱃지.
 */
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";

export type MemberBenefitRowKind =
  | "ad_discount"
  | "point_bonus"
  | "premium_promotion"
  | "business_profile"
  | "exposure_priority"
  | "profile_badge";

export type MemberBenefitRow = {
  key: string;
  kind: MemberBenefitRowKind;
  /** 이동 대상 — null 이면 정보 행(비활성, chevron 없음) */
  href: string | null;
  /** 할인·적립률(%) — 0~100 정수 */
  ratePercent?: number;
  boosts?: { home: number; search: number; shop: number };
  badgeLabel?: string;
};

export const MEMBER_BENEFIT_ROW_DESTINATIONS: Record<MemberBenefitRowKind, string | null> = {
  ad_discount: "/mypage/ads",
  point_bonus: "/mypage/points",
  premium_promotion: "/mypage/points/promotions",
  business_profile: "/mypage/business",
  exposure_priority: null,
  profile_badge: null,
};

function toPercent(rate: number): number {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

export function resolveMemberBenefitRows(policy: MemberBenefitPolicy): MemberBenefitRow[] {
  const rows: MemberBenefitRow[] = [];
  const push = (row: Omit<MemberBenefitRow, "key" | "href">) =>
    rows.push({ ...row, key: `${policy.id}:${row.kind}`, href: MEMBER_BENEFIT_ROW_DESTINATIONS[row.kind] });

  const ad = toPercent(policy.adDiscountRate);
  if (ad > 0) push({ kind: "ad_discount", ratePercent: ad });
  const bonus = toPercent(policy.pointRewardBonusRate);
  if (bonus > 0) push({ kind: "point_bonus", ratePercent: bonus });
  if (policy.canAccessPremiumPromotion) push({ kind: "premium_promotion" });
  if (policy.canOpenBusinessProfile) push({ kind: "business_profile" });
  const home = Number(policy.homePriorityBoost) || 0;
  const search = Number(policy.searchPriorityBoost) || 0;
  const shop = Number(policy.shopFeaturedPriorityBoost) || 0;
  if (home > 0 || search > 0 || shop > 0) push({ kind: "exposure_priority", boosts: { home, search, shop } });
  if (policy.badgeLabel?.trim()) push({ kind: "profile_badge", badgeLabel: policy.badgeLabel.trim() });
  return rows;
}
