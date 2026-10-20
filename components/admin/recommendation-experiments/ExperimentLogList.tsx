"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { RecommendationFilterSelect } from "@/components/admin/recommendation-admin-filter-select";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getExperimentLogs } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import {
  recLogActionLabel,
  recLogNoteLabel,
} from "@/components/admin/recommendation-admin-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

interface ExperimentLogListProps {
  experimentId?: string;
}

export function ExperimentLogList({ experimentId }: ExperimentLogListProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 실험 필터 — 주소 `?experiment=` 보존 (R7). 다른 탭 「사용자 배정」과 같은 키. */
  const lq = useAdminListQuery<"experiment">({
    extras: ["experiment"],
    extraDefaults: experimentId ? { experiment: experimentId } : undefined,
  });
  const filterExp = lq.query.extras.experiment;

  const experiments = useMemo(() => getRecommendationExperiments(), []);
  const logs = useMemo(
    () => getExperimentLogs(filterExp || undefined),
    [filterExp]
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
          value={filterExp}
          allLabel={t("admin_rec_filter_all")}
          options={experiments.map((e) => ({ value: e.id, label: e.experimentName }))}
          onChange={(v) => lq.setExtra("experiment", v)}
          name="experiment"
        />
      </AdminFilterBar>
      {logs.length === 0 ? (
        lq.isFiltered ? (
          <AdminEmptyState ko={ko} onReset={lq.reset} />
        ) : (
          <AdminEmptyState ko={ko} message={t("admin_rec_exp_empty_logs")} />
        )
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
                      {formatAdminManilaDateTime(l.createdAt)}
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
