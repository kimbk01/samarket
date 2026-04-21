"use client";

import { useState } from "react";
import type { ReportActionType } from "@/lib/types/daangn";
import { applyReportActionDaangn } from "@/lib/admin-reports/applyReportActionDaangn";

const SANCTION_OPTIONS: { type: ReportActionType; label: string }[] = [
  { type: "reject", label: "반려" },
  { type: "warn", label: "경고" },
  { type: "chat_ban", label: "채팅 제한" },
  { type: "product_hide", label: "상품 숨김" },
  { type: "account_suspend", label: "계정 정지" },
  { type: "account_ban", label: "영구 정지" },
];

interface AdminSanctionPanelProps {
  reportId: string;
  targetUserId: string;
  targetLabel?: string;
  onActionSuccess?: () => void;
}

/**
 * 당근형: 신고 처리 제재 패널 — report_actions(제재 원장) + reports 갱신 + sanctions 반영
 */
export function AdminSanctionPanel({
  reportId,
  targetUserId,
  targetLabel,
  onActionSuccess,
}: AdminSanctionPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (actionType: ReportActionType) => {
    setError(null);
    setLoading(actionType);
    const res = await applyReportActionDaangn(reportId, actionType, targetUserId, {
      actionNote: note.trim() || null,
    });
    setLoading(null);
    if (res.ok) {
      onActionSuccess?.();
    } else {
      setError(res.error);
    }
  };

  return (
    <div>
      {error && <p className="mb-2 sam-text-body-secondary text-red-600">{error}</p>}
      {targetLabel && (
        <p className="mb-3 sam-text-body text-sam-muted">
          대상: <strong>{targetLabel}</strong> ({targetUserId || "—"})
        </p>
      )}
      <div className="mb-3">
        <label className="block sam-text-helper font-medium text-sam-muted">처리 메모 (선택)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="관리자 메모"
          className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body-secondary"
          rows={2}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {SANCTION_OPTIONS.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            disabled={loading !== null}
            onClick={() => handleAction(type)}
            className={`rounded border px-3 py-2 sam-text-body-secondary font-medium disabled:opacity-50 ${
              type === "reject"
                ? "border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app"
                : type === "account_ban"
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            {loading === type ? "처리 중..." : label}
          </button>
        ))}
      </div>
    </div>
  );
}
