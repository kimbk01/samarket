import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCommunityChatRoomJoinedCount } from "./admin-service";
import { communityChatRoleCanManage } from "./room-access";
import type {
  CommunityChatMemberRole,
  CommunityChatReportCategory,
  CommunityChatReportStatus,
} from "./types";

function isMissingCommunityChatSchemaError(message: string): boolean {
  return /42P01|community_chat_rooms|does not exist/i.test(message);
}

const CATEGORIES = new Set<string>([
  "spam",
  "abuse",
  "sexual",
  "illegal",
  "advertisement",
  "impersonation",
  "harassment",
  "other",
]);

function assertMod(role: CommunityChatMemberRole): boolean {
  return communityChatRoleCanManage(role);
}

export async function submitCommunityChatMessageReport(
  sb: SupabaseClient<any>,
  roomId: string,
  messageId: string,
  reporterUserId: string,
  category: string,
  detail: string
): Promise<{ ok: true; reportId: string } | { ok: false; error: string; status: number }> {
  const rid = roomId.trim();
  const mid = messageId.trim();
  const cat = category.trim() as CommunityChatReportCategory;
  if (!CATEGORIES.has(cat)) {
    return { ok: false, error: "category_invalid", status: 400 };
  }
  const det = detail.trim().slice(0, 2000);

  const { data: msg } = await sb
    .from("community_chat_messages")
    .select("id, room_id, sender_user_id")
    .eq("id", mid)
    .maybeSingle();
  const m = msg as { room_id?: string; sender_user_id?: string | null } | null;
  if (!m || String(m.room_id) !== rid) {
    return { ok: false, error: "message_not_found", status: 404 };
  }
  if (m.sender_user_id && String(m.sender_user_id) === reporterUserId) {
    return { ok: false, error: "cannot_report_own_message", status: 400 };
  }

  const { data: inserted, error } = await sb
    .from("community_chat_reports")
    .insert({
      room_id: rid,
      message_id: mid,
      reporter_user_id: reporterUserId,
      category: cat,
      detail: det,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "already_reported", status: 409 };
    }
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const reportId = String((inserted as { id: string }).id);

  await sb.from("community_chat_logs").insert({
    room_id: rid,
    actor_user_id: reporterUserId,
    action_type: "report_received",
    target_message_id: mid,
    payload: { category: cat, report_id: reportId },
  });

  await maybeAutoBlindFromReportThreshold(sb, rid, mid);

  return { ok: true, reportId };
}

async function maybeAutoBlindFromReportThreshold(
  sb: SupabaseClient<any>,
  roomId: string,
  messageId: string
): Promise<void> {
  const { data: room } = await sb
    .from("community_chat_rooms")
    .select("report_threshold")
    .eq("id", roomId)
    .maybeSingle();
  const th = (room as { report_threshold?: number | null } | null)?.report_threshold;
  if (th == null || !Number.isFinite(Number(th)) || Number(th) < 1) return;

  const { count, error } = await sb
    .from("community_chat_reports")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId)
    .eq("status", "pending");
  if (error || count == null) return;
  if (count < Number(th)) return;

  const now = new Date().toISOString();
  await sb
    .from("community_chat_messages")
    .update({
      is_blinded: true,
      blind_reason: "auto_report_threshold",
      blinded_by: null,
      blinded_at: now,
    })
    .eq("id", messageId)
    .eq("room_id", roomId);
}

export async function blindCommunityChatMessage(
  sb: SupabaseClient<any>,
  roomId: string,
  messageId: string,
  actorUserId: string,
  actorRole: CommunityChatMemberRole,
  reason: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!assertMod(actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  const rid = roomId.trim();
  const mid = messageId.trim();
  const rs = reason.trim().slice(0, 500) || "moderation_blind";

  const { data: msg } = await sb
    .from("community_chat_messages")
    .select("id, room_id")
    .eq("id", mid)
    .maybeSingle();
  const m = msg as { room_id?: string } | null;
  if (!m || String(m.room_id) !== rid) {
    return { ok: false, error: "message_not_found", status: 404 };
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("community_chat_messages")
    .update({
      is_blinded: true,
      blind_reason: rs,
      blinded_by: actorUserId,
      blinded_at: now,
    })
    .eq("id", mid)
    .eq("room_id", rid);

  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  await sb.from("community_chat_logs").insert({
    room_id: rid,
    actor_user_id: actorUserId,
    action_type: "message_blinded",
    target_message_id: mid,
    payload: { reason: rs },
  });

  return { ok: true };
}

export async function kickCommunityChatMember(
  sb: SupabaseClient<any>,
  roomId: string,
  targetUserId: string,
  actorUserId: string,
  actorRole: CommunityChatMemberRole
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!assertMod(actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  const rid = roomId.trim();
  const tid = targetUserId.trim();
  if (!tid) return { ok: false, error: "bad_request", status: 400 };
  if (tid === actorUserId) {
    return { ok: false, error: "cannot_kick_self", status: 400 };
  }

  const { data: roomRow } = await sb
    .from("community_chat_rooms")
    .select("owner_user_id")
    .eq("id", rid)
    .maybeSingle();
  const ownerId = String((roomRow as { owner_user_id?: string } | null)?.owner_user_id ?? "");
  if (tid === ownerId) {
    return { ok: false, error: "cannot_kick_owner", status: 403 };
  }

  const { data: mem } = await sb
    .from("community_chat_room_members")
    .select("id, member_status, role")
    .eq("room_id", rid)
    .eq("user_id", tid)
    .maybeSingle();
  const row = mem as { id?: string; member_status?: string; role?: string } | null;
  if (!row?.id || row.member_status !== "joined") {
    return { ok: false, error: "target_not_joined", status: 400 };
  }
  if (row.role === "owner") {
    return { ok: false, error: "cannot_kick_owner", status: 403 };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("community_chat_room_members")
    .update({
      member_status: "kicked",
      kicked_at: now,
      kicked_by: actorUserId,
      updated_at: now,
    })
    .eq("id", row.id);

  if (upErr) {
    if (isMissingCommunityChatSchemaError(upErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: upErr.message, status: 500 };
  }

  const sync = await syncCommunityChatRoomJoinedCount(sb, rid);
  if (!sync.ok) return sync;

  await sb.from("community_chat_logs").insert({
    room_id: rid,
    actor_user_id: actorUserId,
    action_type: "member_kicked",
    target_user_id: tid,
    payload: {},
  });

  return { ok: true };
}

export async function banCommunityChatMember(
  sb: SupabaseClient<any>,
  roomId: string,
  targetUserId: string,
  actorUserId: string,
  actorRole: CommunityChatMemberRole,
  reason: string,
  banUntilIso: string | null
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!assertMod(actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  const rid = roomId.trim();
  const tid = targetUserId.trim();
  if (!tid) return { ok: false, error: "bad_request", status: 400 };
  if (tid === actorUserId) {
    return { ok: false, error: "cannot_ban_self", status: 400 };
  }

  const { data: roomRow } = await sb
    .from("community_chat_rooms")
    .select("owner_user_id")
    .eq("id", rid)
    .maybeSingle();
  const ownerId = String((roomRow as { owner_user_id?: string } | null)?.owner_user_id ?? "");
  if (tid === ownerId) {
    return { ok: false, error: "cannot_ban_owner", status: 403 };
  }

  let banUntil: string | null = null;
  if (banUntilIso?.trim()) {
    const t = new Date(banUntilIso.trim()).getTime();
    if (!Number.isFinite(t) || t <= Date.now()) {
      return { ok: false, error: "ban_until_invalid", status: 400 };
    }
    banUntil = new Date(t).toISOString();
  }

  const { data: existing } = await sb
    .from("community_chat_bans")
    .select("id")
    .eq("room_id", rid)
    .eq("user_id", tid)
    .is("released_at", null)
    .maybeSingle();

  if (existing?.id) {
    return { ok: false, error: "already_banned", status: 409 };
  }

  const { error: banErr } = await sb.from("community_chat_bans").insert({
    room_id: rid,
    user_id: tid,
    banned_by: actorUserId,
    reason: reason.trim().slice(0, 500),
    ban_until: banUntil,
  });

  if (banErr) {
    if (banErr.code === "23505") {
      return { ok: false, error: "already_banned", status: 409 };
    }
    if (isMissingCommunityChatSchemaError(banErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: banErr.message, status: 500 };
  }

  const kick = await kickCommunityChatMember(sb, rid, tid, actorUserId, actorRole);
  /** 이미 퇴장한 사용자만 차단한 경우 kick 은 실패할 수 있음 — 무시 */
  if (!kick.ok && kick.error !== "target_not_joined") {
    await sb
      .from("community_chat_bans")
      .update({ released_at: new Date().toISOString(), released_by: actorUserId })
      .eq("room_id", rid)
      .eq("user_id", tid)
      .is("released_at", null);
    return kick;
  }

  await sb.from("community_chat_logs").insert({
    room_id: rid,
    actor_user_id: actorUserId,
    action_type: "member_banned",
    target_user_id: tid,
    payload: { ban_until: banUntil, reason: reason.trim().slice(0, 200) },
  });

  return { ok: true };
}

export type RoomReportRow = {
  id: string;
  message_id: string;
  reporter_user_id: string;
  category: string;
  detail: string;
  status: CommunityChatReportStatus;
  created_at: string;
};

export async function listCommunityChatReports(
  sb: SupabaseClient<any>,
  roomId: string,
  status?: CommunityChatReportStatus | null
): Promise<{ ok: true; reports: RoomReportRow[] } | { ok: false; error: string; status: number }> {
  const rid = roomId.trim();
  let q = sb
    .from("community_chat_reports")
    .select("id, message_id, reporter_user_id, category, detail, status, created_at")
    .eq("room_id", rid)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  const reports = (data ?? []) as RoomReportRow[];
  return { ok: true, reports };
}

export async function resolveCommunityChatReport(
  sb: SupabaseClient<any>,
  roomId: string,
  reportId: string,
  actorUserId: string,
  actorRole: CommunityChatMemberRole,
  resolution: {
    status: CommunityChatReportStatus;
    resolutionNote?: string | null;
    banUntilIso?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!assertMod(actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const st = resolution.status;
  if (
    st !== "dismissed" &&
    st !== "action_blind" &&
    st !== "action_kick" &&
    st !== "action_ban"
  ) {
    return { ok: false, error: "status_invalid", status: 400 };
  }

  const rid = roomId.trim();
  const repId = reportId.trim();

  const { data: rep, error: rErr } = await sb
    .from("community_chat_reports")
    .select("id, room_id, message_id, status")
    .eq("id", repId)
    .maybeSingle();
  const r = rep as {
    room_id?: string;
    message_id?: string;
    status?: string;
  } | null;
  if (rErr || !r || String(r.room_id) !== rid) {
    return { ok: false, error: "report_not_found", status: 404 };
  }
  if (r.status !== "pending") {
    return { ok: false, error: "report_not_pending", status: 400 };
  }

  const messageId = String(r.message_id ?? "");
  const { data: msg } = await sb
    .from("community_chat_messages")
    .select("sender_user_id")
    .eq("id", messageId)
    .eq("room_id", rid)
    .maybeSingle();
  const senderId = (msg as { sender_user_id?: string | null } | null)?.sender_user_id ?? null;

  const now = new Date().toISOString();
  const note = (resolution.resolutionNote ?? "").trim().slice(0, 1000);

  if (st === "action_blind") {
    const b = await blindCommunityChatMessage(sb, rid, messageId, actorUserId, actorRole, note || "report_resolution");
    if (!b.ok) return b;
  } else if (st === "action_kick") {
    if (!senderId) {
      return { ok: false, error: "cannot_kick_system_message", status: 400 };
    }
    const k = await kickCommunityChatMember(sb, rid, String(senderId), actorUserId, actorRole);
    if (!k.ok) return k;
  } else if (st === "action_ban") {
    if (!senderId) {
      return { ok: false, error: "cannot_ban_system_message", status: 400 };
    }
    const b = await banCommunityChatMember(
      sb,
      rid,
      String(senderId),
      actorUserId,
      actorRole,
      note || "report_resolution",
      resolution.banUntilIso ?? null
    );
    if (!b.ok) {
      if (b.error === "already_banned") {
        /** 이미 차단된 경우에도 신고는 종료 처리 */
      } else {
        return b;
      }
    }
  }

  const { error: upErr } = await sb
    .from("community_chat_reports")
    .update({
      status: st,
      reviewed_by: actorUserId,
      reviewed_at: now,
      resolution_note: note || null,
      updated_at: now,
    })
    .eq("id", repId);

  if (upErr) {
    if (isMissingCommunityChatSchemaError(upErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: upErr.message, status: 500 };
  }

  await sb.from("community_chat_logs").insert({
    room_id: rid,
    actor_user_id: actorUserId,
    action_type: "report_resolved",
    target_message_id: messageId,
    payload: { report_id: repId, resolution: st },
  });

  return { ok: true };
}
