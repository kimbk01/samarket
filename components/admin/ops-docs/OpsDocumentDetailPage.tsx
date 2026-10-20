"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";
import { setOpsDocumentStatusWithLog, duplicateOpsDocument } from "@/lib/ops-docs/ops-docs-utils";
import {
  OPS_DOC_TYPE_KEYS,
  OPS_DOC_STATUS_KEYS,
  OPS_DOC_CATEGORY_KEYS,
} from "@/components/admin/i18n/admin-ops-doc-label-keys";
import { OpsDocumentStepList } from "./OpsDocumentStepList";
import { OpsDocumentLogList } from "./OpsDocumentLogList";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

type TabId = "detail" | "steps" | "logs";

const TAB_KEYS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "detail", labelKey: "admin_ops_doc_tab_detail" },
  { id: "steps", labelKey: "admin_ops_doc_tab_steps" },
  { id: "logs", labelKey: "admin_ops_doc_tab_logs" },
];

export function OpsDocumentDetailPage({ documentId }: { documentId: string }) {
  const { t } = useI18n();
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
        <AdminActionButton
          onClick={handleDuplicate}
          variant="secondary"
        >
          {t("admin_ops_doc_duplicate")}
        </AdminActionButton>
        {doc.status === "active" && (
          <AdminActionButton
            onClick={() => handleStatusChange("archived")}
            variant="secondary"
          >
            {t("admin_ops_doc_archive")}
          </AdminActionButton>
        )}
        {(doc.status === "draft" || doc.status === "archived") && (
          <AdminActionButton
            onClick={() => handleStatusChange("active")}
            variant="primary"
          >
            {t("admin_ops_doc_activate")}
          </AdminActionButton>
        )}
      </div>
      <AdminTabs
        tabs={TAB_KEYS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        syncUrl={false}
        className="mb-4"
      />
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
                    ? "bg-sam-success-soft text-sam-success"
                    : doc.status === "draft"
                      ? "bg-sam-warning-soft text-sam-warning"
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
                updated: formatAdminManilaDateTime(doc.updatedAt),
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
