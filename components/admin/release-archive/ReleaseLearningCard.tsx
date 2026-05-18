"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReleaseLearningNotes } from "@/lib/release-archive/mock-release-learning-notes";
import { getReleaseArchives, getReleaseArchiveById } from "@/lib/release-archive/mock-release-archives";

interface ReleaseLearningCardProps {
  releaseArchiveId?: string;
}

export function ReleaseLearningCard({ releaseArchiveId }: ReleaseLearningCardProps) {
  const { t } = useI18n();
  const [versionFilter, setVersionFilter] = useState<string>(releaseArchiveId ?? "");

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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_release")}</span>
        <select
          value={versionFilter}
          onChange={(e) => setVersionFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          {archives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.releaseVersion} - {a.releaseTitle}
            </option>
          ))}
        </select>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rel_learning_empty_filter")}
        </div>
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
                  {new Date(n.createdAt).toLocaleString()}
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
