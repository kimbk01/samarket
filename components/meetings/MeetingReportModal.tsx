"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

export type ReportTargetType =
  | "meeting"
  | "member"
  | "feed_post"
  | "feed_comment"
  | "chat_message"
  | "album_item";

interface MeetingReportModalProps {
  meetingId: string;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}

export function MeetingReportModal({
  meetingId,
  targetType,
  targetId,
  onClose,
}: MeetingReportModalProps) {
  const { t } = useI18n();
  const reasonOptions = useMemo(
    () =>
      [
        { value: "spam", label: t("meeting_report_reason_spam") },
        { value: "abuse", label: t("meeting_report_reason_abuse") },
        { value: "sexual", label: t("meeting_report_reason_sexual") },
        { value: "illegal", label: t("meeting_report_reason_illegal") },
        { value: "impersonation", label: t("meeting_report_reason_impersonation") },
        { value: "off_topic", label: t("meeting_report_reason_off_topic") },
        { value: "etc", label: t("meeting_report_reason_etc") },
      ] as const,
    [t],
  );
  const targetLabels = useMemo(
    (): Record<ReportTargetType, string> => ({
      meeting: t("meeting_report_target_meeting"),
      member: t("meeting_report_target_member"),
      feed_post: t("meeting_report_target_feed_post"),
      feed_comment: t("meeting_report_target_feed_comment"),
      chat_message: t("meeting_report_target_chat_message"),
      album_item: t("meeting_report_target_album_item"),
    }),
    [t],
  );
  const [reasonType, setReasonType] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async () => {
    if (!reasonType) {
      setErr(t("meeting_report_err_reason_required"));
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`/api/philife/meetings/${meetingId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          reason_type: reasonType,
          reason_detail: detail.trim() || null,
        }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        if (j.error === "already_reported") {
          setErr(t("meeting_report_err_already"));
        } else {
          setErr(t("meeting_report_err_failed"));
        }
        return;
      }
      setDone(true);
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setSubmitting(false);
    }
  };

  const sheetTitle = done
    ? t("meeting_report_submitted_title")
    : t("meeting_report_title", { target: targetLabels[targetType] });

  return (
    <DibayBottomSheet open onClose={onClose} title={sheetTitle} anchor="above-bottom-nav">
      {done ? (
        <div className="py-4 text-center">
          <p className={OverlayUi.bodySecondary}>{t("meeting_report_submitted_body")}</p>
          <div className="mt-5">
            <DibayOverlayButton roleTone="primary" onClick={onClose}>
              {t("common_close")}
            </DibayOverlayButton>
          </div>
        </div>
      ) : (
        <>
          <p className={OverlayUi.bodySecondary}>{t("meeting_report_pick_reason")}</p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {reasonOptions.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReasonType(r.value)}
                className={`rounded-[length:var(--overlay-radius-md)] border py-2.5 text-sm font-medium transition-colors ${
                  reasonType === r.value
                    ? "border-[color:var(--overlay-danger)] bg-red-50 text-[color:var(--overlay-danger)]"
                    : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] text-[color:var(--overlay-text-primary)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t("meeting_report_detail_placeholder")}
            className="mt-3 w-full resize-none rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-2.5 text-sm outline-none"
          />

          {err ? (
            <p className={`mt-2 ${OverlayUi.caption}`} style={{ color: "var(--overlay-danger)" }}>
              {err}
            </p>
          ) : null}

          <div className={`${OverlayUi.actionsRow} mt-4`}>
            <DibayOverlayButton roleTone="secondary" onClick={onClose}>
              {t("common_cancel")}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="destructive"
              disabled={submitting || !reasonType}
              loading={submitting}
              onClick={() => void onSubmit()}
            >
              {submitting ? t("meeting_report_submitting") : t("meeting_report_submit")}
            </DibayOverlayButton>
          </div>
        </>
      )}
    </DibayBottomSheet>
  );
}
