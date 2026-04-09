"use client";

import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";

interface MemberBenefitCardProps {
  policy: MemberBenefitPolicy;
  className?: string;
}

export function MemberBenefitCard({ policy, className = "" }: MemberBenefitCardProps) {
  const isPremium = policy.memberType === "premium";
  const isAdmin = policy.memberType === "admin";

  return (
    <div
      className={`rounded-ui-rect border bg-white p-4 ${
        isPremium
          ? "border-amber-200 bg-amber-50/30"
          : isAdmin
            ? "border-indigo-200 bg-indigo-50/30"
            : "border-gray-200"
      } ${className}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[12px] font-medium ${
            isPremium
              ? "bg-amber-100 text-amber-800"
              : isAdmin
                ? "bg-indigo-100 text-indigo-800"
                : "bg-gray-100 text-gray-700"
          }`}
        >
          {MEMBER_TYPE_LABELS[policy.memberType]}
        </span>
        {!policy.isActive && (
          <span className="rounded bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">
            비활성
          </span>
        )}
      </div>
      <h3 className="mt-2 text-[15px] font-semibold text-gray-900">
        {policy.title}
      </h3>
      {policy.description && (
        <p className="mt-1 text-[13px] text-gray-600">{policy.description}</p>
      )}
      <ul className="mt-3 space-y-1 text-[13px] text-gray-700">
        {policy.badgeLabel && (
          <li>· 프로필 배지: {policy.badgeLabel}</li>
        )}
        {(policy.homePriorityBoost > 0 || policy.searchPriorityBoost > 0 || policy.shopFeaturedPriorityBoost > 0) && (
          <li>
            · 노출 우선: 홈 +{policy.homePriorityBoost} / 검색 +{policy.searchPriorityBoost} / 상점 featured +{policy.shopFeaturedPriorityBoost}
          </li>
        )}
        {policy.pointRewardBonusRate > 0 && (
          <li>· 포인트 보너스: {(policy.pointRewardBonusRate * 100).toFixed(0)}%</li>
        )}
        {policy.adDiscountRate > 0 && (
          <li>· 광고 할인: {(policy.adDiscountRate * 100).toFixed(0)}%</li>
        )}
        {policy.canOpenBusinessProfile && (
          <li>· 상점 개설 가능</li>
        )}
        {policy.canAccessPremiumPromotion && (
          <li>· 프리미엄 노출 신청 가능</li>
        )}
      </ul>
    </div>
  );
}
