"use client";

import { useState } from "react";
import type { Report } from "@/lib/types/report";
import type { ModerationActionType } from "@/lib/types/report";
import { applyModerationAction } from "@/lib/admin-reports/apply-moderation";

interface AdminModerationActionPanelProps {
  report: Report;
  onActionSuccess: () => void;
}

const ACTIONS_BY_TARGET: Record<
  Report["targetType"],
  { type: ModerationActionType; label: string }[]
> = {
  product: [
    { type: "review_only", label: "검토완료" },
    { type: "reject_report", label: "반려" },
    { type: "warn", label: "경고" },
    { type: "suspend", label: "일시정지" },
    { type: "ban", label: "영구정지" },
    { type: "blind_product", label: "상품 블라인드" },
    { type: "delete_product", label: "상품 삭제" },
  ],
  chat: [
    { type: "review_only", label: "검토완료" },
    { type: "reject_report", label: "반려" },
    { type: "warn", label: "경고" },
  ],
  user: [
    { type: "review_only", label: "검토완료" },
    { type: "reject_report", label: "반려" },
    { type: "warn", label: "경고" },
    { type: "suspend", label: "일시정지" },
    { type: "ban", label: "영구정지" },
  ],
  community: [],
};

export function AdminModerationActionPanel({
  report,
  onActionSuccess,
}: AdminModerationActionPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (report.status !== "pending") {
    return (
      <p className="text-[14px] text-gray-500">
        이미 처리된 신고입니다. (상태: {report.status === "reviewed" ? "검토완료" : "반려"})
      </p>
    );
  }

  const actions = ACTIONS_BY_TARGET[report.targetType];

  if (report.targetType === "community") {
    return (
      <p className="text-[14px] text-gray-500">
        동네생활 피드 신고는{" "}
        <a href="/admin/community/reports" className="font-medium text-signature underline">
          피드 신고 관리
        </a>
        에서 상태를 변경하세요.
      </p>
    );
  }

  const handleAction = (actionType: ModerationActionType) => {
    setLoading(actionType);
    const result = applyModerationAction(report.id, actionType);
    setLoading(null);
    if (result.ok) {
      onActionSuccess();
    } else {
      alert(result.message ?? "처리 실패");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          disabled={loading !== null}
          onClick={() => handleAction(type)}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading === type ? "처리 중..." : label}
        </button>
      ))}
    </div>
  );
}
