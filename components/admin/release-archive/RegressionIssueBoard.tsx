"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getReleaseRegressionIssues,
  getReleaseArchives,
} from "@/lib/release-archive/release-archive-state";
import { RegressionIssueCard } from "./RegressionIssueCard";
import { REGRESSION_STATUS_KEYS } from "@/components/admin/i18n/admin-release-label-keys";
import type {
  RegressionIssueStatus,
  RegressionCategory,
} from "@/lib/types/release-archive";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const STATUS_COLUMNS: RegressionIssueStatus[] = [
  "detected",
  "investigating",
  "confirmed",
  "fixed",
  "verified",
  "archived",
];

const FILTER_EXTRAS = ["release", "category"] as const;

export function RegressionIssueBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const releaseFilter = lq.query.extras.release as string;
  const categoryFilter = lq.query.extras.category as RegressionCategory | "";
  const statusFilter = lq.query.status as RegressionIssueStatus | "";

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
              {a.releaseVersion}
            </option>
          ))}
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_category")} name="category" value={lq.query.extras.category} onChange={(v) => lq.setExtra("category", v)}>
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
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_rel_filter_status")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          <option value="">{t("admin_rel_kanban_all")}</option>
          <option value="detected">{t("admin_rel_reg_detected")}</option>
          <option value="investigating">{t("admin_rel_reg_investigating")}</option>
          <option value="confirmed">{t("admin_rel_reg_confirmed")}</option>
          <option value="fixed">{t("admin_rel_reg_fixed")}</option>
          <option value="verified">{t("admin_rel_reg_verified")}</option>
          <option value="archived">{t("admin_rel_reg_archived")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {issues.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_rel_regression_empty_filter")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
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
