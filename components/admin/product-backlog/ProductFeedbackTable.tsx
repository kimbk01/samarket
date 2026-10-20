"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getProductFeedbackItems } from "@/lib/product-backlog/product-backlog-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSourceLabel,
  getCategoryLabel,
  getSeverityLabel,
  getFeedbackStatusLabel,
  PRODUCT_BACKLOG_CATEGORY_FILTER_OPTIONS,
  PRODUCT_FEEDBACK_SOURCE_FILTER_OPTIONS,
  PRODUCT_FEEDBACK_STATUS_FILTER_OPTIONS,
} from "@/lib/product-backlog/product-backlog-utils";
import type {
  ProductFeedbackCategory,
  ProductFeedbackSourceType,
  ProductFeedbackStatus,
} from "@/lib/types/product-backlog";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["category", "source"] as const;

export function ProductFeedbackTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const category = lq.query.extras.category as ProductFeedbackCategory | "";
  const sourceType = lq.query.extras.source as ProductFeedbackSourceType | "";
  const feedbackStatus = lq.query.status as ProductFeedbackStatus | "";

  const items = useMemo(
    () =>
      getProductFeedbackItems({
        ...(category ? { category: category as ProductFeedbackCategory } : {}),
        ...(sourceType ? { sourceType: sourceType as ProductFeedbackSourceType } : {}),
        ...(feedbackStatus ? { feedbackStatus: feedbackStatus as ProductFeedbackStatus } : {}),
      }),
    [category, sourceType, feedbackStatus]
  );

  const headers = useMemo(
    () => [
      t("admin_product_backlog_th_title"),
      t("admin_product_backlog_th_source"),
      t("admin_product_backlog_th_category"),
      t("admin_product_backlog_th_severity"),
      t("admin_product_backlog_th_status"),
      t("admin_product_backlog_th_author"),
      t("admin_product_backlog_th_link"),
    ],
    [t]
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
        <AdminFilterSelect ko={ko} label={t("admin_product_backlog_label_category")} name="category" value={lq.query.extras.category} onChange={(v) => lq.setExtra("category", v)}>
          {PRODUCT_BACKLOG_CATEGORY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_product_backlog_label_source")} name="source" value={lq.query.extras.source} onChange={(v) => lq.setExtra("source", v)}>
          {PRODUCT_FEEDBACK_SOURCE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_product_backlog_label_status")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          {PRODUCT_FEEDBACK_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>

      {items.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_product_backlog_empty_feedback")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminTable headers={headers}>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{i.title}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {getSourceLabel(t, i.sourceType)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {getCategoryLabel(t, i.category)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    i.severity === "critical"
                      ? "bg-sam-danger-soft text-sam-danger"
                      : i.severity === "high"
                        ? "bg-sam-warning-soft text-sam-warning"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getSeverityLabel(t, i.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {getFeedbackStatusLabel(t, i.feedbackStatus)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.sourceUserNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary">
                {i.linkedType === "qa_issue" && (
                  <Link href="/admin/qa-board" className="text-signature hover:underline">
                    {t("admin_product_backlog_link_qa_short")}
                  </Link>
                )}
                {i.linkedType === "report" && (
                  <Link href="/admin/reports" className="text-signature hover:underline">
                    {t("admin_product_backlog_link_report_short")}
                  </Link>
                )}
                {i.linkedType === "action_item" && (
                  <Link href="/admin/ops-board" className="text-signature hover:underline">
                    {t("admin_product_backlog_link_action_short")}
                  </Link>
                )}
                {!i.linkedType && "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
