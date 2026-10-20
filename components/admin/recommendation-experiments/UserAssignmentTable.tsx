"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { RecommendationFilterSelect } from "@/components/admin/recommendation-admin-filter-select";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getUserFeedAssignments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getFeedVersionById } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { recAssignedGroupLabel } from "@/components/admin/recommendation-admin-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function UserAssignmentTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 실험 필터 — 주소 `?experiment=` 보존 (R7). 「로그」 탭과 같은 키. */
  const lq = useAdminListQuery<"experiment">({ extras: ["experiment"] });
  const experimentId = lq.query.extras.experiment;

  const experiments = useMemo(() => getRecommendationExperiments(), []);
  const assignments = useMemo(
    () =>
      getUserFeedAssignments(
        experimentId ? { experimentId } : undefined
      ),
    [experimentId]
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
        <RecommendationFilterSelect
          label={t("admin_rec_exp_label_experiment")}
          value={experimentId}
          allLabel={t("admin_rec_filter_all")}
          options={experiments.map((e) => ({ value: e.id, label: e.experimentName }))}
          onChange={(v) => lq.setExtra("experiment", v)}
          name="experiment"
        />
      </AdminFilterBar>
      {assignments.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={experimentId ? undefined : t("admin_rec_exp_empty_assignments")}
          onReset={experimentId ? lq.reset : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_user")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_experiment")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_assigned_group")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_version")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_region_member")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_assigned_at")}
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const version = getFeedVersionById(a.assignedVersionId);
                const exp = experiments.find((e) => e.id === a.experimentId);
                return (
                  <tr
                    key={a.id}
                    className="border-b border-sam-border-soft hover:bg-sam-app"
                  >
                    <td className="px-3 py-2.5 font-medium text-sam-fg">
                      {a.userId}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {exp?.experimentName ?? a.experimentId}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {recAssignedGroupLabel(t, a.assignedGroup)}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {version?.versionName ?? a.assignedVersionId}
                    </td>
                    <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {a.region} / {a.memberType}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {formatAdminManilaDateTime(a.assignedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
