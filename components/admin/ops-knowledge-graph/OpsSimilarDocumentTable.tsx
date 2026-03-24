"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getOpsSimilarDocumentRecommendations } from "@/lib/ops-knowledge-graph/mock-ops-similar-document-recommendations";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";

interface OpsSimilarDocumentTableProps {
  sourceDocumentId?: string | null;
}

export function OpsSimilarDocumentTable({ sourceDocumentId }: OpsSimilarDocumentTableProps) {
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
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label className="mb-2 block text-[14px] font-medium text-gray-700">
          문서 선택 (유사 문서 조회)
        </label>
        <input
          type="text"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          placeholder="od-1"
          className="w-full max-w-xs rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
        <p className="mt-4 text-[14px] text-gray-500">문서 ID를 입력하거나 목록에서 선택해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[12px] text-gray-600">기준 문서</label>
        <input
          type="text"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          placeholder="od-1"
          className="w-full max-w-xs rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      {recs.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
          유사 문서가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[480px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">대상 문서</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">유사도</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">사유</th>
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/ops-docs/${r.targetDocumentId}`}
                      className="font-medium text-signature hover:underline"
                    >
                      {getTitle(r.targetDocumentId)}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {(r.similarityScore * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-[13px]">
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
