"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getReleaseLearningNotes,
  getReleaseArchives,
  getReleaseArchiveById,
} from "@/lib/release-archive/release-archive-state";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
interface ReleaseLearningCardProps {
  releaseArchiveId?: string;
}

const FILTER_EXTRAS = ["release"] as const;

export function ReleaseLearningCard({ releaseArchiveId }: ReleaseLearningCardProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const versionFilter = lq.query.extras.release || releaseArchiveId || "";

  const archives = useMemo(() => getReleaseArchives(), []);
  const notes = useMemo(
    () =>
      getReleaseLearningNotes(
        versionFilter ? { releaseArchiveId: versionFilter } : undefined
      ),
    [versionFilter]
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
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_release")} name="release" value={lq.query.extras.release} onChange={(v) => lq.setExtra("release", v)}>
          <option value="">{t("admin_rel_filter_all")}</option>
          {archives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.releaseVersion} - {a.releaseTitle}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>

      {notes.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_rel_learning_empty_filter")} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <div className="space-y-4">
          {notes.map((n) => {
            const archive = getReleaseArchiveById(n.releaseArchiveId);
            return (
              <div
                key={n.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
              >
                <div className="sam-text-helper text-sam-muted">
                  {archive?.releaseVersion ?? n.releaseArchiveId} ·{" "}
                  {n.createdByAdminNickname} ·{" "}
                  {formatAdminManilaDateTime(n.createdAt)}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">
                      {t("admin_rel_went_well")}
                    </p>
                    <p className="mt-1 sam-text-body-secondary text-sam-muted">
                      {n.whatWentWell}
                    </p>
                  </div>
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">
                      {t("admin_rel_went_wrong")}
                    </p>
                    <p className="mt-1 sam-text-body-secondary text-sam-muted">
                      {n.whatBroke}
                    </p>
                  </div>
                </div>
                <p className="mt-3 sam-text-body-secondary font-medium text-sam-fg">
                  {t("admin_rel_regression_summary")}
                </p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">
                  {n.regressionSummary}
                </p>
                <p className="mt-3 sam-text-body-secondary font-medium text-sam-fg">
                  {t("admin_rel_mitigation")}
                </p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">
                  {n.mitigationSummary}
                </p>
                <p className="mt-3 sam-text-body-secondary font-medium text-sam-fg">
                  {t("admin_rel_next_checklist")}
                </p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">
                  {n.nextReleaseChecklist}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
