"use client";

import type { PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/mock-personalized-feed-policies";

interface PersonalizedPolicyTableProps {
  policies: PersonalizedFeedPolicy[];
  onEdit?: (policy: PersonalizedFeedPolicy) => void;
}

export function PersonalizedPolicyTable({
  policies,
  onEdit,
}: PersonalizedPolicyTableProps) {
  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        등록된 개인화 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              최대
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              가중치 요약
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
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
                {PERSONALIZED_SECTION_LABELS[p.sectionKey]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{p.maxItems}</td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-[13px] text-sam-muted">
                카테고리 {p.categoryAffinityWeight} / 최근본 {p.recentViewWeight} / 찜 {p.recentFavoriteWeight} / 채팅 {p.recentChatWeight}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-sam-border-soft text-sam-muted"
                  }`}
                >
                  {p.isActive ? "활성" : "비활성"}
                </span>
              </td>
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
