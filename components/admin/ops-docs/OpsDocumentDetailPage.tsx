"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";
import { setOpsDocumentStatusWithLog, duplicateOpsDocument } from "@/lib/ops-docs/ops-docs-utils";
import {
  OPS_DOC_TYPE_KEYS,
  OPS_DOC_STATUS_KEYS,
  OPS_DOC_CATEGORY_KEYS,
} from "@/components/admin/i18n/admin-ops-doc-label-keys";
import { adminDateLocaleTag } from "@/components/admin/i18n/admin-date-locale";
import { OpsDocumentStepList } from "./OpsDocumentStepList";
import { OpsDocumentLogList } from "./OpsDocumentLogList";

type TabId = "detail" | "steps" | "logs";

const TAB_KEYS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "detail", labelKey: "admin_ops_doc_tab_detail" },
  { id: "steps", labelKey: "admin_ops_doc_tab_steps" },
  { id: "logs", labelKey: "admin_ops_doc_tab_logs" },
];

export function OpsDocumentDetailPage({ documentId }: { documentId: string }) {
  const { t, language } = useI18n();
  const dateLocale = adminDateLocaleTag(language);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("detail");
  const [refresh, setRefresh] = useState(0);

  const doc = useMemo(
    () => getOpsDocumentById(documentId),
    [documentId, refresh]
  );

  if (!doc) {
    return (
      <>
        <AdminPageHeader titleKey="admin_ops_doc_not_found_title" backHref="/admin/ops-docs" />
        <p className="sam-text-body text-sam-muted">{t("admin_ops_doc_not_found_body")}</p>
      </>
    );
  }

  const handleStatusChange = (status: "active" | "archived") => {
    setOpsDocumentStatusWithLog(documentId, status, "admin1", t("admin_ops_doc_admin_nickname"));
    setRefresh((r) => r + 1);
  };

  const handleDuplicate = () => {
    const result = duplicateOpsDocument(
      documentId,
      `${doc.title}${t("admin_ops_doc_copy_suffix")}`,
      "admin1",
      t("admin_ops_doc_admin_nickname")
    );
    if (result) router.push(`/admin/ops-docs/${result.id}`);
  };

  return (
    <>
      <AdminPageHeader title={doc.title} backHref="/admin/ops-docs" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/ops-docs/${documentId}/edit`}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        >
          {t("admin_ops_doc_edit")}
        </Link>
        <button
          type="button"
          onClick={handleDuplicate}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        >
          {t("admin_ops_doc_duplicate")}
        </button>
        {doc.status === "active" && (
          <button
            type="button"
            onClick={() => handleStatusChange("archived")}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
          >
            {t("admin_ops_doc_archive")}
          </button>
        )}
        {(doc.status === "draft" || doc.status === "archived") && (
          <button
            type="button"
            onClick={() => handleStatusChange("active")}
            className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
          >
            {t("admin_ops_doc_activate")}
          </button>
        )}
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      {activeTab === "detail" && (
        <AdminCard>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 sam-text-body-secondary">
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-sam-fg">
                {t(OPS_DOC_TYPE_KEYS[doc.docType])}
              </span>
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-sam-fg">
                {t(OPS_DOC_CATEGORY_KEYS[doc.category])}
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  doc.status === "active"
                    ? "bg-emerald-50 text-emerald-800"
                    : doc.status === "draft"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-sam-surface-muted text-sam-muted"
                }`}
              >
                {t(OPS_DOC_STATUS_KEYS[doc.status])}
              </span>
              {doc.versionLabel && (
                <span className="text-sam-muted">v{doc.versionLabel}</span>
              )}
            </div>
            <p className="sam-text-body text-sam-fg">{doc.summary}</p>
            <div className="rounded border border-sam-border-soft bg-sam-app p-4 font-mono sam-text-body-secondary text-sam-fg whitespace-pre-wrap">
              {doc.content}
            </div>
            {doc.tags.length > 0 && (
              <p className="sam-text-body-secondary text-sam-muted">
                {t("admin_ops_doc_tags", { tags: doc.tags.join(", ") })}
              </p>
            )}
            <div className="border-t border-sam-border-soft pt-3 sam-text-body-secondary text-sam-muted">
              {t("admin_ops_doc_meta", {
                created: doc.createdByAdminNickname,
                updated: new Date(doc.updatedAt).toLocaleString(dateLocale),
              })}
              {doc.approvedByAdminNickname &&
                t("admin_ops_doc_approved", { by: doc.approvedByAdminNickname })}
            </div>
          </div>
        </AdminCard>
      )}
      {activeTab === "steps" && (
        <AdminCard titleKey="admin_ops_doc_card_steps">
          <OpsDocumentStepList documentId={documentId} />
        </AdminCard>
      )}
      {activeTab === "logs" && (
        <AdminCard titleKey="admin_ops_doc_card_logs">
          <OpsDocumentLogList documentId={documentId} />
        </AdminCard>
      )}
    </>
  );
}
