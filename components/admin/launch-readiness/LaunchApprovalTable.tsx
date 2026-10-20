"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getLaunchApprovals } from "@/lib/launch-readiness/launch-readiness-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { getPhaseLabel } from "@/lib/launch-readiness/launch-readiness-utils";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const ROLE_LABELS: Record<string, string> = {
  product_owner: "PO",
  ops_owner: "운영",
  tech_owner: "기술",
  admin: "관리자",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "승인",
  conditional: "조건부",
  rejected: "반려",
};

const PHASE_EXTRAS = ["phase"] as const;

export function LaunchApprovalTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 단계 필터는 주소(`?phase=`)에 보존 (R7). */
  const lq = useAdminListQuery({ extras: PHASE_EXTRAS });
  const phase = lq.query.extras.phase as LaunchReadinessPhase | "";
  const approvals = useMemo(
    () => getLaunchApprovals(phase ? { phase } : undefined),
    [phase]
  );

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect
          ko={ko}
          label={t("admin_launch_readiness_k0e685c7c")}
          name="phase"
          value={lq.query.extras.phase}
          onChange={(v) => lq.setExtra("phase", v)}
          allLabel={t("common_all")}
          options={[
            { value: "pre_launch", label: "Pre-Launch" },
            { value: "launch_day", label: "Launch Day" },
            { value: "post_launch", label: "Post-Launch" },
          ]}
        />
      </AdminFilterBar>

      <p className="sam-text-helper text-sam-muted">
        승인자(approver) placeholder: approverAdminId / approverAdminNickname
        입력 시 표시됩니다.
      </p>

      {approvals.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : "해당 단계 승인 내역이 없습니다."}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminTable
          headers={["단계", "역할", "승인자", "결정", "메모", "일시"]}
        >
          {approvals.map((a) => (
            <tr key={a.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPhaseLabel(a.phase)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {ROLE_LABELS[a.approverRole] ?? a.approverRole}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {a.approverAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    a.decision === "approved"
                      ? "bg-sam-success-soft text-sam-success"
                      : a.decision === "rejected"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-warning-soft text-sam-warning"
                  }`}
                >
                  {DECISION_LABELS[a.decision] ?? a.decision}
                </span>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {a.note || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(a.createdAt)}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
