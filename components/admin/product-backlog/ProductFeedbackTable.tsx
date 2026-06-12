"use client";

import { useMemo, useState } from "react";
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

export function ProductFeedbackTable() {
  const { t } = useI18n();
  const [category, setCategory] = useState<ProductFeedbackCategory | "">("");
  const [sourceType, setSourceType] = useState<ProductFeedbackSourceType | "">("");
  const [feedbackStatus, setFeedbackStatus] = useState<ProductFeedbackStatus | "">("");

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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_product_backlog_label_category")}
        </span>
        <select
          value={category}
          onChange={(e) =>
            setCategory((e.target.value || "") as ProductFeedbackCategory | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {PRODUCT_BACKLOG_CATEGORY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_product_backlog_label_source")}
        </span>
        <select
          value={sourceType}
          onChange={(e) =>
            setSourceType((e.target.value || "") as ProductFeedbackSourceType | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {PRODUCT_FEEDBACK_SOURCE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_product_backlog_label_status")}
        </span>
        <select
          value={feedbackStatus}
          onChange={(e) =>
            setFeedbackStatus((e.target.value || "") as ProductFeedbackStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {PRODUCT_FEEDBACK_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_product_backlog_empty_feedback")}
        </div>
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
                      ? "bg-red-100 text-red-800"
                      : i.severity === "high"
                        ? "bg-amber-100 text-amber-800"
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
