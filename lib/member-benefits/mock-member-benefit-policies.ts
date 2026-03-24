/**
 * 27단계: 회원 혜택 정책 mock
 */

import type {
  MemberBenefitPolicy,
  MemberBenefitSummary,
} from "@/lib/types/member-benefit";
import { getMemberBenefitLogs } from "./mock-member-benefit-logs";

const POLICIES: MemberBenefitPolicy[] = [
  {
    id: "mbp-1",
    memberType: "normal",
    title: "일반 회원 기본",
    description: "기본 노출·등록 제한 적용",
    isActive: true,
    profileFrameType: "dark",
    badgeLabel: "",
    homePriorityBoost: 0,
    searchPriorityBoost: 0,
    shopFeaturedPriorityBoost: 0,
    pointRewardBonusRate: 0,
    adDiscountRate: 0,
    canOpenBusinessProfile: true,
    canAccessPremiumPromotion: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adminMemo: "기본 정책",
  },
  {
    id: "mbp-2",
    memberType: "premium",
    title: "특별 회원 혜택",
    description: "노출 우선·광고 할인·포인트 보너스",
    isActive: true,
    profileFrameType: "gold",
    badgeLabel: "특별회원",
    homePriorityBoost: 10,
    searchPriorityBoost: 5,
    shopFeaturedPriorityBoost: 8,
    pointRewardBonusRate: 0.1,
    adDiscountRate: 0.15,
    canOpenBusinessProfile: true,
    canAccessPremiumPromotion: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adminMemo: "홈/검색/상점 우선 노출 placeholder",
  },
  {
    id: "mbp-3",
    memberType: "admin",
    title: "관리자 전용",
    description: "관리자 배지·전용 액자",
    isActive: true,
    profileFrameType: "admin_special",
    badgeLabel: "관리자",
    homePriorityBoost: 0,
    searchPriorityBoost: 0,
    shopFeaturedPriorityBoost: 0,
    pointRewardBonusRate: 0,
    adDiscountRate: 0,
    canOpenBusinessProfile: true,
    canAccessPremiumPromotion: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adminMemo: "시각 구분용",
  },
];

function nextId(): string {
  const nums = POLICIES.map((p) =>
    parseInt(p.id.replace("mbp-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `mbp-${max + 1}`;
}

export function getMemberBenefitPolicies(): MemberBenefitPolicy[] {
  return [...POLICIES];
}

export function getMemberBenefitPolicyById(
  id: string
): MemberBenefitPolicy | undefined {
  return POLICIES.find((p) => p.id === id);
}

export function getActivePoliciesByMemberType(
  memberType: "normal" | "premium" | "admin"
): MemberBenefitPolicy[] {
  return POLICIES.filter((p) => p.memberType === memberType && p.isActive);
}

export function saveMemberBenefitPolicy(
  input: Omit<MemberBenefitPolicy, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  }
): MemberBenefitPolicy {
  const now = new Date().toISOString();
  const existing = input.id ? POLICIES.find((p) => p.id === input.id) : null;
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: MemberBenefitPolicy = {
    ...input,
    id: nextId(),
    createdAt: now,
    updatedAt: now,
  };
  POLICIES.push(policy);
  return { ...policy };
}

export function setMemberBenefitPolicyActive(
  id: string,
  isActive: boolean
): MemberBenefitPolicy | undefined {
  const p = POLICIES.find((x) => x.id === id);
  if (!p) return undefined;
  p.isActive = isActive;
  p.updatedAt = new Date().toISOString();
  return { ...p };
}

export function getMemberBenefitSummaries(): MemberBenefitSummary[] {
  const logs = getMemberBenefitLogs();
  const types: Array<"normal" | "premium" | "admin"> = [
    "normal",
    "premium",
    "admin",
  ];
  return types.map((memberType) => {
    const active = POLICIES.filter(
      (p) => p.memberType === memberType && p.isActive
    );
    const typeLogs = logs.filter((l) => l.memberType === memberType);
    const latest = active.length
      ? active.reduce(
          (best, p) => (!best || p.updatedAt > best ? p.updatedAt : best),
          null as string | null
        )
      : null;
    return {
      memberType,
      activePolicyCount: active.length,
      totalUsers: 0,
      totalAppliedLogs: typeLogs.length,
      latestUpdatedAt: latest,
    };
  });
}
