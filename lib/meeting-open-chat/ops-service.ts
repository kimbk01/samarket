import type { SupabaseClient } from "@supabase/supabase-js";
import { insertMeetingOpenChatSystemMessage } from "./messages-service";
import { meetingOpenChatRoleCanManage } from "./permissions";
import {
  hasActiveMeetingOpenChatBan,
  syncMeetingOpenChatRoomCounts,
} from "./rooms-service";
import { blindMeetingOpenChatMessage } from "./moderation-service";
import type {
  MeetingOpenChatBanListItem,
  MeetingOpenChatJoinRequestListItem,
  MeetingOpenChatMemberRole,
  MeetingOpenChatReportListItem,
} from "./types";

function isMissingSchema(message: string): boolean {
  return /42P01|meeting_open_chat/i.test(message);
}

async function countActiveMembers(sb: SupabaseClient<any>, roomId: string): Promise<number> {
  const { count, error } = await sb
    .from("meeting_open_chat_members")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId.trim())
    .eq("status", "active");
  if (error) return 0;
  return count ?? 0;
}

async function nicknameForUserInRoom(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<string | null> {
  const { data } = await sb
    .from("meeting_open_chat_members")
    .select("open_nickname")
    .eq("room_id", roomId.trim())
    .eq("user_id", userId.trim())
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { open_nickname?: string } | null;
  if (!row) return null;
  return String(row.open_nickname ?? "").trim() || null;
}

export async function listPendingMeetingOpenChatJoinRequests(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<
  | { ok: true; requests: MeetingOpenChatJoinRequestListItem[] }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("meeting_open_chat_join_requests")
    .select("id, open_nickname, intro_message, created_at")
    .eq("room_id", roomId.trim())
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }

  const requests = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    openNickname: String(r.open_nickname ?? "").trim() || "member",
    introMessage: String(r.intro_message ?? "").trim(),
    createdAt: String(r.created_at ?? ""),
  }));

  return { ok: true, requests };
}

export async function resolveMeetingOpenChatJoinRequest(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    meetingId: string;
    requestId: string;
    decision: "approve" | "reject";
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!meetingOpenChatRoleCanManage(input.actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = input.roomId.trim();
  const reqId = input.requestId.trim();
  const now = new Date().toISOString();

  const { data: reqRow, error: reqErr } = await sb
    .from("meeting_open_chat_join_requests")
    .select("id, user_id, open_nickname, intro_message, open_profile_image_url, status")
    .eq("id", reqId)
    .eq("room_id", rid)
    .maybeSingle();

  if (reqErr) {
    if (isMissingSchema(reqErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: reqErr.message, status: 500 };
  }
  const req = reqRow as {
    user_id: string;
    open_nickname: string;
    intro_message: string;
    open_profile_image_url: string | null;
    status: string;
  } | null;
  if (!req || req.status !== "pending") {
    return { ok: false, error: "request_not_pending", status: 400 };
  }

  const applicantUserId = String(req.user_id);

  if (input.decision === "reject") {
    const { error: upReq } = await sb
      .from("meeting_open_chat_join_requests")
      .update({ status: "rejected", handled_by: input.actorUserId.trim(), handled_at: now })
      .eq("id", reqId)
      .eq("room_id", rid);
    if (upReq) return { ok: false, error: upReq.message, status: 500 };
    await syncMeetingOpenChatRoomCounts(sb, rid);
    await sb.from("meeting_open_chat_logs").insert({
      room_id: rid,
      actor_user_id: input.actorUserId.trim(),
      target_user_id: applicantUserId,
      action_type: "join_request_rejected",
      action_detail: { request_id: reqId },
    });
    return { ok: true };
  }

  const { data: roomRow, error: roomErr } = await sb
    .from("meeting_open_chat_rooms")
    .select("max_members, is_active, meeting_id")
    .eq("id", rid)
    .maybeSingle();
  if (roomErr || !roomRow) return { ok: false, error: "room_not_found", status: 404 };
  const room = roomRow as { max_members: number; is_active: boolean; meeting_id: string };
  if (String(room.meeting_id) !== input.meetingId.trim()) {
    return { ok: false, error: "not_found", status: 404 };
  }
  if (!room.is_active) return { ok: false, error: "room_not_active", status: 403 };

  if (await hasActiveMeetingOpenChatBan(sb, rid, applicantUserId)) {
    return { ok: false, error: "applicant_banned", status: 403 };
  }

  const activeCount = await countActiveMembers(sb, rid);
  const maxMembers = Number(room.max_members ?? 300);
  if (activeCount >= maxMembers) {
    return { ok: false, error: "room_full", status: 409 };
  }

  const openNickname = String(req.open_nickname ?? "").trim().slice(0, 40);
  if (!openNickname) return { ok: false, error: "invalid_request_nickname", status: 400 };

  const { data: existing } = await sb
    .from("meeting_open_chat_members")
    .select("id, status")
    .eq("room_id", rid)
    .eq("user_id", applicantUserId)
    .maybeSingle();
  const ex = existing as { id: string; status: string } | null;

  if (ex?.status === "active") {
    return { ok: false, error: "already_member", status: 409 };
  }

  if (ex?.id) {
    const { error: upMem } = await sb
      .from("meeting_open_chat_members")
      .update({
        status: "active",
        open_nickname: openNickname,
        open_profile_image_url: req.open_profile_image_url?.trim() || null,
        intro_message: String(req.intro_message ?? "").trim().slice(0, 500),
        kicked_at: null,
        banned_at: null,
        joined_at: now,
        last_seen_at: now,
        updated_at: now,
      })
      .eq("id", ex.id);
    if (upMem) {
      if (upMem.code === "23505") return { ok: false, error: "open_nickname_taken", status: 409 };
      return { ok: false, error: upMem.message, status: 500 };
    }
  } else {
    const { error: insMem } = await sb.from("meeting_open_chat_members").insert({
      room_id: rid,
      user_id: applicantUserId,
      role: "member",
      open_nickname: openNickname,
      open_profile_image_url: req.open_profile_image_url?.trim() || null,
      intro_message: String(req.intro_message ?? "").trim().slice(0, 500),
      status: "active",
      joined_at: now,
      last_seen_at: now,
      updated_at: now,
    });
    if (insMem) {
      if (insMem.code === "23505") return { ok: false, error: "open_nickname_taken", status: 409 };
      return { ok: false, error: insMem.message, status: 500 };
    }
  }

  const { error: upReq2 } = await sb
    .from("meeting_open_chat_join_requests")
    .update({ status: "approved", handled_by: input.actorUserId.trim(), handled_at: now })
    .eq("id", reqId)
    .eq("room_id", rid);
  if (upReq2) return { ok: false, error: upReq2.message, status: 500 };

  await syncMeetingOpenChatRoomCounts(sb, rid);
  await insertMeetingOpenChatSystemMessage(sb, {
    roomId: rid,
    content: `${openNickname}님이 입장했습니다.`,
  });
  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: input.actorUserId.trim(),
    target_user_id: applicantUserId,
    action_type: "join_request_approved",
    action_detail: { request_id: reqId },
  });

  return { ok: true };
}

export async function listPendingMeetingOpenChatReports(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<
  | { ok: true; reports: MeetingOpenChatReportListItem[] }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("meeting_open_chat_reports")
    .select("id, report_reason, report_detail, target_user_id, message_id, created_at")
    .eq("room_id", roomId.trim())
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }

  const rows = (data ?? []) as {
    id: string;
    report_reason: string;
    report_detail: string;
    target_user_id: string | null;
    message_id: string | null;
    created_at: string;
  }[];

  const reports: MeetingOpenChatReportListItem[] = [];
  for (const r of rows) {
    let targetOpenNickname: string | null = null;
    if (r.target_user_id) {
      targetOpenNickname = await nicknameForUserInRoom(sb, roomId, r.target_user_id);
    }
    reports.push({
      id: r.id,
      reportReason: r.report_reason,
      reportDetail: String(r.report_detail ?? ""),
      targetOpenNickname,
      messageId: r.message_id ? String(r.message_id) : null,
      createdAt: r.created_at,
    });
  }

  return { ok: true, reports };
}

export async function patchMeetingOpenChatReportStatus(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    reportId: string;
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
    status: "reviewed" | "rejected";
    /** 검토완료 시에만: 연결된 메시지가 있으면 블라인드 */
    blindAssociatedMessage?: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!meetingOpenChatRoleCanManage(input.actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = input.roomId.trim();
  const repId = input.reportId.trim();

  const { data: rep, error: rErr } = await sb
    .from("meeting_open_chat_reports")
    .select("id, message_id, status")
    .eq("id", repId)
    .eq("room_id", rid)
    .eq("status", "pending")
    .maybeSingle();

  if (rErr) {
    if (isMissingSchema(rErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: rErr.message, status: 500 };
  }
  if (!rep) {
    return { ok: false, error: "not_found", status: 404 };
  }

  const messageId = (rep as { message_id?: string | null }).message_id;
  if (
    input.blindAssociatedMessage &&
    input.status === "reviewed" &&
    messageId &&
    String(messageId).length > 0
  ) {
    const blind = await blindMeetingOpenChatMessage(sb, {
      roomId: rid,
      messageId: String(messageId),
      actorUserId: input.actorUserId.trim(),
      actorRole: input.actorRole,
      reason: "신고 처리",
    });
    if (!blind.ok) {
      return blind;
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await sb
    .from("meeting_open_chat_reports")
    .update({
      status: input.status,
      handled_by: input.actorUserId.trim(),
      handled_at: now,
    })
    .eq("id", repId)
    .eq("room_id", rid)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }
  if (!updated) {
    return { ok: false, error: "not_found", status: 404 };
  }

  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: input.actorUserId.trim(),
    action_type: input.status === "reviewed" ? "report_reviewed" : "report_rejected",
    action_detail: {
      report_id: repId,
      blinded: Boolean(input.blindAssociatedMessage && messageId && input.status === "reviewed"),
    },
  });

  return { ok: true };
}

export async function listActiveMeetingOpenChatBans(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<
  | { ok: true; bans: MeetingOpenChatBanListItem[] }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("meeting_open_chat_bans")
    .select("id, user_id, reason, banned_at")
    .eq("room_id", roomId.trim())
    .eq("is_active", true)
    .order("banned_at", { ascending: false });

  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }

  const rows = (data ?? []) as { id: string; user_id: string; reason: string; banned_at: string }[];
  const bans: MeetingOpenChatBanListItem[] = [];
  for (const b of rows) {
    const nick = await nicknameForUserInRoom(sb, roomId, b.user_id);
    bans.push({
      id: b.id,
      targetOpenNickname: nick,
      reason: String(b.reason ?? ""),
      bannedAt: b.banned_at,
    });
  }
  return { ok: true, bans };
}

export async function releaseMeetingOpenChatBan(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    banId: string;
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!meetingOpenChatRoleCanManage(input.actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = input.roomId.trim();
  const { data: ban, error: bErr } = await sb
    .from("meeting_open_chat_bans")
    .select("id, user_id, is_active")
    .eq("id", input.banId.trim())
    .eq("room_id", rid)
    .maybeSingle();

  if (bErr) {
    if (isMissingSchema(bErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: bErr.message, status: 500 };
  }
  const brow = ban as { user_id: string; is_active: boolean } | null;
  if (!brow || !brow.is_active) return { ok: false, error: "not_found", status: 404 };

  const now = new Date().toISOString();
  const { error: upBan } = await sb
    .from("meeting_open_chat_bans")
    .update({ is_active: false })
    .eq("id", input.banId.trim())
    .eq("room_id", rid);
  if (upBan) return { ok: false, error: upBan.message, status: 500 };

  await sb
    .from("meeting_open_chat_members")
    .update({ status: "left", updated_at: now })
    .eq("room_id", rid)
    .eq("user_id", brow.user_id)
    .eq("status", "banned");

  await syncMeetingOpenChatRoomCounts(sb, rid);
  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: input.actorUserId.trim(),
    target_user_id: brow.user_id,
    action_type: "ban_released",
    action_detail: { ban_id: input.banId },
  });

  return { ok: true };
}
