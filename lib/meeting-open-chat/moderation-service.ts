import type { SupabaseClient } from "@supabase/supabase-js";
import { insertMeetingOpenChatSystemMessage } from "./messages-service";
import {
  meetingOpenChatRoleCanAssignSubAdmin,
  meetingOpenChatRoleCanManage,
} from "./permissions";
import { syncMeetingOpenChatRoomCounts } from "./rooms-service";
import type { MeetingOpenChatMemberRole } from "./types";

function isMissingSchema(message: string): boolean {
  return /42P01|meeting_open_chat/i.test(message);
}

type MemberRow = {
  id: string;
  user_id: string;
  role: MeetingOpenChatMemberRole;
  status: string;
  open_nickname: string;
};

async function fetchActiveTarget(
  sb: SupabaseClient<any>,
  roomId: string,
  targetMemberId: string
): Promise<{ ok: true; row: MemberRow } | { ok: false; error: string; status: number }> {
  const { data, error } = await sb
    .from("meeting_open_chat_members")
    .select("id, user_id, role, status, open_nickname")
    .eq("room_id", roomId.trim())
    .eq("id", targetMemberId.trim())
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }
  const row = data as MemberRow | null;
  if (!row || row.status !== "active") {
    return { ok: false, error: "not_found", status: 404 };
  }
  return { ok: true, row };
}

function canActorModerateTarget(actorRole: MeetingOpenChatMemberRole, targetRole: MeetingOpenChatMemberRole): boolean {
  if (!meetingOpenChatRoleCanManage(actorRole)) return false;
  if (targetRole === "owner") return false;
  if (actorRole === "sub_admin" && targetRole !== "member") return false;
  return true;
}

export async function kickMeetingOpenChatMember(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
    targetMemberId: string;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const t = await fetchActiveTarget(sb, input.roomId, input.targetMemberId);
  if (!t.ok) return t;
  if (String(t.row.user_id) === input.actorUserId.trim()) {
    return { ok: false, error: "cannot_kick_self", status: 400 };
  }
  if (!canActorModerateTarget(input.actorRole, t.row.role)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("meeting_open_chat_members")
    .update({ status: "kicked", kicked_at: now, updated_at: now })
    .eq("id", t.row.id)
    .eq("room_id", input.roomId.trim());
  if (upErr) {
    if (isMissingSchema(upErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: upErr.message, status: 500 };
  }

  await syncMeetingOpenChatRoomCounts(sb, input.roomId);
  const nick = String(t.row.open_nickname ?? "").trim() || "member";
  await insertMeetingOpenChatSystemMessage(sb, {
    roomId: input.roomId,
    content: `${nick}님이 강제 퇴장되었습니다.`,
  });
  await sb.from("meeting_open_chat_logs").insert({
    room_id: input.roomId.trim(),
    actor_user_id: input.actorUserId.trim(),
    target_user_id: t.row.user_id,
    action_type: "member_kicked",
    action_detail: { target_member_id: t.row.id },
  });

  return { ok: true };
}

export async function banMeetingOpenChatMember(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
    targetMemberId: string;
    reason: string;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const t = await fetchActiveTarget(sb, input.roomId, input.targetMemberId);
  if (!t.ok) return t;
  if (String(t.row.user_id) === input.actorUserId.trim()) {
    return { ok: false, error: "cannot_ban_self", status: 400 };
  }
  if (!canActorModerateTarget(input.actorRole, t.row.role)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = input.roomId.trim();
  const targetUserId = t.row.user_id;
  const now = new Date().toISOString();
  const reason = input.reason.trim().slice(0, 500);

  await sb
    .from("meeting_open_chat_bans")
    .update({ is_active: false })
    .eq("room_id", rid)
    .eq("user_id", targetUserId)
    .eq("is_active", true);

  const { error: banErr } = await sb.from("meeting_open_chat_bans").insert({
    room_id: rid,
    user_id: targetUserId,
    reason,
    banned_by: input.actorUserId.trim(),
    banned_at: now,
    is_active: true,
  });
  if (banErr) {
    if (isMissingSchema(banErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: banErr.message, status: 500 };
  }

  const { error: upErr } = await sb
    .from("meeting_open_chat_members")
    .update({ status: "banned", banned_at: now, updated_at: now })
    .eq("id", t.row.id)
    .eq("room_id", rid);
  if (upErr) {
    return { ok: false, error: upErr.message, status: 500 };
  }

  await syncMeetingOpenChatRoomCounts(sb, input.roomId);
  const nick = String(t.row.open_nickname ?? "").trim() || "member";
  await insertMeetingOpenChatSystemMessage(sb, {
    roomId: input.roomId,
    content: `${nick}님이 운영 정책에 따라 차단되었습니다.`,
  });
  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: input.actorUserId.trim(),
    target_user_id: targetUserId,
    action_type: "member_banned",
    action_detail: { target_member_id: t.row.id, reason },
  });

  return { ok: true };
}

export async function setMeetingOpenChatMemberRole(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
    targetMemberId: string;
    newRole: "sub_admin" | "member";
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!meetingOpenChatRoleCanAssignSubAdmin(input.actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const t = await fetchActiveTarget(sb, input.roomId, input.targetMemberId);
  if (!t.ok) return t;
  if (t.row.role === "owner") {
    return { ok: false, error: "cannot_change_owner_role", status: 400 };
  }
  if (String(t.row.user_id) === input.actorUserId.trim()) {
    return { ok: false, error: "cannot_change_self_role", status: 400 };
  }

  if (input.newRole === "sub_admin" && t.row.role !== "member") {
    return { ok: false, error: "invalid_target_for_sub_admin", status: 400 };
  }
  if (input.newRole === "member" && t.row.role !== "sub_admin") {
    return { ok: false, error: "invalid_target_for_demote", status: 400 };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("meeting_open_chat_members")
    .update({ role: input.newRole, updated_at: now })
    .eq("id", t.row.id)
    .eq("room_id", input.roomId.trim());
  if (upErr) {
    if (isMissingSchema(upErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: upErr.message, status: 500 };
  }

  await sb.from("meeting_open_chat_logs").insert({
    room_id: input.roomId.trim(),
    actor_user_id: input.actorUserId.trim(),
    target_user_id: t.row.user_id,
    action_type: input.newRole === "sub_admin" ? "sub_admin_granted" : "sub_admin_revoked",
    action_detail: { target_member_id: t.row.id },
  });

  return { ok: true };
}

export async function blindMeetingOpenChatMessage(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    messageId: string;
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
    reason?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!meetingOpenChatRoleCanManage(input.actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = input.roomId.trim();
  const mid = input.messageId.trim();
  const { data: msg, error: mErr } = await sb
    .from("meeting_open_chat_messages")
    .select("id, room_id, message_type, is_blinded")
    .eq("id", mid)
    .eq("room_id", rid)
    .maybeSingle();
  if (mErr) {
    if (isMissingSchema(mErr.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: mErr.message, status: 500 };
  }
  if (!msg) return { ok: false, error: "not_found", status: 404 };
  const mrow = msg as { message_type: string; is_blinded: boolean };
  if (mrow.message_type === "system") {
    return { ok: false, error: "cannot_blind_system", status: 400 };
  }
  if (mrow.is_blinded) {
    return { ok: true };
  }

  const now = new Date().toISOString();
  const reason = (input.reason ?? "").trim().slice(0, 500) || null;
  const { error: upErr } = await sb
    .from("meeting_open_chat_messages")
    .update({
      is_blinded: true,
      blinded_reason: reason,
      blinded_by: input.actorUserId.trim(),
      updated_at: now,
    })
    .eq("id", mid)
    .eq("room_id", rid);
  if (upErr) {
    return { ok: false, error: upErr.message, status: 500 };
  }

  await insertMeetingOpenChatSystemMessage(sb, {
    roomId: input.roomId,
    content: "메시지가 운영정책에 따라 블라인드 처리되었습니다.",
  });
  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: input.actorUserId.trim(),
    action_type: "message_blinded",
    action_detail: { message_id: mid },
  });

  return { ok: true };
}
