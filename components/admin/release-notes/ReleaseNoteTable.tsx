"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReleaseNotes } from "@/lib/dev-sprints/dev-sprints-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { RELEASE_NOTE_STATUS_KEYS } from "@/components/admin/i18n/admin-release-label-keys";
import type { ReleaseNoteStatus } from "@/lib/types/dev-sprints";

export function ReleaseNoteTable() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<ReleaseNoteStatus | "">("");
  const notes = useMemo(
    () => getReleaseNotes(statusFilter ? { status: statusFilter } : undefined),
    [statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_status")}</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter((e.target.value || "") as ReleaseNoteStatus | "")}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="draft">{t("admin_rel_status_draft")}</option>
          <option value="published">{t("admin_rel_status_published")}</option>
          <option value="archived">{t("admin_rel_status_archived")}</option>
        </select>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rel_notes_empty")}
        </div>
      ) : (
        <AdminTable
          headers={[
            t("admin_rel_th_version"),
            t("admin_rel_th_build"),
            t("admin_rel_th_title"),
            t("admin_rel_th_status"),
            t("admin_rel_th_release_date"),
            t("admin_rel_th_author"),
            "",
          ]}
        >
          {notes.map((n) => (
            <tr key={n.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{n.releaseVersion}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{n.buildTag}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">{n.title}</td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    n.status === "published"
                      ? "bg-emerald-50 text-emerald-700"
                      : n.status === "draft"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(RELEASE_NOTE_STATUS_KEYS[n.status])}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {n.releaseDate ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {n.createdByAdminNickname}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/release-notes/${n.id}`}
                  className="text-signature hover:underline"
                >
                  {t("admin_rel_action_detail")}
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}