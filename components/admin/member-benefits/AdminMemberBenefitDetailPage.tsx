"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getMemberBenefitPolicyById } from "@/lib/member-benefits/mock-member-benefit-policies";
import { getMemberBenefitLogsByPolicyId } from "@/lib/member-benefits/mock-member-benefit-logs";
import {
  setMemberBenefitPolicyActive,
  saveMemberBenefitPolicy,
} from "@/lib/member-benefits/mock-member-benefit-policies";
import { addMemberBenefitLog } from "@/lib/member-benefits/mock-member-benefit-logs";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";
import { AdminMemberBenefitForm } from "./AdminMemberBenefitForm";
import { AdminMemberBenefitLogList } from "./AdminMemberBenefitLogList";

interface AdminMemberBenefitDetailPageProps {
  policyId: string;
}

export function AdminMemberBenefitDetailPage({
  policyId,
}: AdminMemberBenefitDetailPageProps) {
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);

  const policy = useMemo(
    () => getMemberBenefitPolicyById(policyId),
    [policyId, refresh]
  );
  const logs = useMemo(
    () => getMemberBenefitLogsByPolicyId(policyId),
    [policyId, refresh]
  );

  if (!policy) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title="회원 혜택 상세"
          backHref="/admin/member-benefits"
        />
        <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          정책을 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  const handleSave = (values: Partial<typeof policy>) => {
    saveMemberBenefitPolicy({
      ...policy,
      ...values,
      id: policy.id,
    });
    addMemberBenefitLog({
      userId: "",
      userNickname: "",
      memberType: policy.memberType,
      policyId: policy.id,
      actionType: "update",
      note: "정책 수정",
      actorType: "admin",
      actorId: "admin-1",
      actorNickname: "관리자",
      createdAt: new Date().toISOString(),
    });
    setRefresh((r) => r + 1);
    setEditing(false);
  };

  const handleToggleActive = () => {
    setMemberBenefitPolicyActive(policyId, !policy.isActive);
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="회원 혜택 상세"
        backHref="/admin/member-benefits"
      />

      <AdminCard title="기본 정보">
        <dl className="grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">구분</dt>
            <dd>{MEMBER_TYPE_LABELS[policy.memberType]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">제목</dt>
            <dd className="font-medium text-gray-900">{policy.title}</dd>
          </div>
          <div>
            <dt className="text-gray-500">상태</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                  policy.isActive
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {policy.isActive ? "활성" : "비활성"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">노출 우선</dt>
            <dd>
              홈 +{policy.homePriorityBoost} / 검색 +{policy.searchPriorityBoost}{" "}
              / 상점 +{policy.shopFeaturedPriorityBoost}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">포인트 보너스 / 광고 할인</dt>
            <dd>
              {(policy.pointRewardBonusRate * 100).toFixed(0)}% /{" "}
              {(policy.adDiscountRate * 100).toFixed(0)}%
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">수정일</dt>
            <dd>{new Date(policy.updatedAt).toLocaleString("ko-KR")}</dd>
          </div>
        </dl>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-signature bg-signature px-3 py-1.5 text-[13px] font-medium text-white"
          >
            편집
          </button>
          <button
            type="button"
            onClick={handleToggleActive}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-700"
          >
            {policy.isActive ? "비활성화" : "활성화"}
          </button>
        </div>
      </AdminCard>

      {editing && (
        <AdminCard title="정책 편집">
          <AdminMemberBenefitForm
            initial={policy}
            onSubmit={handleSave}
            onCancel={() => setEditing(false)}
          />
        </AdminCard>
      )}

      <AdminCard title="혜택 적용 로그">
        <AdminMemberBenefitLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
