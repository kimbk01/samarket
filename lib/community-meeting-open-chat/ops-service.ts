import type { SupabaseClient } from "@supabase/supabase-js";
import {
  syncCommunityChatPendingJoinCount,
  syncCommunityChatRoomJoinedCount,
} from "./admin-service";
import type { CommunityChatMemberRole } from "./types";
import { communityChatRoleCanManage } from "./room-access";

function isMissingCommunityChatSchemaError(message: string): boolean {
  return /42P01|community_chat_rooms|does not exist/i.test(message);
}

async function countJoined(sb: SupabaseClient<any>, roomId: string): Promise<number> {
  const { count, error } = await sb
    .from("community_chat_room_members")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId.trim())
    .eq("member_status", "joined");
  if (error) return 0;
  return count ?? 0;
}

async function hasActiveBan(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<boolean> {
  const { data } = await sb
    .from("community_chat_bans")
    .select("id, ban_until")
    .eq("room_id", roomId.trim())
    .eq("user_id", userId.trim())
    .is("released_at", null)
    .maybeSingle();
  if (!data) return false;
  const until = (data as { ban_until?: string | null }).ban_until;
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

// --- 입장 신청 ---

export type JoinRequestRow = {
  id: string;
  room_id: string;
  user_id: string;
  nickname: string;
  request_message: string;
  status: string;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  reject_reason: string | null;
};

export async function listCommunityChatJoinRequests(
  sb: SupabaseClient<any>,
  roomId: string,
  status?: string | null
): Promise<{ ok: true; requests: JoinRequestRow[] } | { ok: false; error: string; status: number }> {
  let q = sb
    .from("community_chat_join_requests")
    .select(
      "id, room_id, user_id, nickname, request_message, status, requested_at, resolved_by, resolved_at, reject_reason"
    )
    .eq("room_id", roomId.trim())
    .order("requested_at", { ascending: false })
    .limit(200);
  if (status?.trim()) {
    q = q.eq("status", status.trim());
  }
  const { data, error } = await q;
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true, requests: (data ?? []) as JoinRequestRow[] };
}

export async function resolveCommunityChatJoinRequest(
  sb: SupabaseClient<any>,
  roomId: string,
  requestId: string,
  actorUserId: string,
  actorRole: CommunityChatMemberRole,
  decision: "approve" | "reject",
  rejectReason?: string | null
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!communityChatRoleCanManage(actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = roomId.trim();
  const reqId = requestId.trim();
  const now = new Date().toISOString();

  const { data: reqRow, error: rErr } = await sb
    .from("community_chat_join_requests")
    .select("id, room_id, user_id, nickname, status")
    .eq("id", reqId)
    .maybeSingle();
  const req = reqRow as JoinRequestRow | null;
  if (rErr || !req || String(req.room_id) !== rid) {
    return { ok: false, error: "request_not_found", status: 404 };
  }
  if (req.status !== "pending") {
    return { ok: false, error: "request_not_pending", status: 400 };
  }

  const uid = String(req.user_id);

  if (decision === "reject") {
    const { error: upErr } = await sb
      .from("community_chat_join_requests")
      .update({
        status: "rejected",
        resolved_by: actorUserId,
        resolved_at: now,
        reject_reason: (rejectReason ?? "").trim().slice(0, 500) || null,
        updated_at: now,
      })
      .eq("id", reqId);
    if (upErr) {
      if (isMissingCommunityChatSchemaError(upErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: upErr.message, status: 500 };
    }
    const syncP = await syncCommunityChatPendingJoinCount(sb, rid);
    if (!syncP.ok) return syncP;
    await sb.from("community_chat_logs").insert({
      room_id: rid,
      actor_user_id: actorUserId,
      action_type: "join_rejected",
      target_user_id: uid,
      payload: { request_id: reqId },
    });
    return { ok: true };
  }

  /** approve */
  if (await hasActiveBan(sb, rid, uid)) {
    return { ok: false, error: "user_banned", status: 403 };
  }

  const { data: roomMeta } = await sb
    .from("community_chat_rooms")
    .select("max_members, status")
    .eq("id", rid)
    .maybeSingle();
  const rm = roomMeta as { max_members?: number; status?: string } | null;
  if (!rm || String(rm.status) !== "active") {
    return { ok: false, error: "room_not_active", status: 403 };
  }
  const maxM = Number(rm.max_members ?? 300);
  const joined = await countJoined(sb, rid);
  if (joined >= maxM) {
    return { ok: false, error: "room_full", status: 409 };
  }

  const nick = String(req.nickname ?? "").trim().slice(0, 40) || "member";

  const { data: mem } = await sb
    .from("community_chat_room_members")
    .select("id, member_status, role")
    .eq("room_id", rid)
    .eq("user_id", uid)
    .maybeSingle();
  const m = mem as { id?: string; member_status?: string; role?: string } | null;
  const keepOwnerRole = m?.role === "owner";

  if (m?.id) {
    const { error: mu } = await sb
      .from("community_chat_room_members")
      .update({
        member_status: "joined",
        nickname: nick,
        role: keepOwnerRole ? "owner" : "member",
        left_at: null,
        kicked_at: null,
        kicked_by: null,
        joined_at: now,
        updated_at: now,
      })
      .eq("id", m.id);
    if (mu) {
      if (isMissingCommunityChatSchemaError(mu.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: mu.message, status: 500 };
    }
  } else {
    const { error: insErr } = await sb.from("community_chat_room_members").insert({
      room_id: rid,
      user_id: uid,
      role: "member",
      nickname: nick,
      member_status: "joined",
      joined_at: now,
      updated_at: now,
    });
    if (insErr) {
      if (isMissingCommunityChatSchemaError(insErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: insErr.message, status: 500 };
    }
  }

  const { error: reqUp } = await sb
    .from("community_chat_join_requests")
    .update({
      status: "approved",
      resolved_by: actorUserId,
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", reqId);
  if (reqUp) {
    return { ok: false, error: reqUp.message, status: 500 };
  }

  const syncP = await syncCommunityChatPendingJoinCount(sb, rid);
  if (!syncP.ok) return syncP;
  const syncJ = await syncCommunityChatRoomJoinedCount(sb, rid);
  if (!syncJ.ok) return syncJ;

  await sb.from("community_chat_logs").insert({
    room_id: rid,
    actor_user_id: actorUserId,
    action_type: "join_approved",
    target_user_id: uid,
    payload: { request_id: reqId },
  });

  return { ok: true };
}

// --- 공지 ---

export type NoticeRow = {
  id: string;
  room_id: string;
  author_user_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  pin_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listCommunityChatNotices(
  sb: SupabaseClient<any>,
  roomId: string,
  includeInactive: boolean
): Promise<{ ok: true; notices: NoticeRow[] } | { ok: false; error: string; status: number }> {
  let q = sb
    .from("community_chat_notices")
    .select(
      "id, room_id, author_user_id, title, body, is_pinned, pin_order, is_active, created_at, updated_at"
    )
    .eq("room_id", roomId.trim())
    .order("is_pinned", { ascending: false })
    .order("pin_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);
  if (!includeInactive) {
    q = q.eq("is_active", true);
  }
  const { data, error } = await q;
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true, notices: (data ?? []) as NoticeRow[] };
}

export async function createCommunityChatNotice(
  sb: SupabaseClient<any>,
  roomId: string,
  authorUserId: string,
  actorRole: CommunityChatMemberRole,
  input: { title: string; body: string; isPinned?: boolean; pinOrder?: number }
): Promise<{ ok: true; notice: { id: string } } | { ok: false; error: string; status: number }> {
  if (!communityChatRoleCanManage(actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  const title = input.title.trim().slice(0, 200);
  const body = input.body.trim().slice(0, 8000);
  if (!title && !body) {
    return { ok: false, error: "title_or_body_required", status: 400 };
  }

  const { data, error } = await sb
    .from("community_chat_notices")
    .insert({
      room_id: roomId.trim(),
      author_user_id: authorUserId,
      title: title || "(공지)",
      body,
      is_pinned: input.isPinned === true,
      pin_order: Math.round(Number(input.pinOrder) || 0),
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error && isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error?.message ?? "insert_failed", status: 500 };
  }

  await sb.from("community_chat_logs").insert({
    room_id: roomId.trim(),
    actor_user_id: authorUserId,
    action_type: "notice_created",
    payload: { notice_id: (data as { id: string }).id },
  });

  return { ok: true, notice: { id: String((data as { id: string }).id) } };
}

export async function patchCommunityChatNotice(
  sb: SupabaseClient<any>,
  roomId: string,
  noticeId: string,
  actorUserId: string,
  actorRole: CommunityChatMemberRole,
  patch: {
    title?: string;
    body?: string;
    isPinned?: boolean;
    pinOrder?: number;
    isActive?: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!communityChatRoleCanManage(actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const nid = noticeId.trim();
  const { data: row } = await sb
    .from("community_chat_notices")
    .select("id, room_id")
    .eq("id", nid)
    .maybeSingle();
  const n = row as { room_id?: string } | null;
  if (!n || String(n.room_id) !== roomId.trim()) {
    return { ok: false, error: "not_found", status: 404 };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updates.title = patch.title.trim().slice(0, 200);
  if (patch.body !== undefined) updates.body = patch.body.trim().slice(0, 8000);
  if (patch.isPinned !== undefined) updates.is_pinned = patch.isPinned === true;
  if (patch.pinOrder !== undefined) updates.pin_order = Math.round(Number(patch.pinOrder) || 0);
  if (patch.isActive !== undefined) updates.is_active = patch.isActive !== false;

  const keys = Object.keys(updates).filter((k) => k !== "updated_at");
  if (keys.length === 0) return { ok: true };

  const { error } = await sb.from("community_chat_notices").update(updates).eq("id", nid);
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const softDelete =
    keys.length === 1 && keys[0] === "is_active" && updates.is_active === false;
  await sb.from("community_chat_logs").insert({
    room_id: roomId.trim(),
    actor_user_id: actorUserId,
    action_type: softDelete ? "notice_deleted" : "notice_updated",
    payload: { notice_id: nid, fields: keys },
  });

  return { ok: true };
}

// --- 차단 목록 · 요약 ---

export type BanListRow = {
  id: string;
  user_id: string;
  banned_by: string;
  reason: string;
  ban_until: string | null;
  created_at: string;
};

export async function listActiveCommunityChatBans(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<{ ok: true; bans: BanListRow[] } | { ok: false; error: string; status: number }> {
  const { data, error } = await sb
    .from("community_chat_bans")
    .select("id, user_id, banned_by, reason, ban_until, created_at")
    .eq("room_id", roomId.trim())
    .is("released_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  const now = Date.now();
  const bans = ((data ?? []) as BanListRow[]).filter((b) => {
    if (!b.ban_until) return true;
    return new Date(b.ban_until).getTime() > now;
  });
  return { ok: true, bans };
}

export async function getCommunityChatAdminSummary(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<
  | {
      ok: true;
      summary: {
        pendingJoinRequests: number;
        pendingReports: number;
        activeBans: number;
        activeNotices: number;
        pinnedNotices: number;
      };
    }
  | { ok: false; error: string; status: number }
> {
  const rid = roomId.trim();

  const [pj, pr, bn, nt, pin] = await Promise.all([
    sb
      .from("community_chat_join_requests")
      .select("id", { count: "exact", head: true })
      .eq("room_id", rid)
      .eq("status", "pending"),
    sb
      .from("community_chat_reports")
      .select("id", { count: "exact", head: true })
      .eq("room_id", rid)
      .eq("status", "pending"),
    sb
      .from("community_chat_bans")
      .select("id", { count: "exact", head: true })
      .eq("room_id", rid)
      .is("released_at", null),
    sb
      .from("community_chat_notices")
      .select("id", { count: "exact", head: true })
      .eq("room_id", rid)
      .eq("is_active", true),
    sb
      .from("community_chat_notices")
      .select("id", { count: "exact", head: true })
      .eq("room_id", rid)
      .eq("is_active", true)
      .eq("is_pinned", true),
  ]);

  const firstErr = pj.error ?? pr.error ?? bn.error ?? nt.error ?? pin.error;
  if (firstErr && isMissingCommunityChatSchemaError(firstErr.message)) {
    return { ok: false, error: "schema_missing", status: 503 };
  }
  if (firstErr) {
    return { ok: false, error: firstErr.message, status: 500 };
  }

  return {
    ok: true,
    summary: {
      pendingJoinRequests: pj.count ?? 0,
      pendingReports: pr.count ?? 0,
      activeBans: bn.count ?? 0,
      activeNotices: nt.count ?? 0,
      pinnedNotices: pin.count ?? 0,
    },
  };
}
