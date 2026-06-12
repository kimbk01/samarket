"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useState } from "react";
import type { ReportTargetType } from "@/lib/types/report";
import { getCurrentUser } from "@/lib/auth/get-current-user";
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
  const { t } = useI18n();
  const currentUser = getCurrentUser();
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
    const reasonText = reasonCode === "other" ? detail : (t(selected?.labelKey ?? "ui_report_reason_other") ?? reasonLabel);

    if (!currentUser?.id) {
      setSubmitting(false);
      setError(t("auth_resource_access_denied"));
      return;
    }

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
    setError(res.error ?? t("ui_report_failed"));
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <p className="mb-3 sam-text-body text-sam-muted">
        {targetLabel && <span>{targetLabel} </span>}
        {t("ui_report_select_prompt")}
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
          <label className="mb-1 block sam-text-body-secondary text-sam-muted">
            {t("ui_report_other_optional")}
          </label>
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t("ui_report_detail_placeholder")}
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          />
        </div>
      )}
      {error && <p className="mt-2 sam-text-body-secondary text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-ui-rect border border-sam-border px-4 py-2.5 sam-text-body text-sam-muted disabled:opacity-50"
        >
          {t("common_cancel")}
        </button>
        <button
          type="submit"
          disabled={!reasonCode || submitting}
          className="flex-1 rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {submitting ? t("ui_report_submitting") : t("ui_report_submit")}
        </button>
      </div>
    </form>
  );
}
