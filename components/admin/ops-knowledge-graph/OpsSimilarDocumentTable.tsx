"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import Link from "next/link";
import { getOpsSimilarDocumentRecommendations } from "@/lib/ops-knowledge-graph/mock-ops-similar-document-recommendations";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";

interface OpsSimilarDocumentTableProps {
  sourceDocumentId?: string | null;
}

export function OpsSimilarDocumentTable({ sourceDocumentId }: OpsSimilarDocumentTableProps) {
  const { t } = useI18n();
  const [selectedSource, setSelectedSource] = useState(sourceDocumentId ?? "");

  const recs = useMemo(
    () =>
      getOpsSimilarDocumentRecommendations({
        sourceDocumentId: selectedSource || undefined,
      }),
    [selectedSource]
  );

  const docMap = useMemo(() => {
    const ids = new Set(recs.map((r) => r.targetDocumentId));
    const map: Record<string, string> = {};
    ids.forEach((id) => {
      const doc = getOpsDocumentById(id);
      if (doc) map[id] = doc.title;
    });
    return map;
  }, [recs]);

  const getTitle = (documentId: string) => docMap[documentId] ?? documentId;

  if (!selectedSource && recs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <label className="mb-2 block sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_kg_similar_title")}</label>
        <input
          type="text"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          placeholder="od-1"
          className="w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body"
        />
        <p className="mt-4 sam-text-body text-sam-muted">{t("admin_ops_tools_kg_similar_hint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block sam-text-helper text-sam-muted">{t("admin_ops_tools_kg_base_doc")}</label>
        <input
          type="text"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          placeholder="od-1"
          className="w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      {recs.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kg_no_similar")}</div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[480px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_target")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_similarity")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_reason")}</th>
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/ops-docs/${r.targetDocumentId}`}
                      className="font-medium text-signature hover:underline"
                    >
                      {getTitle(r.targetDocumentId)}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {(r.similarityScore * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted sam-text-body-secondary">
                    {r.reasonLabels.join(", ") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
