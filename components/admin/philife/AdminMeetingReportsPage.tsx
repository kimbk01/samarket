"use client";

import { useState } from "react";
import type { MeetingReportRow, MeetingReportStatus } from "@/lib/neighborhood/admin-meeting-reports";

const STATUS_LABEL: Record<MeetingReportStatus, { label: string; className: string }> = {
  pending: { label: "대기", className: "bg-amber-100 text-amber-800" },
  reviewing: { label: "검토중", className: "bg-sky-100 text-sky-800" },
  resolved: { label: "처리완료", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "반려", className: "bg-sam-surface-muted text-sam-muted" },
};

const TARGET_LABEL: Record<string, string> = {
  meeting: "모임",
  member: "멤버",
  feed_post: "피드 글",
  feed_comment: "피드 댓글",
  chat_message: "채팅 메시지",
  album_item: "앨범 사진",
};

const REASON_LABEL: Record<string, string> = {
  spam: "스팸",
  abuse: "욕설/혐오",
  sexual: "음란물",
  illegal: "불법",
  impersonation: "사칭",
  off_topic: "주제 무관",
  etc: "기타",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
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
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(report.action_result ?? "");
  const [localStatus, setLocalStatus] = useState<MeetingReportStatus>(report.status);
  const statusBadge = STATUS_LABEL[localStatus];

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
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-[10px] text-sam-muted">
              {TARGET_LABEL[report.target_type] ?? report.target_type}
            </span>
            <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-[10px] text-sam-muted">
              {REASON_LABEL[report.reason_type] ?? report.reason_type}
            </span>
          </div>
          <p className="mt-1.5 truncate text-[13px] font-medium text-sam-fg">
            {report.meeting_title
              ? `[${report.meeting_title}] `
              : ""}
            신고자: {report.reporter_name}
          </p>
          <p className="text-[11px] text-sam-meta">{formatDate(report.created_at)}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px] text-sam-muted hover:bg-sam-app"
        >
          {expanded ? "닫기" : "상세"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-sam-border-soft pt-3">
          <div className="text-[12px] text-sam-muted">
            <span className="font-medium">대상 ID: </span>
            <span className="font-mono text-[11px]">{report.target_id}</span>
          </div>
          {report.reason_detail && (
            <div className="rounded-ui-rect bg-sam-app p-2.5 text-[12px] text-sam-fg">
              <p className="font-medium">신고 상세:</p>
              <p className="mt-1 whitespace-pre-wrap">{report.reason_detail}</p>
            </div>
          )}
          {report.action_result && (
            <div className="text-[12px] text-sam-muted">
              <span className="font-medium">조치 내용: </span>
              {report.action_result}
            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="조치 메모 (선택)"
            className="w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg placeholder-sam-meta outline-none focus:border-sky-400"
          />

          <div className="flex flex-wrap gap-2">
            {localStatus !== "reviewing" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle("reviewing")}
                className="rounded-ui-rect bg-sky-100 px-3 py-1.5 text-[12px] font-semibold text-sky-800 disabled:opacity-50 hover:bg-sky-200"
              >
                검토 시작
              </button>
            )}
            {localStatus !== "resolved" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle("resolved")}
                className="rounded-ui-rect bg-emerald-100 px-3 py-1.5 text-[12px] font-semibold text-emerald-800 disabled:opacity-50 hover:bg-emerald-200"
              >
                처리 완료
              </button>
            )}
            {localStatus !== "rejected" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle("rejected")}
                className="rounded-ui-rect bg-sam-surface-muted px-3 py-1.5 text-[12px] font-semibold text-sam-muted disabled:opacity-50 hover:bg-sam-border-soft"
              >
                반려
              </button>
            )}
            {localStatus !== "pending" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle("pending")}
                className="rounded-ui-rect bg-amber-100 px-3 py-1.5 text-[12px] font-semibold text-amber-800 disabled:opacity-50"
              >
                대기 복원
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type FilterTab = "all" | MeetingReportStatus;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "pending", label: "대기" },
  { id: "reviewing", label: "검토중" },
  { id: "resolved", label: "처리완료" },
  { id: "rejected", label: "반려" },
];

interface AdminMeetingReportsPageProps {
  initialRows: MeetingReportRow[];
}

export function AdminMeetingReportsPage({ initialRows }: AdminMeetingReportsPageProps) {
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
      <div className="flex flex-wrap gap-2 text-[12px]">
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
            대기 {pendingCount}건
          </span>
        )}
        {reviewingCount > 0 && (
          <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-800">
            검토중 {reviewingCount}건
          </span>
        )}
        <span className="rounded-full bg-sam-surface-muted px-3 py-1 text-sam-muted">
          전체 {rows.length}건
        </span>
      </div>

      {/* 필터 탭 */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
              filter === t.id
                ? "bg-sam-ink text-white"
                : "bg-sam-surface-muted text-sam-muted hover:bg-sam-border-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 신고 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border py-12 text-center">
          <p className="text-[14px] text-sam-meta">
            {filter === "all" ? "접수된 신고가 없습니다." : `'${FILTER_TABS.find((t) => t.id === filter)?.label}' 상태 신고 없음`}
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
