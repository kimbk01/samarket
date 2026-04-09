"use client";

import type { FeedVersion } from "@/lib/types/recommendation-experiment";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

interface FeedVersionTableProps {
  versions: FeedVersion[];
  onEdit?: (v: FeedVersion) => void;
}

export function FeedVersionTable({
  versions,
  onEdit,
}: FeedVersionTableProps) {
  if (versions.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        등록된 피드 버전이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              버전명
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              섹션 수
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              점수 오버라이드
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
            {onEdit && (
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                작업
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr
              key={v.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {v.versionName}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {SURFACE_LABELS[v.surface]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {v.sectionConfig.filter((s) => s.isActive).length} / {v.sectionConfig.length}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                {Object.keys(v.scoringOverrides).length
                  ? Object.entries(v.scoringOverrides)
                      .map(([k, val]) => `${k}:${val}`)
                      .join(", ")
                  : "-"}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    v.isActive ? "bg-emerald-50 text-emerald-800" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {v.isActive ? "활성" : "비활성"}
                </span>
              </td>
              {onEdit && (
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onEdit(v)}
                    className="text-[13px] text-signature hover:underline"
                  >
                    편집
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
