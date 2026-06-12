"use client";

import { useMemo, useState } from "react";
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

export function PostReleaseCheckTable() {
  const { t } = useI18n();
  const [versionFilter, setVersionFilter] = useState<string>("");
  const [phaseFilter, setPhaseFilter] = useState<PostReleaseCheckPhase | "">("");
  const [statusFilter, setStatusFilter] = useState<PostReleaseCheckStatus | "">("");

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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_version")}</span>
        <select
          value={versionFilter}
          onChange={(e) => setVersionFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          {versions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_stage")}</span>
        <select
          value={phaseFilter}
          onChange={(e) =>
            setPhaseFilter((e.target.value || "") as PostReleaseCheckPhase | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="before_release">{t("admin_rel_stage_before")}</option>
          <option value="just_after_release">{t("admin_rel_stage_just_after")}</option>
          <option value="after_24h">{t("admin_rel_stage_24h")}</option>
          <option value="after_72h">{t("admin_rel_stage_72h")}</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_status")}</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as PostReleaseCheckStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="todo">{t("admin_rel_status_todo")}</option>
          <option value="in_progress">{t("admin_rel_status_in_progress")}</option>
          <option value="done">{t("admin_rel_status_done")}</option>
          <option value="blocked">{t("admin_rel_status_blocked")}</option>
        </select>
      </div>

      {criticalBlocked.length > 0 && (
        <div className="rounded-ui-rect border border-red-200 bg-red-50/50 p-3 sam-text-body-secondary text-red-800">
          {t("admin_rel_post_critical_blocked", { count: criticalBlocked.length })}
        </div>
      )}

      {checks.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rel_post_empty")}
        </div>
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
                  ? "bg-red-50/30"
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
                      ? "bg-red-100 text-red-800"
                      : c.status === "done"
                        ? "bg-emerald-50 text-emerald-700"
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
                  ? new Date(c.checkedAt).toLocaleString()
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
