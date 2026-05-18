"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getExperimentLogs } from "@/lib/recommendation-experiments/mock-experiment-logs";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import {
  recLogActionLabel,
  recLogNoteLabel,
} from "@/components/admin/recommendation-admin-i18n";

interface ExperimentLogListProps {
  experimentId?: string;
}

export function ExperimentLogList({ experimentId }: ExperimentLogListProps) {
  const { t } = useI18n();
  const [filterExp, setFilterExp] = useState(experimentId ?? "");

  const experiments = useMemo(() => getRecommendationExperiments(), []);
  const logs = useMemo(
    () => getExperimentLogs(filterExp || undefined),
    [filterExp]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_experiment")}
        </label>
        <select
          value={filterExp}
          onChange={(e) => setFilterExp(e.target.value)}
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
      {logs.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rec_exp_empty_logs")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_datetime")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_experiment")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_action")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_operator")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_note")}
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const exp = experiments.find((e) => e.id === l.experimentId);
                return (
                  <tr
                    key={l.id}
                    className="border-b border-sam-border-soft hover:bg-sam-app"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {exp?.experimentName ?? l.experimentId}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {recLogActionLabel(t, l.actionType)}
                    </td>
                    <td className="px-3 py-2.5 text-sam-muted">
                      {l.actorNickname} ({l.actorType})
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {recLogNoteLabel(t, l.note)}
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
