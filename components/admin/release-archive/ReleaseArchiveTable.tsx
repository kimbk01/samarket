"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReleaseArchives } from "@/lib/release-archive/release-archive-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { RELEASE_ARCHIVE_STATUS_KEYS } from "@/components/admin/i18n/admin-release-label-keys";
import type { ReleaseArchiveStatus } from "@/lib/types/release-archive";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
export function ReleaseArchiveTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery();
  const statusFilter = lq.query.status as ReleaseArchiveStatus | "";
  const archives = useMemo(
    () =>
      getReleaseArchives(
        statusFilter ? { releaseStatus: statusFilter } : undefined
      ),
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
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_version_status")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="active">{t("admin_rel_vstatus_active")}</option>
          <option value="stable">{t("admin_rel_vstatus_stable")}</option>
          <option value="deprecated">{t("admin_rel_vstatus_deprecated")}</option>
          <option value="rolled_back">{t("admin_rel_vstatus_rolled_back")}</option>
          <option value="hotfix">{t("admin_rel_vstatus_hotfix")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {archives.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_rel_archive_empty")} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={[
            t("admin_rel_th_version"),
            t("admin_rel_th_build"),
            t("admin_rel_th_title"),
            t("admin_rel_th_status"),
            t("admin_rel_th_release_date"),
            t("admin_rel_th_summary"),
            "",
          ]}
        >
          {archives.map((a) => (
            <tr
              key={a.id}
              className={`border-b border-sam-border-soft ${
                a.releaseStatus === "rolled_back" ? "bg-sam-danger-soft/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {a.releaseVersion}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {a.buildTag}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {a.releaseTitle}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    a.releaseStatus === "rolled_back"
                      ? "bg-sam-danger-soft text-sam-danger"
                      : a.releaseStatus === "active"
                        ? "bg-sam-info-soft text-sam-info"
                        : a.releaseStatus === "stable"
                          ? "bg-sam-success-soft text-sam-success"
                          : a.releaseStatus === "hotfix"
                            ? "bg-sam-warning-soft text-sam-warning"
                            : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(RELEASE_ARCHIVE_STATUS_KEYS[a.releaseStatus])}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {a.releaseDate}
              </td>
              <td className="max-w-[200px] px-3 py-2.5 sam-text-body-secondary text-sam-muted line-clamp-2">
                {a.summary}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/release-archive/${a.id}`}
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
