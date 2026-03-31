import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingOpenChatReportReason } from "./types";

function isMissingSchema(message: string): boolean {
  return /42P01|meeting_open_chat_reports|does not exist/i.test(message);
}

const REASONS: MeetingOpenChatReportReason[] = [
  "spam",
  "abuse",
  "sexual",
  "illegal",
  "harassment",
  "impersonation",
  "advertisement",
  "other",
];

export function isMeetingOpenChatReportReason(v: string): v is MeetingOpenChatReportReason {
  return (REASONS as string[]).includes(v);
}

export async function createMeetingOpenChatReport(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    reporterUserId: string;
    targetMemberId: string;
    messageId?: string | null;
    reportReason: MeetingOpenChatReportReason;
    reportDetail: string;
  }
): Promise<{ ok: true; reportId: string } | { ok: false; error: string; status: number }> {
  const rid = input.roomId.trim();
  const targetMemberId = input.targetMemberId.trim();

  const { data: target, error: tErr } = await sb
    .from("meeting_open_chat_members")
    .select("id, user_id, status")
    .eq("room_id", rid)
    .eq("id", targetMemberId)
    .maybeSingle();

  if (tErr) {
    if (isMissingSchema(tErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: tErr.message, status: 500 };
  }
  const trow = target as { id?: string; user_id?: string; status?: string } | null;
  if (!trow || trow.status !== "active") {
    return { ok: false, error: "target_not_found", status: 404 };
  }
  const targetUserId = String(trow.user_id ?? "");
  if (!targetUserId || targetUserId === input.reporterUserId.trim()) {
    return { ok: false, error: "cannot_report_self", status: 400 };
  }

  let messageId: string | null = null;
  if (input.messageId?.trim()) {
    const mid = input.messageId.trim();
    const { data: msg } = await sb
      .from("meeting_open_chat_messages")
      .select("id")
      .eq("id", mid)
      .eq("room_id", rid)
      .maybeSingle();
    if (!msg) return { ok: false, error: "message_not_found", status: 404 };
    messageId = mid;
  }

  const detail = input.reportDetail.trim().slice(0, 2000);
  const { data: ins, error: insErr } = await sb
    .from("meeting_open_chat_reports")
    .insert({
      room_id: rid,
      message_id: messageId,
      reporter_user_id: input.reporterUserId.trim(),
      target_user_id: targetUserId,
      report_reason: input.reportReason,
      report_detail: detail,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !ins) {
    if (insErr && isMissingSchema(insErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: insErr?.message ?? "insert_failed", status: 500 };
  }

  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: input.reporterUserId.trim(),
    target_user_id: targetUserId,
    action_type: "report_submitted",
    action_detail: { report_reason: input.reportReason, target_member_id: targetMemberId },
  });

  return { ok: true, reportId: String((ins as { id: string }).id) };
}
