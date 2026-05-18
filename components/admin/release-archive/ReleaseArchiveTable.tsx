"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReleaseArchives } from "@/lib/release-archive/mock-release-archives";
import { AdminTable } from "@/components/admin/AdminTable";
import { RELEASE_ARCHIVE_STATUS_KEYS } from "@/components/admin/i18n/admin-release-label-keys";
import type { ReleaseArchiveStatus } from "@/lib/types/release-archive";
export function ReleaseArchiveTable() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<ReleaseArchiveStatus | "">("");
  const archives = useMemo(
    () =>
      getReleaseArchives(
        statusFilter ? { releaseStatus: statusFilter } : undefined
      ),
    [statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_version_status")}</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as ReleaseArchiveStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="active">{t("admin_rel_vstatus_active")}</option>
          <option value="stable">{t("admin_rel_vstatus_stable")}</option>
          <option value="deprecated">{t("admin_rel_vstatus_deprecated")}</option>
          <option value="rolled_back">{t("admin_rel_vstatus_rolled_back")}</option>
          <option value="hotfix">{t("admin_rel_vstatus_hotfix")}</option>
        </select>
      </div>

      {archives.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rel_archive_empty")}
        </div>
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
                a.releaseStatus === "rolled_back" ? "bg-red-50/30" : ""
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
                      ? "bg-red-100 text-red-800"
                      : a.releaseStatus === "active"
                        ? "bg-blue-50 text-blue-700"
                        : a.releaseStatus === "stable"
                          ? "bg-emerald-50 text-emerald-700"
                          : a.releaseStatus === "hotfix"
                            ? "bg-amber-50 text-amber-700"
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
