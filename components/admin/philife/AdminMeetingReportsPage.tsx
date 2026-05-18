"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MeetingReportRow, MeetingReportStatus } from "@/lib/neighborhood/admin-meeting-reports";

const MEETING_REPORT_STATUS_KEYS = {
  pending: "admin_dashboard_report_pending",
  reviewing: "admin_report_status_reviewing",
  resolved: "admin_report_status_resolved",
  rejected: "admin_dashboard_report_rejected",
} as const satisfies Record<MeetingReportStatus, MessageKey>;

const STATUS_CLASS: Record<MeetingReportStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  reviewing: "bg-sky-100 text-sky-800",
  resolved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-sam-surface-muted text-sam-muted",
};

const TARGET_TYPE_KEYS: Record<string, MessageKey> = {
  meeting: "admin_meeting_reports_target_meeting",
  member: "admin_meeting_reports_target_member",
  feed_post: "admin_meeting_reports_target_feed_post",
  feed_comment: "admin_meeting_reports_target_feed_comment",
  chat_message: "admin_meeting_reports_target_chat_message",
  album_item: "admin_meeting_reports_target_album_item",
};

const REASON_TYPE_KEYS: Record<string, MessageKey> = {
  spam: "admin_report_reason_spam",
  abuse: "admin_meeting_reports_reason_abuse",
  sexual: "admin_meeting_reports_reason_sexual",
  illegal: "admin_meeting_reports_reason_illegal",
  impersonation: "admin_meeting_reports_reason_impersonation",
  off_topic: "admin_meeting_reports_reason_off_topic",
  etc: "admin_report_reason_other",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "-";
  return new Date(iso).toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ReportRowProps {
  report: MeetingReportRow;
  onStatusChange: (id: string, status: MeetingReportStatus, actionResult?: string) => Promise<void>;
}

function ReportItem({ report, onStatusChange }: ReportRowProps) {
  const { t: tr, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(report.action_result ?? "");
  const [localStatus, setLocalStatus] = useState<MeetingReportStatus>(report.status);
  const statusClass = STATUS_CLASS[localStatus];

  const targetLabel = TARGET_TYPE_KEYS[report.target_type]
    ? tr(TARGET_TYPE_KEYS[report.target_type]!)
    : report.target_type;
  const reasonLabel = REASON_TYPE_KEYS[report.reason_type]
    ? tr(REASON_TYPE_KEYS[report.reason_type]!)
    : report.reason_type;

  const handle = async (nextStatus: MeetingReportStatus) => {
    setBusy(true);
    await onStatusChange(report.id, nextStatus, note.trim() || undefined);
    setLocalStatus(nextStatus);
    setBusy(false);
  };

  return (
    <div className={`rounded-ui-rect border bg-sam-surface p-4 ${localStatus === "pending" ? "border-amber-200" : "border-sam-border-soft"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${statusClass}`}>
              {tr(MEETING_REPORT_STATUS_KEYS[localStatus])}
            </span>
            <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs text-sam-muted">
              {targetLabel}
            </span>
            <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs text-sam-muted">
              {reasonLabel}
            </span>
          </div>
          <p className="mt-1.5 truncate sam-text-body-secondary font-medium text-sam-fg">
            {report.meeting_title
              ? `[${report.meeting_title}] `
              : ""}
            {tr("admin_meeting_reports_reporter", { name: report.reporter_name })}
          </p>
          <p className="sam-text-xxs text-sam-meta">{formatDate(report.created_at, dateLocale)}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper text-sam-muted hover:bg-sam-app"
        >
          {expanded ? tr("nav_close") : tr("admin_do_common_detail")}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-sam-border-soft pt-3">
          <div className="sam-text-helper text-sam-muted">
            <span className="font-medium">{tr("admin_meeting_reports_target_id")} </span>
            <span className="font-mono sam-text-xxs">{report.target_id}</span>
          </div>
          {report.reason_detail && (
            <div className="rounded-ui-rect bg-sam-app p-2.5 sam-text-helper text-sam-fg">
              <p className="font-medium">{tr("admin_meeting_reports_reason_detail")}</p>
              <p className="mt-1 whitespace-pre-wrap">{report.reason_detail}</p>
            </div>
          )}
          {report.action_result && (
            <div className="sam-text-helper text-sam-muted">
              <span className="font-medium">{tr("admin_meeting_reports_action_result")} </span>
              {report.action_result}
            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={tr("admin_report_sanction_note_label")}
            className="w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg placeholder-sam-meta outline-none focus:border-sky-400"
          />

          <div className="flex flex-wrap gap-2">
            {localStatus !== "reviewing" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle("reviewing")}
                className="rounded-ui-rect bg-sky-100 px-3 py-1.5 sam-text-helper font-semibold text-sky-800 disabled:opacity-50 hover:bg-sky-200"
              >
                {tr("admin_meeting_reports_action_start_review")}
              </button>
            )}
            {localStatus !== "resolved" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle("resolved")}
                className="rounded-ui-rect bg-emerald-100 px-3 py-1.5 sam-text-helper font-semibold text-emerald-800 disabled:opacity-50 hover:bg-emerald-200"
              >
                {tr("admin_meeting_reports_action_resolve")}
              </button>
            )}
            {localStatus !== "rejected" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle("rejected")}
                className="rounded-ui-rect bg-sam-surface-muted px-3 py-1.5 sam-text-helper font-semibold text-sam-muted disabled:opacity-50 hover:bg-sam-border-soft"
              >
                {tr("admin_report_action_reject")}
              </button>
            )}
            {localStatus !== "pending" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle("pending")}
                className="rounded-ui-rect bg-amber-100 px-3 py-1.5 sam-text-helper font-semibold text-amber-800 disabled:opacity-50"
              >
                {tr("admin_meeting_reports_action_restore_pending")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type FilterTab = "all" | MeetingReportStatus;

const FILTER_TABS: { id: FilterTab; labelKey: MessageKey }[] = [
  { id: "all", labelKey: "admin_report_filter_all" },
  { id: "pending", labelKey: "admin_dashboard_report_pending" },
  { id: "reviewing", labelKey: "admin_report_status_reviewing" },
  { id: "resolved", labelKey: "admin_report_status_resolved" },
  { id: "rejected", labelKey: "admin_dashboard_report_rejected" },
];

interface AdminMeetingReportsPageProps {
  initialRows: MeetingReportRow[];
}

export function AdminMeetingReportsPage({ initialRows }: AdminMeetingReportsPageProps) {
  const { t: tr } = useI18n();
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<FilterTab>("all");

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const reviewingCount = rows.filter((r) => r.status === "reviewing").length;

  const handleStatusChange = async (
    id: string,
    status: MeetingReportStatus,
    actionResult?: string
  ) => {
    const res = await fetch(`/api/admin/philife/meeting-reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, action_result: actionResult }),
    });
    const j = (await res.json()) as { ok?: boolean };
    if (!j.ok) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status, action_result: actionResult ?? r.action_result }
          : r
      )
    );
  };

  return (
    <div className="space-y-4">
      {/* 요약 뱃지 */}
      <div className="flex flex-wrap gap-2 sam-text-helper">
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
            {tr("admin_meeting_reports_count_pending", { count: pendingCount })}
          </span>
        )}
        {reviewingCount > 0 && (
          <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-800">
            {tr("admin_meeting_reports_count_reviewing", { count: reviewingCount })}
          </span>
        )}
        <span className="rounded-full bg-sam-surface-muted px-3 py-1 text-sam-muted">
          {tr("admin_meeting_reports_count_total", { count: rows.length })}
        </span>
      </div>

      {/* 필터 탭 */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`rounded-full px-3 py-1 sam-text-helper font-medium transition-colors ${
              filter === t.id
                ? "bg-sam-ink text-white"
                : "bg-sam-surface-muted text-sam-muted hover:bg-sam-border-soft"
            }`}
          >
            {tr(t.labelKey)}
          </button>
        ))}
      </div>

      {/* 신고 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border py-12 text-center">
          <p className="sam-text-body text-sam-meta">
            {filter === "all"
              ? tr("admin_meeting_reports_empty_all")
              : tr("admin_meeting_reports_empty_filtered", {
                  status: tr(FILTER_TABS.find((tab) => tab.id === filter)!.labelKey),
                })}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <ReportItem key={r.id} report={r} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}
