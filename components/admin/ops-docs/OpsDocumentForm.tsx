"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { OpsDocType, OpsDocCategory } from "@/lib/types/ops-docs";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";
import { addOpsDocument, updateOpsDocument } from "@/lib/ops-docs/ops-docs-state";
import { addOpsDocumentLog } from "@/lib/ops-docs/ops-docs-state";
import { slugFromTitle } from "@/lib/ops-docs/ops-docs-utils";
import { persistOpsDocsToServer } from "@/lib/ops-docs/ops-docs-sync-client";

interface OpsDocumentFormProps {
  documentId?: string | null;
}

export function OpsDocumentForm({ documentId }: OpsDocumentFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const isEdit = !!documentId;

  const docTypeOptions = useMemo(
    () =>
      [
        { value: "sop" as const, labelKey: "admin_ops_doc_type_sop" as MessageKey },
        { value: "playbook" as const, labelKey: "admin_ops_doc_type_playbook" as MessageKey },
        { value: "scenario" as const, labelKey: "admin_ops_doc_type_scenario" as MessageKey },
      ],
    []
  );

  const categoryOptions = useMemo(
    () =>
      [
        { value: "incident_response" as const, labelKey: "admin_ops_doc_cat_incident" as MessageKey },
        { value: "deployment" as const, labelKey: "admin_ops_doc_cat_deployment" as MessageKey },
        { value: "rollback" as const, labelKey: "admin_ops_doc_cat_rollback" as MessageKey },
        { value: "moderation" as const, labelKey: "admin_ops_doc_cat_moderation" as MessageKey },
        { value: "recommendation" as const, labelKey: "admin_ops_doc_cat_recommendation" as MessageKey },
        { value: "ads" as const, labelKey: "admin_ops_doc_cat_ads" as MessageKey },
        { value: "points" as const, labelKey: "admin_ops_doc_cat_points" as MessageKey },
        { value: "support" as const, labelKey: "admin_ops_doc_cat_support" as MessageKey },
      ] satisfies { value: OpsDocCategory; labelKey: MessageKey }[],
    []
  );

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [docType, setDocType] = useState<OpsDocType>("playbook");
  const [category, setCategory] = useState<OpsDocCategory>("recommendation");
  const [status, setStatus] = useState<"draft" | "active">("draft");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [versionLabel, setVersionLabel] = useState("1.0");
  const [isPinned, setIsPinned] = useState(false);
  const [adminMemo, setAdminMemo] = useState("");

  useEffect(() => {
    if (documentId) {
      const doc = getOpsDocumentById(documentId);
      if (doc) {
        setTitle(doc.title);
        setSlug(doc.slug);
        setDocType(doc.docType);
        setCategory(doc.category);
        setStatus(doc.status === "archived" ? "draft" : doc.status);
        setSummary(doc.summary);
        setContent(doc.content);
        setTagsStr(doc.tags.join(", "));
        setVersionLabel(doc.versionLabel);
        setIsPinned(doc.isPinned);
        setAdminMemo(doc.adminMemo);
      }
    }
  }, [documentId]);

  const handleTitleBlur = () => {
    if (!isEdit && !slug) setSlug(slugFromTitle(title));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const adminId = "admin1";
    const adminNickname = t("admin_ops_doc_admin_nickname");

    if (isEdit && documentId) {
      updateOpsDocument(documentId, {
        title,
        slug,
        category,
        status,
        summary,
        content,
        tags,
        versionLabel,
        isPinned,
        adminMemo,
      });
      addOpsDocumentLog({
        documentId,
        actionType: "update",
        actorType: "admin",
        actorId: adminId,
        actorNickname: adminNickname,
        note: t("admin_ops_doc_save_note"),
        createdAt: new Date().toISOString(),
      });
      void persistOpsDocsToServer();
      router.push(`/admin/ops-docs/${documentId}`);
    } else {
      const doc = addOpsDocument({
        docType,
        title,
        slug: slug || slugFromTitle(title),
        category,
        status,
        summary,
        content,
        tags,
        versionLabel,
        isPinned,
        createdByAdminId: adminId,
        createdByAdminNickname: adminNickname,
        approvedByAdminId: null,
        approvedByAdminNickname: null,
        adminMemo,
      });
      addOpsDocumentLog({
        documentId: doc.id,
        actionType: "create",
        actorType: "admin",
        actorId: adminId,
        actorNickname: adminNickname,
        note: "",
        createdAt: doc.createdAt,
      });
      void persistOpsDocsToServer();
      router.push(`/admin/ops-docs/${doc.id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_title")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            required
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <div>
          <label className="mb-1 block sam-text-helper font-medium text-sam-fg">slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_type")}</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as OpsDocType)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {docTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_category")}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as OpsDocCategory)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {categoryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </div>
        {!isEdit && (
          <div>
            <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_status")}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "active")}
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="draft">{t("admin_ops_doc_status_draft")}</option>
              <option value="active">{t("admin_ops_doc_status_active")}</option>
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_version")}</label>
          <input
            type="text"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            className="w-20 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 sam-text-body text-sam-fg">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
            />
            {t("admin_ops_doc_label_pinned")}
          </label>
        </div>
      </div>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_summary")}</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_body")}</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body font-mono"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_tags")}</label>
        <input
          type="text"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder="feed, fallback, recommendation"
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_doc_label_admin_memo")}</label>
        <input
          type="text"
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {isEdit ? t("common_save") : t("admin_ops_doc_submit_create")}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg"
        >
          {t("common_cancel")}
        </button>
      </div>
    </form>
  );
}
