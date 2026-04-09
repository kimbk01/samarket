"use client";

import type { HomeFeedPolicy } from "@/lib/types/home-feed";
import {
  SECTION_LABELS,
  SORT_MODE_LABELS,
  REGION_SCOPE_LABELS,
} from "@/lib/home-feed/mock-home-feed-policies";

interface HomeFeedPolicyTableProps {
  policies: HomeFeedPolicy[];
  onEdit?: (policy: HomeFeedPolicy) => void;
}

export function HomeFeedPolicyTable({
  policies,
  onEdit,
}: HomeFeedPolicyTableProps) {
  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        등록된 홈 피드 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              정렬
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              최대
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              지역범위
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              순서
            </th>
            {onEdit && (
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                작업
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {SECTION_LABELS[p.sectionKey]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {SORT_MODE_LABELS[p.sortMode]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">{p.maxItems}</td>
              <td className="px-3 py-2.5 text-gray-700">
                {REGION_SCOPE_LABELS[p.regionScope]}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {p.isActive ? "활성" : "비활성"}
                </span>
              </td>
              <td className="px-3 py-2.5 text-gray-700">{p.priorityOrder}</td>
              {onEdit && (
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
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
