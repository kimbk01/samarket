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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        등록된 홈 피드 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              정렬
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              최대
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              지역범위
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              순서
            </th>
            {onEdit && (
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                작업
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {SECTION_LABELS[p.sectionKey]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SORT_MODE_LABELS[p.sortMode]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{p.maxItems}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {REGION_SCOPE_LABELS[p.regionScope]}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-sam-border-soft text-sam-muted"
                  }`}
                >
                  {p.isActive ? "활성" : "비활성"}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{p.priorityOrder}</td>
              {onEdit && (
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
                    className="sam-text-body-secondary text-signature hover:underline"
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
