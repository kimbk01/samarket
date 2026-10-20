"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsSimilarDocumentRecommendations } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";

interface OpsSimilarDocumentTableProps {
  sourceDocumentId?: string | null;
}

export function OpsSimilarDocumentTable({ sourceDocumentId }: OpsSimilarDocumentTableProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 기준 문서 ID 는 주소(`?q=`)에 보존 — 입력 후 「조회」/Enter 로 적용 (R7). */
  const lq = useAdminListQuery();
  const selectedSource = lq.query.q || sourceDocumentId || "";

  const recs = useMemo(
    () =>
      getOpsSimilarDocumentRecommendations({
        sourceDocumentId: selectedSource || undefined,
        limit: Number.MAX_SAFE_INTEGER,
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
      <div className="space-y-3">
        <p className="sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_kg_similar_title")}</p>
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        searchPlaceholder="od-1"
      />
        <p className="sam-text-body text-sam-muted">{t("admin_ops_tools_kg_similar_hint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_kg_base_doc")}</p>
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        searchPlaceholder="od-1"
      />

      {recs.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_ops_tools_kg_no_similar")} onReset={lq.isFiltered ? lq.reset : undefined} />
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
