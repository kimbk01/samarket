"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useId, useState } from "react";
import type { ReportTargetType } from "@/lib/types/report";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { submitReport } from "@/lib/reports/submitReport";
import { REPORT_REASONS } from "@/lib/reports/report-utils";
import { ReportReasonSelector } from "./ReportReasonSelector";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

interface ReportActionSheetProps {
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  targetLabel?: string;
  /** 채팅방에서 신고 시 전달 (채팅방 안에서 바로 처리) */
  roomId?: string | null;
  productId?: string | null;
  title?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReportActionSheet({
  targetType,
  targetId,
  targetUserId: _targetUserId,
  targetLabel,
  roomId,
  productId,
  title,
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
  /** 실기 v6 FAIL 5: 버튼은 스크롤 밖 고정 하단(`footer`) — 제출은 `form` 속성으로 이 form 을 가리킨다 */
  const formId = useId();

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

    const reportTargetType =
      targetType === "chat" ? "chat_room" : (targetType as "user" | "product" | "chat_message" | "feed_ad");
    const res = await submitReport({
      targetType: reportTargetType,
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
    <DibayBottomSheet
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={title ?? t("nav_messenger_report")}
      ariaLabel={title ?? t("nav_messenger_report")}
      footer={
        <div className={OverlayUi.actionsRow} data-report-sheet-footer="1">
          <DibayOverlayButton roleTone="secondary" type="button" disabled={submitting} onClick={onClose}>
            {t("common_cancel")}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="primary" type="submit" form={formId} disabled={!reasonCode || submitting}>
            {submitting ? t("ui_report_submitting") : t("ui_report_submit")}
          </DibayOverlayButton>
        </div>
      }
    >
      <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="px-1 pb-2">
        <p className={`mb-3 ${OverlayUi.bodySecondary}`}>
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
            <label className={`mb-1 block ${OverlayUi.caption}`}>
              {t("ui_report_other_optional")}
            </label>
            <input
              type="text"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t("ui_report_detail_placeholder")}
              className="w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-3 py-2 text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)]"
            />
          </div>
        )}
        {error && <p className={`mt-2 ${OverlayUi.captionDanger}`}>{error}</p>}
      </form>
    </DibayBottomSheet>
  );
}
