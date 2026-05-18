"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsRunbookLinkedType } from "@/lib/types/ops-runbook";
import { getOpsDocuments } from "@/lib/ops-docs/mock-ops-documents";
import { startRunbookExecution } from "@/lib/ops-runbooks/ops-runbook-utils";
import { OPS_DOC_TYPE_KEYS } from "@/components/admin/i18n/admin-ops-doc-label-keys";
import type { MessageKey } from "@/lib/i18n/messages";
import { OPS_TOOLS_RUNBOOK_LINK_KEYS } from "@/components/admin/i18n/admin-ops-tools-label-keys";

const LINKED_OPTIONS: { value: OpsRunbookLinkedType; labelKey: MessageKey }[] = [
  { value: "incident", labelKey: OPS_TOOLS_RUNBOOK_LINK_KEYS.incident },
  { value: "deployment", labelKey: OPS_TOOLS_RUNBOOK_LINK_KEYS.deployment },
  { value: "rollback", labelKey: OPS_TOOLS_RUNBOOK_LINK_KEYS.rollback },
  { value: "fallback", labelKey: OPS_TOOLS_RUNBOOK_LINK_KEYS.feature_flag },
  { value: "kill_switch", labelKey: OPS_TOOLS_RUNBOOK_LINK_KEYS.kill_switch },
  { value: "manual", labelKey: OPS_TOOLS_RUNBOOK_LINK_KEYS.manual },
];

export function OpsRunbookStartForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [documentId, setDocumentId] = useState("");
  const [linkedType, setLinkedType] = useState<OpsRunbookLinkedType>("incident");
  const [linkedId, setLinkedId] = useState("");

  const activeDocs = useMemo(
    () => getOpsDocuments({ status: "active", sort: "updated" }),
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentId.trim()) return;
    const result = startRunbookExecution(
      documentId,
      linkedType,
      linkedId.trim() || null,
      "admin1",
      t("admin_ops_tools_admin_nickname")
    );
    if (result) router.push(`/admin/ops-runbooks/${result.executionId}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h3 className="sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_runbook_start_title")}</h3>
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_runbook_start_hint")}</p>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_tools_runbook_pick_doc")}</label>
        <select
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          required
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_ops_tools_runbook_select")}</option>
          {activeDocs.map((d) => (
            <option key={d.id} value={d.id}>
              [{t(OPS_DOC_TYPE_KEYS[d.docType])}] {d.title}
            </option>
          ))}
        </select>
        {activeDocs.length === 0 && (
          <p className="mt-1 sam-text-helper text-amber-600">{t("admin_ops_tools_runbook_no_active_doc")}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_tools_runbook_link_type")}</label>
        <select
          value={linkedType}
          onChange={(e) => setLinkedType(e.target.value as OpsRunbookLinkedType)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {LINKED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-fg">{t("admin_ops_tools_runbook_link_id")}</label>
        <input
          type="text"
          value={linkedId}
          onChange={(e) => setLinkedId(e.target.value)}
          placeholder={t("admin_ops_tools_runbook_link_id_ph")}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <button
        type="submit"
        disabled={!documentId.trim() || activeDocs.length === 0}
        className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
      >{t("admin_ops_tools_rb_log_start")}</button>
    </form>
  );
}
