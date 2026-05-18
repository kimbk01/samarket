"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReleaseRegressionIssues } from "@/lib/release-archive/mock-release-regression-issues";
import { getReleaseArchives } from "@/lib/release-archive/mock-release-archives";
import { RegressionIssueCard } from "./RegressionIssueCard";
import { REGRESSION_STATUS_KEYS } from "@/components/admin/i18n/admin-release-label-keys";
import type {
  RegressionIssueStatus,
  RegressionCategory,
} from "@/lib/types/release-archive";

const STATUS_COLUMNS: RegressionIssueStatus[] = [
  "detected",
  "investigating",
  "confirmed",
  "fixed",
  "verified",
  "archived",
];

export function RegressionIssueBoard() {
  const { t } = useI18n();
  const [releaseFilter, setReleaseFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<RegressionCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<RegressionIssueStatus | "">("");

  const archives = useMemo(() => getReleaseArchives(), []);
  const issues = useMemo(
    () =>
      getReleaseRegressionIssues({
        ...(releaseFilter ? { releaseArchiveId: releaseFilter } : {}),
        ...(categoryFilter ? { regressionCategory: categoryFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    [releaseFilter, categoryFilter, statusFilter]
  );

  const byStatus = useMemo(() => {
    const map: Record<RegressionIssueStatus, typeof issues> = {
      detected: [],
      investigating: [],
      confirmed: [],
      fixed: [],
      verified: [],
      archived: [],
    };
    issues.forEach((i) => map[i.status].push(i));
    return map;
  }, [issues]);

  const repeatingCategory = useMemo(() => {
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

  const columnsToShow = statusFilter ? [statusFilter] : STATUS_COLUMNS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_release")}</span>
        <select
          value={releaseFilter}
          onChange={(e) => setReleaseFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          {archives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.releaseVersion}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_category")}</span>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter((e.target.value || "") as RegressionCategory | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_filter_all")}</option>
          <option value="auth">{t("admin_rel_cat_auth")}</option>
          <option value="product">{t("admin_rel_cat_product")}</option>
          <option value="feed">{t("admin_rel_cat_feed")}</option>
          <option value="chat">{t("admin_rel_cat_chat")}</option>
          <option value="moderation">{t("admin_rel_cat_moderation")}</option>
          <option value="points">{t("admin_rel_cat_points")}</option>
          <option value="ads">{t("admin_rel_cat_ads")}</option>
          <option value="admin">{t("admin_rel_cat_admin")}</option>
          <option value="ops">{t("admin_rel_cat_ops")}</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_rel_filter_status")}</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as RegressionIssueStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_rel_kanban_all")}</option>
          <option value="detected">{t("admin_rel_reg_detected")}</option>
          <option value="investigating">{t("admin_rel_reg_investigating")}</option>
          <option value="confirmed">{t("admin_rel_reg_confirmed")}</option>
          <option value="fixed">{t("admin_rel_reg_fixed")}</option>
          <option value="verified">{t("admin_rel_reg_verified")}</option>
          <option value="archived">{t("admin_rel_reg_archived")}</option>
        </select>
      </div>

      {issues.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rel_regression_empty_filter")}
        </div>
      ) : (
        <div className="grid gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {columnsToShow.map((status) => (
            <div
              key={status}
              className="min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-app/50 p-3"
            >
              <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
                {t(REGRESSION_STATUS_KEYS[status])}
                <span className="ml-1 text-sam-muted">
                  ({(byStatus[status] ?? []).length})
                </span>
              </h3>
              <div className="space-y-2">
                {(byStatus[status] ?? []).map((issue) => (
                  <RegressionIssueCard
                    key={issue.id}
                    issue={issue}
                    isRepeatingPattern={repeatingCategory.has(issue.regressionCategory)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
