"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getReleaseNoteById,
  getReleaseNoteItems,
} from "@/lib/dev-sprints/dev-sprints-state";
import { loadDevSprintsFromServer } from "@/lib/dev-sprints/dev-sprints-sync-client";
import {
  RELEASE_NOTE_STATUS_KEYS,
  RELEASE_NOTE_ITEM_TYPE_KEYS,
} from "@/components/admin/i18n/admin-release-label-keys";

interface ReleaseNoteDetailCardProps {
  releaseNoteId: string;
}

export function ReleaseNoteDetailCard({ releaseNoteId }: ReleaseNoteDetailCardProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const { state: loadState, reload } = useAdminSyncLoad(loadDevSprintsFromServer);
  const hydrated = loadState.status === "ready";

  const note = useMemo(
    () => (hydrated ? getReleaseNoteById(releaseNoteId) : undefined),
    [hydrated, releaseNoteId]
  );
  const items = useMemo(
    () => (hydrated ? getReleaseNoteItems(releaseNoteId) : []),
    [hydrated, releaseNoteId]
  );

  if (!hydrated) {
    return <AdminSyncLoadGate state={loadState} onRetry={reload} />;
  }

  if (!note) {
    return (
      <AdminEmptyState ko={ko} message={t("admin_rel_note_not_found")} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
          <span>{note.releaseVersion}</span>
          <span>{note.buildTag}</span>
          <span
            className={`rounded px-1.5 py-0.5 ${
              note.status === "published"
                ? "bg-emerald-50 text-emerald-700"
                : note.status === "draft"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-sam-surface-muted text-sam-muted"
            }`}
          >
            {t(RELEASE_NOTE_STATUS_KEYS[note.status])}
          </span>
        </div>
        <h2 className="mt-2 sam-text-page-title font-semibold text-sam-fg">
          {note.title}
        </h2>
        <p className="mt-2 sam-text-body text-sam-fg">{note.summary}</p>
        <p className="mt-2 sam-text-helper text-sam-muted">
          {t("admin_rel_note_meta", {
            date: note.releaseDate ?? "-",
            author: note.createdByAdminNickname,
          })}
        </p>
        {note.includedSprintId && (
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_rel_sprint", { id: note.includedSprintId })}
            <Link href="/admin/dev-sprints" className="ml-1 text-signature hover:underline">
              {t("admin_rel_sprint_board")}
            </Link>
          </p>
        )}
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
                  {t(RELEASE_NOTE_ITEM_TYPE_KEYS[i.itemType])}
                </span>
                <span className="font-medium text-sam-fg">{i.title}</span>
                <span className="sam-text-body-secondary text-sam-muted">{i.description}</span>
                <span className="flex gap-1 sam-text-helper">
                  {i.linkedBacklogItemId && (
                    <Link href="/admin/product-backlog" className="text-signature hover:underline">
                      {t("admin_rel_backlog")}
                    </Link>
                  )}
                  {i.linkedQaIssueId && (
                    <Link href="/admin/qa-board" className="text-signature hover:underline">
                      QA
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
