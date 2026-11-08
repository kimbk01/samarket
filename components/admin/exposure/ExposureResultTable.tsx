"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ExposureCandidate } from "@/lib/types/exposure";
import type { ExposureScoreResult } from "@/lib/types/exposure";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";
import { ExposureResultDetailCard } from "./ExposureResultDetailCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

interface ExposureResultTableProps {
  results: { candidate: ExposureCandidate; result: ExposureScoreResult }[];
  surface: string;
  policyName: string;
}

export function ExposureResultTable({
  results,
  surface,
  policyName,
}: ExposureResultTableProps) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (results.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_exposure_result_empty")}
      </div>
    );
  }

  const selected = results.find((r) => r.candidate.id === selectedId);

  return (
    <div className="space-y-4">
      <p className="sam-text-body text-sam-muted">
        {t("admin_exposure_result_summary", { policy: policyName, n: results.length })}
      </p>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[640px] border-collapse sam-text-body">
          <thead>
            <tr className="border-b border-sam-border bg-sam-app">
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_exposure_result_col_product_id")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_exposure_result_col_title")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_exposure_result_col_seller_type")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_exposure_result_col_final_score")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_exposure_result_col_reason")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_exposure_result_col_actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ candidate, result }) => (
              <tr
                key={candidate.id}
                className="border-b border-sam-border-soft hover:bg-sam-app"
              >
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {candidate.id}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2.5 text-sam-fg">
                  {candidate.title}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {candidate.sellerNickname} ({MEMBER_TYPE_LABELS[candidate.memberType]})
                </td>
                <td className="px-3 py-2.5 font-semibold text-sam-fg">
                  {result.finalScore}
                </td>
                <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {result.appliedReasons.join(", ") || "-"}
                </td>
                <td className="px-3 py-2.5">
                  <AdminActionButton
                    onClick={() =>
                      setSelectedId(selectedId === candidate.id ? null : candidate.id)
                    }
                    variant="ghost"
                    size="sm"
                  >
                    {selectedId === candidate.id ? t("admin_exposure_collapse") : t("admin_exposure_detail")}
                  </AdminActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <ExposureResultDetailCard
          candidate={selected.candidate}
          result={selected.result}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
