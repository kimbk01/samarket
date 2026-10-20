"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReleaseNotes } from "@/lib/dev-sprints/dev-sprints-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { RELEASE_NOTE_STATUS_KEYS } from "@/components/admin/i18n/admin-release-label-keys";
import type { ReleaseNoteStatus } from "@/lib/types/dev-sprints";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

export function ReleaseNoteTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery();
  const statusFilter = lq.query.status as ReleaseNoteStatus | "";
  const notes = useMemo(
    () => getReleaseNotes(statusFilter ? { status: statusFilter } : undefined),
    [statusFilter]
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
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_status")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="draft">{t("admin_rel_status_draft")}</option>
          <option value="published">{t("admin_rel_status_published")}</option>
          <option value="archived">{t("admin_rel_status_archived")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {notes.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_rel_notes_empty")} onReset={lq.isFiltered ? lq.reset : undefined} />
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
                      ? "bg-sam-success-soft text-sam-success"
                      : n.status === "draft"
                        ? "bg-sam-warning-soft text-sam-warning"
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