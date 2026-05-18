"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsDocumentFilterState } from "./OpsDocumentFilterBar";
import { getOpsDocuments } from "@/lib/ops-docs/mock-ops-documents";
import {
  OPS_DOC_TYPE_KEYS,
  OPS_DOC_STATUS_KEYS,
  OPS_DOC_CATEGORY_TABLE_KEYS,
} from "@/components/admin/i18n/admin-ops-doc-label-keys";
import { adminDateLocaleTag } from "@/components/admin/i18n/admin-date-locale";

interface OpsDocumentTableProps {
  filterState: OpsDocumentFilterState;
  refresh?: number;
}

export function OpsDocumentTable({ filterState, refresh = 0 }: OpsDocumentTableProps) {
  const { t, language } = useI18n();
  const dateLocale = adminDateLocaleTag(language);
  const documents = useMemo(
    () =>
      getOpsDocuments({
        docType: filterState.docType || undefined,
        status: filterState.status || undefined,
        category: filterState.category || undefined,
        search: filterState.search.trim() || undefined,
        sort: filterState.sort,
      }),
    [filterState.search, filterState.docType, filterState.status, filterState.category, filterState.sort, refresh]
  );

  if (documents.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_ops_doc_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_doc_th_title")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_doc_th_type")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_doc_th_category")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_doc_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_doc_th_updated")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_doc_th_author")}</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/ops-docs/${d.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {d.isPinned && "📌 "}
                  {d.title}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{t(OPS_DOC_TYPE_KEYS[d.docType])}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(OPS_DOC_CATEGORY_TABLE_KEYS[d.category])}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                    d.status === "active"
                      ? "bg-emerald-50 text-emerald-800"
                      : d.status === "draft"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(OPS_DOC_STATUS_KEYS[d.status])}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {new Date(d.updatedAt).toLocaleDateString(dateLocale)}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">{d.createdByAdminNickname}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}