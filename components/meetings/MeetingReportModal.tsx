"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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

  return (
    /* 배경 오버레이 */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 바텀 시트 */}
      <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface px-4 pb-8 pt-4 shadow-xl">
        {/* 핸들 */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-sam-border-soft" />

        {done ? (
          /* 완료 화면 */
          <div className="py-6 text-center">
            <p className="sam-text-hero">✅</p>
            <p className="mt-3 sam-text-body-lg font-semibold text-sam-fg">{t("meeting_report_submitted_title")}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("meeting_report_submitted_body")}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-ui-rect bg-sam-ink py-3 sam-text-body font-semibold text-white"
            >
              {t("common_close")}
            </button>
          </div>
        ) : (
          /* 신고 폼 */
          <>
            <h2 className="sam-text-body-lg font-semibold text-sam-fg">
              {t("meeting_report_title", { target: targetLabels[targetType] })}
            </h2>
            <p className="mt-0.5 sam-text-helper text-sam-muted">{t("meeting_report_pick_reason")}</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {reasonOptions.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReasonType(r.value)}
                  className={`rounded-ui-rect border py-2.5 sam-text-body-secondary font-medium transition-colors ${
                    reasonType === r.value
                      ? "border-red-400 bg-red-50 text-red-700"
                      : "border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app"
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
              className="mt-3 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body-secondary text-sam-fg placeholder-sam-meta outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100"
            />

            {err && <p className="mt-2 sam-text-helper text-red-500">{err}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-ui-rect border border-sam-border py-3 sam-text-body font-medium text-sam-muted"
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                disabled={submitting || !reasonType}
                onClick={() => void onSubmit()}
                className="flex-1 rounded-ui-rect bg-red-500 py-3 sam-text-body font-semibold text-white disabled:opacity-50"
              >
                {submitting ? t("meeting_report_submitting") : t("meeting_report_submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
