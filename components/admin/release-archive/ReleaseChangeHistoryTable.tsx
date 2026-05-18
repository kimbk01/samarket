"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAllReleaseArchiveItems } from "@/lib/release-archive/mock-release-archive-items";
import { getReleaseArchives, getReleaseArchiveById } from "@/lib/release-archive/mock-release-archives";
import { AdminTable } from "@/components/admin/AdminTable";
import { CHANGE_TYPE_KEYS } from "@/components/admin/i18n/admin-release-label-keys";
import type {
  ReleaseArchiveChangeType,
} from "@/lib/types/release-archive";
export function ReleaseChangeHistoryTable() {
  const { t } = useI18n();
  const [versionFilter, setVersionFilter] = useState<string>("");
  const [changeTypeFilter, setChangeTypeFilter] = useState<ReleaseArchiveChangeType | "">("");

  const archives = useMemo(() => getReleaseArchives(), []);
  const items = useMemo(
    () =>
      getAllReleaseArchiveItems({
        ...(versionFilter ? { releaseArchiveId: versionFilter } : {}),
        ...(changeTypeFilter ? { changeType: changeTypeFilter } : {}),
      }),
    [versionFilter, changeTypeFilter]
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
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_change_type")}</span>
        <select
          value={changeTypeFilter}
          onChange={(e) =>
            setChangeTypeFilter((e.target.value || "") as ReleaseArchiveChangeType | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="feature">{t("admin_rel_type_feature")}</option>
          <option value="improvement">{t("admin_rel_type_improvement")}</option>
          <option value="bugfix">{t("admin_rel_type_bugfix")}</option>
          <option value="hotfix">{t("admin_rel_type_hotfix")}</option>
          <option value="ops_change">{t("admin_rel_type_ops")}</option>
          <option value="config_change">{t("admin_rel_type_config")}</option>
        </select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rel_history_empty")}
        </div>
      ) : (
        <AdminTable
          headers={[
            t("admin_rel_filter_release"),
            t("admin_rel_th_type"),
            t("admin_rel_th_title"),
            t("admin_rel_th_description"),
            t("admin_rel_th_link"),
          ]}
        >
          {items.map((i) => {
            const archive = getReleaseArchiveById(i.releaseArchiveId);
            return (
              <tr key={i.id} className="border-b border-sam-border-soft">
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {archive?.releaseVersion ?? i.releaseArchiveId}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-helper text-sam-fg">
                    {t(CHANGE_TYPE_KEYS[i.changeType])}
                  </span>
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {i.title}
                </td>
                <td className="max-w-[200px] px-3 py-2.5 sam-text-body-secondary text-sam-muted line-clamp-2">
                  {i.description}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary">
                  {i.linkedQaIssueId && (
                    <Link href="/admin/qa-board" className="text-signature hover:underline">
                      QA
                    </Link>
                  )}
                  {i.linkedBacklogItemId && (
                    <>
                      {" "}
                      <Link href="/admin/product-backlog" className="text-signature hover:underline">
                        {t("admin_rel_backlog")}
                      </Link>
                    </>
                  )}
                  {i.linkedDeploymentId && (
                    <>
                      {" "}
                      <Link href="/admin/recommendation-deployments" className="text-signature hover:underline">
                        {t("admin_rel_deploy")}
                      </Link>
                    </>
                  )}
                  {!i.linkedQaIssueId && !i.linkedBacklogItemId && !i.linkedDeploymentId && "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
