import { describe, expect, it } from "vitest";
import { resolveMemberBenefitRows } from "@/lib/member-benefits/resolve-member-benefit-rows";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";

const policy = (over: Partial<MemberBenefitPolicy> = {}): MemberBenefitPolicy => ({
  id: "p1",
  memberType: "premium",
  title: "Premium",
  description: "",
  isActive: true,
  profileFrameType: "gold",
  badgeLabel: "",
  homePriorityBoost: 0,
  searchPriorityBoost: 0,
  shopFeaturedPriorityBoost: 0,
  pointRewardBonusRate: 0,
  adDiscountRate: 0,
  canOpenBusinessProfile: false,
  canAccessPremiumPromotion: false,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("S47 resolveMemberBenefitRows — 필드→행·목적지(X22·C8)", () => {
  it("값이 있는 필드마다 1행, 순서·목적지 고정", () => {
    const rows = resolveMemberBenefitRows(
      policy({
        adDiscountRate: 0.1,
        pointRewardBonusRate: 0.05,
        canAccessPremiumPromotion: true,
        canOpenBusinessProfile: true,
        homePriorityBoost: 2,
        badgeLabel: "VIP",
      })
    );
    expect(rows.map((r) => [r.kind, r.href])).toEqual([
      ["ad_discount", "/mypage/ads"],
      ["point_bonus", "/mypage/points"],
      ["premium_promotion", "/mypage/points/promotions"],
      ["business_profile", "/mypage/business"],
      ["exposure_priority", null],
      ["profile_badge", null],
    ]);
    expect(rows[0]!.ratePercent).toBe(10);
    expect(rows[1]!.ratePercent).toBe(5);
    expect(rows[4]!.boosts).toEqual({ home: 2, search: 0, shop: 0 });
  });

  it("값 없는 필드는 행 없음 · 노출 가중치는 정보 행(이동 없음)", () => {
    expect(resolveMemberBenefitRows(policy())).toEqual([]);
    const only = resolveMemberBenefitRows(policy({ searchPriorityBoost: 1 }));
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ kind: "exposure_priority", href: null });
  });
});
