"use client";

import { useState } from "react";
import type { ReportTargetType } from "@/lib/types/report";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { addReport, hasReported } from "@/lib/reports/mock-reports";
import { submitReportDaangn } from "@/lib/reports/submitReportDaangn";
import { REPORT_REASONS } from "@/lib/reports/report-utils";
import { ReportReasonSelector } from "./ReportReasonSelector";

interface ReportActionSheetProps {
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  targetLabel?: string;
  /** 채팅방에서 신고 시 전달 (당근형: 채팅방 안에서 바로 처리) */
  roomId?: string | null;
  productId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReportActionSheet({
  targetType,
  targetId,
  targetUserId,
  targetLabel,
  roomId,
  productId,
  onClose,
  onSuccess,
}: ReportActionSheetProps) {
  const currentUser = getCurrentUser();
  const userId = getCurrentUserId();
  const alreadyReported = hasReported(userId, targetType, targetId);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonLabel, setReasonLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonCode) return;
    setError(null);
    setSubmitting(true);
    const selected = REPORT_REASONS.find((r) => r.code === reasonCode);
    const reasonText = reasonCode === "other" ? detail : (selected?.label ?? reasonLabel);

    if (currentUser?.id) {
      const daangnTargetType =
        targetType === "chat" ? "chat_room" : (targetType as "user" | "product" | "chat_message");
      const res = await submitReportDaangn({
        targetType: daangnTargetType,
        targetId,
        roomId: roomId ?? null,
        productId: productId ?? null,
        reasonCode,
        reasonText: reasonText || null,
      });
      setSubmitting(false);
      if (res.ok) {
        onSuccess();
        onClose();
        return;
      }
      setError(res.error ?? "신고 접수에 실패했습니다.");
      return;
    }

    addReport(
      userId,
      targetType,
      targetId,
      targetUserId,
      reasonCode,
      selected?.label ?? reasonLabel,
      detail
    );
    setSubmitting(false);
    onSuccess();
    onClose();
  };

  if (alreadyReported) {
    return (
      <div className="p-4">
        <p className="text-[14px] text-gray-600">이미 신고한 대상입니다.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-ui-rect border border-gray-200 py-2.5 text-[14px] text-gray-700"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <p className="mb-3 text-[14px] text-gray-600">
        {targetLabel && <span>{targetLabel} </span>}
        신고 사유를 선택해 주세요.
      </p>
      <ReportReasonSelector
        value={reasonCode}
        onChange={(code, label) => {
          setReasonCode(code);
          setReasonLabel(label);
        }}
      />
      {reasonCode === "other" && (
        <div className="mt-3">
          <label className="mb-1 block text-[13px] text-gray-600">
            기타 사유 (선택)
          </label>
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="구체적으로 적어 주세요"
            className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px] text-gray-900"
          />
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-ui-rect border border-gray-200 px-4 py-2.5 text-[14px] text-gray-600 disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!reasonCode || submitting}
          className="flex-1 rounded-ui-rect bg-signature py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
        >
          {submitting ? "접수 중…" : "신고하기"}
        </button>
      </div>
    </form>
  );
}
