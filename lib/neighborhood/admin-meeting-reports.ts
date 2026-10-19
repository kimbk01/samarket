import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";

export type MeetingReportStatus = "pending" | "reviewing" | "resolved" | "rejected";
export type MeetingReportTargetType =
  | "meeting"
  | "member"
  | "feed_post"
  | "feed_comment"
  | "chat_message"
  | "album_item";

export interface MeetingReportRow {
  id: string;
  meeting_id: string | null;
  meeting_title: string | null;
  target_type: MeetingReportTargetType;
  target_id: string;
  reporter_user_id: string;
  reporter_name: string;
  reason_type: string;
  reason_detail: string | null;
  status: MeetingReportStatus;
  action_result: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function listMeetingReportsForAdmin(limit = 100): Promise<MeetingReportRow[]> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  const pageSize = Math.min(Math.max(limit, 1), 200);

  const { data, error } = await sb
    .from("meeting_reports")
    .select(
      "id, meeting_id, target_type, target_id, reporter_user_id, reason_type, reason_detail, status, action_result, reviewed_by, reviewed_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (error || !Array.isArray(data)) return [];

  const rows = data as Record<string, unknown>[];

  // 신고자 닉네임 조회
  const reporterIds = [...new Set(rows.map((r) => String(r.reporter_user_id ?? "")).filter(Boolean))];
  const nickMap = await fetchNicknamesForUserIds(sb as never, reporterIds);

  // 모임 제목 조회
  const meetingIds = [...new Set(rows.map((r) => r.meeting_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const meetingTitleMap = new Map<string, string>();
  if (meetingIds.length > 0) {
    const { data: meetings } = await sb.from("meetings").select("id, title").in("id", meetingIds);
    if (Array.isArray(meetings)) {
      for (const m of meetings as { id?: string; title?: string }[]) {
        if (m.id && m.title) meetingTitleMap.set(m.id, m.title);
      }
    }
  }

  return rows.map((r) => {
    const reporterId = String(r.reporter_user_id ?? "");
    const meetingId = r.meeting_id != null ? String(r.meeting_id) : null;
    const st = String(r.status ?? "pending");
    return {
      id: String(r.id),
      meeting_id: meetingId,
      meeting_title: meetingId ? (meetingTitleMap.get(meetingId) ?? null) : null,
      target_type: String(r.target_type ?? "meeting") as MeetingReportTargetType,
      target_id: String(r.target_id ?? ""),
      reporter_user_id: reporterId,
      reporter_name: nickMap.get(reporterId) ?? (reporterId ? reporterId.slice(0, 8) : "알 수 없음"),
      reason_type: String(r.reason_type ?? "etc"),
      reason_detail: r.reason_detail != null ? String(r.reason_detail) : null,
      status: (["pending", "reviewing", "resolved", "rejected"].includes(st)
        ? st
        : "pending") as MeetingReportStatus,
      action_result: r.action_result != null ? String(r.action_result) : null,
      reviewed_by: r.reviewed_by != null ? String(r.reviewed_by) : null,
      reviewed_at: r.reviewed_at != null ? String(r.reviewed_at) : null,
      created_at: String(r.created_at ?? ""),
    };
  });
}

/** 모임 신고 1건 (상태 전이 확인용) */
export async function getMeetingReportStatusForAdmin(
  sb: SupabaseClient,
  reportId: string
): Promise<{ ok: true; row: { status: MeetingReportStatus; action_result: string | null } | null } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("meeting_reports")
    .select("status, action_result")
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, row: null };
  const r = data as { status?: string; action_result?: string | null };
  return {
    ok: true,
    row: { status: String(r.status ?? "pending") as MeetingReportStatus, action_result: r.action_result ?? null },
  };
}

/**
 * 모임 신고 상태 변경 — CAS: 읽은 상태(expectedStatus)일 때만 반영, 0행이면 conflict.
 * actionResult 를 넘기지 않으면 기존 처리 결과를 지우지 않는다.
 */
export async function updateMeetingReportStatus(
  sb: SupabaseClient,
  input: {
    reportId: string;
    expectedStatus: MeetingReportStatus;
    status: MeetingReportStatus;
    reviewedBy: string;
    actionResult?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reopen = input.status === "pending";
  const update: Record<string, unknown> = {
    status: input.status,
    reviewed_by: reopen ? null : input.reviewedBy,
    reviewed_at: reopen ? null : new Date().toISOString(),
  };
  if (input.actionResult !== undefined) update.action_result = input.actionResult;

  const { data, error } = await sb
    .from("meeting_reports")
    .update(update)
    .eq("id", input.reportId)
    .eq("status", input.expectedStatus)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!Array.isArray(data) || data.length === 0) return { ok: false, error: "conflict" };
  return { ok: true };
}
