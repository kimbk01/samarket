"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getUserFeedAssignments } from "@/lib/recommendation-experiments/mock-user-feed-assignments";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { recAssignedGroupLabel } from "@/components/admin/recommendation-admin-i18n";

export function UserAssignmentTable() {
  const { t } = useI18n();
  const [experimentId, setExperimentId] = useState<string>("");

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
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_experiment")}
        </label>
        <select
          value={experimentId}
          onChange={(e) => setExperimentId(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_rec_filter_all")}</option>
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.experimentName}
            </option>
          ))}
        </select>
      </div>
      {assignments.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rec_exp_empty_assignments")}
        </div>
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
                      {new Date(a.assignedAt).toLocaleString()}
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
