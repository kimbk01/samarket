"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
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
  const { t } = useI18n();
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
        <AdminPageHeader titleKey="admin_member_benefit_k5c666c65"
          backHref="/admin/member-benefits"
        />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
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
      <AdminPageHeader titleKey="admin_member_benefit_k5c666c65"
        backHref="/admin/member-benefits"
      />

      <AdminCard titleKey="admin_member_benefit_keb7f501b">
        <dl className="grid grid-cols-1 gap-2 sam-text-body sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">{t("admin_member_benefit_kaf2feed6")}</dt>
            <dd>{MEMBER_TYPE_LABELS[policy.memberType]}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_member_benefit_title")}</dt>
            <dd className="font-medium text-sam-fg">{policy.title}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_qa_status_2")}</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                  policy.isActive
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-sam-border-soft text-sam-muted"
                }`}
              >
                {policy.isActive ? "활성" : "비활성"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_member_benefit_kbb999b04")}</dt>
            <dd>
              홈 +{policy.homePriorityBoost} / 검색 +{policy.searchPriorityBoost}{" "}
              / 상점 +{policy.shopFeaturedPriorityBoost}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_member_benefit_todo_points")}</dt>
            <dd>
              {(policy.pointRewardBonusRate * 100).toFixed(0)}% /{" "}
              {(policy.adDiscountRate * 100).toFixed(0)}%
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_member_benefit_k38313ae9")}</dt>
            <dd>{new Date(policy.updatedAt).toLocaleString("ko-KR")}</dd>
          </div>
        </dl>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-signature bg-signature px-3 py-1.5 sam-text-body-secondary font-medium text-white"
          >
            편집
          </button>
          <button
            type="button"
            onClick={handleToggleActive}
            className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg"
          >
            {policy.isActive ? "비활성화" : "활성화"}
          </button>
        </div>
      </AdminCard>

      {editing && (
        <AdminCard titleKey="admin_member_benefit_edit_2">
          <AdminMemberBenefitForm
            initial={policy}
            onSubmit={handleSave}
            onCancel={() => setEditing(false)}
          />
        </AdminCard>
      )}

      <AdminCard titleKey="admin_member_benefit_k2ba36ff6">
        <AdminMemberBenefitLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
