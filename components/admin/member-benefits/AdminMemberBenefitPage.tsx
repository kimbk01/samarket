"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getMemberBenefitPolicies } from "@/lib/member-benefits/mock-member-benefit-policies";
import { getMemberBenefitSummaries } from "@/lib/member-benefits/mock-member-benefit-policies";
import { saveMemberBenefitPolicy } from "@/lib/member-benefits/mock-member-benefit-policies";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";
import { AdminMemberBenefitTable } from "./AdminMemberBenefitTable";
import { AdminMemberBenefitForm } from "./AdminMemberBenefitForm";

export function AdminMemberBenefitPage() {
  const [refresh, setRefresh] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const policies = useMemo(
    () => getMemberBenefitPolicies(),
    [refresh]
  );
  const summaries = useMemo(
    () => getMemberBenefitSummaries(),
    [refresh]
  );

  const handleSave = (values: Partial<import("@/lib/types/member-benefit").MemberBenefitPolicy>) => {
    saveMemberBenefitPolicy({
      memberType: values.memberType ?? "normal",
      title: values.title ?? "",
      description: values.description ?? "",
      isActive: values.isActive ?? true,
      profileFrameType: values.profileFrameType ?? "dark",
      badgeLabel: values.badgeLabel ?? "",
      homePriorityBoost: values.homePriorityBoost ?? 0,
      searchPriorityBoost: values.searchPriorityBoost ?? 0,
      shopFeaturedPriorityBoost: values.shopFeaturedPriorityBoost ?? 0,
      pointRewardBonusRate: values.pointRewardBonusRate ?? 0,
      adDiscountRate: values.adDiscountRate ?? 0,
      canOpenBusinessProfile: values.canOpenBusinessProfile ?? true,
      canAccessPremiumPromotion: values.canAccessPremiumPromotion ?? false,
      ...values,
    });
    setRefresh((r) => r + 1);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="회원 혜택 정책" />

      <AdminCard title="혜택 요약">
        <div className="flex flex-wrap gap-4 text-[14px]">
          {summaries.map((s) => (
            <div
              key={s.memberType}
              className="rounded border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <span className="font-medium text-gray-900">
                {MEMBER_TYPE_LABELS[s.memberType]}
              </span>
              <span className="ml-2 text-gray-600">
                활성 정책 {s.activePolicyCount}건 · 로그 {s.totalAppliedLogs}건
              </span>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="혜택 정책 목록">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-700 hover:bg-gray-50"
          >
            정책 추가
          </button>
        </div>
        {showForm && (
          <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
            <AdminMemberBenefitForm
              onSubmit={handleSave}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}
        <AdminMemberBenefitTable policies={policies} />
      </AdminCard>
    </div>
  );
}
