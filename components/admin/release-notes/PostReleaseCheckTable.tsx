"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getPostReleaseChecks } from "@/lib/dev-sprints/dev-sprints-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  POST_RELEASE_PHASE_KEYS,
  POST_RELEASE_STATUS_KEYS,
  POST_RELEASE_PRIORITY_KEYS,
} from "@/components/admin/i18n/admin-release-label-keys";
import type {
  PostReleaseCheckPhase,
  PostReleaseCheckStatus,
} from "@/lib/types/dev-sprints";
import Link from "next/link";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
const FILTER_EXTRAS = ["release", "phase"] as const;

export function PostReleaseCheckTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const versionFilter = lq.query.extras.release as string;
  const phaseFilter = lq.query.extras.phase as PostReleaseCheckPhase | "";
  const statusFilter = lq.query.status as PostReleaseCheckStatus | "";

  const checks = useMemo(
    () =>
      getPostReleaseChecks({
        ...(versionFilter ? { releaseVersion: versionFilter } : {}),
        ...(phaseFilter ? { phase: phaseFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    [versionFilter, phaseFilter, statusFilter]
  );

  const versions = useMemo(() => {
    const list = getPostReleaseChecks();
    return [...new Set(list.map((c) => c.releaseVersion))].sort().reverse();
  }, []);

  const criticalBlocked = useMemo(
    () =>
      checks.filter((c) => c.priority === "critical" && c.status === "blocked"),
    [checks]
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
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_version")} name="release" value={lq.query.extras.release} onChange={(v) => lq.setExtra("release", v)}>
          <option value="">{t("admin_rel_filter_all")}</option>
          {versions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_stage")} name="phase" value={lq.query.extras.phase} onChange={(v) => lq.setExtra("phase", v)}>
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="before_release">{t("admin_rel_stage_before")}</option>
          <option value="just_after_release">{t("admin_rel_stage_just_after")}</option>
          <option value="after_24h">{t("admin_rel_stage_24h")}</option>
          <option value="after_72h">{t("admin_rel_stage_72h")}</option>
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_status")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="todo">{t("admin_rel_status_todo")}</option>
          <option value="in_progress">{t("admin_rel_status_in_progress")}</option>
          <option value="done">{t("admin_rel_status_done")}</option>
          <option value="blocked">{t("admin_rel_status_blocked")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {criticalBlocked.length > 0 && (
        <div className="rounded-ui-rect border border-sam-danger/40 bg-sam-danger-soft/50 p-3 sam-text-body-secondary text-sam-danger">
          {t("admin_rel_post_critical_blocked", { count: criticalBlocked.length })}
        </div>
      )}

      {checks.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_rel_post_empty")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminTable
          headers={[
            t("admin_rel_th_version"),
            t("admin_rel_th_stage"),
            t("admin_rel_th_title"),
            t("admin_rel_th_status"),
            t("admin_rel_th_priority"),
            t("admin_rel_th_assignee"),
            t("admin_rel_th_checked_at"),
            t("admin_rel_th_link"),
          ]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.status === "blocked" && c.priority === "critical"
                  ? "bg-sam-danger-soft/30"
                  : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.releaseVersion}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t(POST_RELEASE_PHASE_KEYS[c.phase])}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    c.status === "blocked"
                      ? "bg-sam-danger-soft text-sam-danger"
                      : c.status === "done"
                        ? "bg-sam-success-soft text-sam-success"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(POST_RELEASE_STATUS_KEYS[c.status])}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t(POST_RELEASE_PRIORITY_KEYS[c.priority])}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.checkedAt
                  ? formatAdminManilaDateTime(c.checkedAt)
                  : "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary">
                {c.linkedType === "deployment" && (
                  <Link href="/admin/recommendation-deployments" className="text-signature hover:underline">
                    {t("admin_rel_deploy")}
                  </Link>
                )}
                {c.linkedType === "qa_issue" && (
                  <Link href="/admin/qa-board" className="text-signature hover:underline">
                    QA
                  </Link>
                )}
                {!c.linkedType && "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
