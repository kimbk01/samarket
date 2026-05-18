"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReleaseArchiveById } from "@/lib/release-archive/mock-release-archives";
import { getReleaseArchiveItems } from "@/lib/release-archive/mock-release-archive-items";
import { getReleaseRegressionIssues } from "@/lib/release-archive/mock-release-regression-issues";
import { getReleaseLearningNotes } from "@/lib/release-archive/mock-release-learning-notes";
import {
  RELEASE_ARCHIVE_STATUS_KEYS,
  CHANGE_TYPE_KEYS,
} from "@/components/admin/i18n/admin-release-label-keys";
import { RegressionIssueCard } from "./RegressionIssueCard";

interface ReleaseArchiveDetailPageProps {
  releaseArchiveId: string;
}

export function ReleaseArchiveDetailPage({
  releaseArchiveId,
}: ReleaseArchiveDetailPageProps) {
  const { t } = useI18n();
  const archive = useMemo(
    () => getReleaseArchiveById(releaseArchiveId),
    [releaseArchiveId]
  );
  const items = useMemo(
    () => getReleaseArchiveItems(releaseArchiveId),
    [releaseArchiveId]
  );
  const issues = useMemo(
    () => getReleaseRegressionIssues({ releaseArchiveId }),
    [releaseArchiveId]
  );
  const learningNotes = useMemo(
    () => getReleaseLearningNotes({ releaseArchiveId }),
    [releaseArchiveId]
  );

  const repeatingCategories = useMemo(() => {
    const count: Record<string, number> = {};
    issues.forEach((i) => {
      count[i.regressionCategory] = (count[i.regressionCategory] ?? 0) + 1;
    });
    return new Set(
      Object.entries(count)
        .filter(([, n]) => n >= 2)
        .map(([c]) => c)
    );
  }, [issues]);

  if (!archive) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rel_archive_not_found")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
          <span>{archive.releaseVersion}</span>
          <span>{archive.buildTag}</span>
          <span
            className={`rounded px-1.5 py-0.5 ${
              archive.releaseStatus === "rolled_back"
                ? "bg-red-100 text-red-800"
                : archive.releaseStatus === "active"
                  ? "bg-blue-50 text-blue-700"
                  : archive.releaseStatus === "stable"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-sam-surface-muted text-sam-muted"
            }`}
          >
            {t(RELEASE_ARCHIVE_STATUS_KEYS[archive.releaseStatus])}
          </span>
        </div>
        <h2 className="mt-2 sam-text-page-title font-semibold text-sam-fg">
          {archive.releaseTitle}
        </h2>
        <p className="mt-2 sam-text-body text-sam-fg">{archive.summary}</p>
        <p className="mt-2 sam-text-helper text-sam-muted">
          {t("admin_rel_archive_release_date", { date: archive.releaseDate })}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 sam-text-helper">
          {archive.linkedReleaseNoteId && (
            <Link href="/admin/release-notes" className="text-signature hover:underline">
              {t("admin_rel_link_release_notes")}
            </Link>
          )}
          {archive.linkedSprintId && (
            <Link href="/admin/dev-sprints" className="text-signature hover:underline">
              {t("admin_rel_link_sprint")}
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-medium text-sam-fg">{t("admin_rel_changes_title")}</h3>
        {items.length === 0 ? (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("admin_rel_changes_empty")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-start gap-2 border-b border-sam-border-soft pb-2 last:border-0 last:pb-0"
              >
                <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-helper text-sam-muted">
                  {t(CHANGE_TYPE_KEYS[i.changeType])}
                </span>
                <span className="font-medium text-sam-fg">{i.title}</span>
                <span className="sam-text-body-secondary text-sam-muted">{i.description}</span>
                <span className="flex gap-1 sam-text-helper">
                  {i.linkedQaIssueId && (
                    <Link href="/admin/qa-board" className="text-signature hover:underline">
                      QA
                    </Link>
                  )}
                  {i.linkedBacklogItemId && (
                    <Link href="/admin/product-backlog" className="text-signature hover:underline">
                      {t("admin_rel_backlog")}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-medium text-sam-fg">
          {t("admin_rel_regression_flow")}
        </h3>
        {issues.length === 0 ? (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("admin_rel_regression_empty")}</p>
        ) : (
          <div className="mt-2 space-y-2">
            {issues.map((issue) => (
              <RegressionIssueCard
                key={issue.id}
                issue={issue}
                isRepeatingPattern={repeatingCategories.has(issue.regressionCategory)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-medium text-sam-fg">{t("admin_rel_learning_title")}</h3>
        {learningNotes.length === 0 ? (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("admin_rel_learning_empty")}</p>
        ) : (
          <div className="mt-2 space-y-4">
            {learningNotes.map((n) => (
              <div key={n.id} className="border-b border-sam-border-soft pb-4 last:border-0 last:pb-0">
                <p className="sam-text-helper text-sam-muted">
                  {n.createdByAdminNickname} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </p>
                <p className="mt-2 sam-text-body-secondary font-medium text-sam-fg">{t("admin_rel_went_well")}</p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">{n.whatWentWell}</p>
                <p className="mt-2 sam-text-body-secondary font-medium text-sam-fg">{t("admin_rel_went_wrong")}</p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">{n.whatBroke}</p>
                <p className="mt-2 sam-text-body-secondary font-medium text-sam-fg">{t("admin_rel_regression_summary")}</p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">{n.regressionSummary}</p>
                <p className="mt-2 sam-text-body-secondary font-medium text-sam-fg">{t("admin_rel_next_checklist_short")}</p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">{n.nextReleaseChecklist}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
