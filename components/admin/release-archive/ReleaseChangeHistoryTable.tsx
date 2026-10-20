"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getAllReleaseArchiveItems,
  getReleaseArchives,
  getReleaseArchiveById,
} from "@/lib/release-archive/release-archive-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { CHANGE_TYPE_KEYS } from "@/components/admin/i18n/admin-release-label-keys";
import type {
  ReleaseArchiveChangeType,
} from "@/lib/types/release-archive";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
const FILTER_EXTRAS = ["release", "change_type"] as const;

export function ReleaseChangeHistoryTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const versionFilter = lq.query.extras.release as string;
  const changeTypeFilter = lq.query.extras.change_type as ReleaseArchiveChangeType | "";

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
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_change_type")} name="change_type" value={lq.query.extras.change_type} onChange={(v) => lq.setExtra("change_type", v)}>
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="feature">{t("admin_rel_type_feature")}</option>
          <option value="improvement">{t("admin_rel_type_improvement")}</option>
          <option value="bugfix">{t("admin_rel_type_bugfix")}</option>
          <option value="hotfix">{t("admin_rel_type_hotfix")}</option>
          <option value="ops_change">{t("admin_rel_type_ops")}</option>
          <option value="config_change">{t("admin_rel_type_config")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {items.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_rel_history_empty")} onReset={lq.isFiltered ? lq.reset : undefined} />
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
