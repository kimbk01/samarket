import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { canInviteToGroup, type GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";
import { normalizeGroupInviteToken } from "@/lib/community-messenger/group/group-room-invite-token";
import { publishGroupRoomListBump } from "@/lib/community-messenger/group/group-room-realtime";
import {
  fetchActiveParticipant,
  fetchPrivateGroupRoom,
  fetchProfileLabels,
  insertGroupSystemMessage,
  resolveGroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";
import { cmMgmtMemberInviteContent } from "@/lib/community-messenger/cm-home-list-copy";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeRole(value: unknown): GroupRoomRole {
  const role = trimText(value);
  if (role === "owner" || role === "admin") return role;
  return "member";
}

export type GroupJoinRequestRow = {
  id: string;
  roomId: string;
  userId: string;
  inviteLinkId: string | null;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  linkName?: string | null;
  userLabel?: string | null;
  username?: string | null;
};

export async function requestGroupJoinByInviteToken(input: {
  userId: string;
  inviteToken: string;
}): Promise<
  | { ok: true; roomId: string; requestId: string; status: string; existing?: boolean; alreadyMember?: boolean }
  | { ok: false; error: string }
> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const userId = trimText(input.userId);
  const token = normalizeGroupInviteToken(input.inviteToken);
  if (!token) return { ok: false, error: GROUP_ROOM_ERROR.CONTENT_REQUIRED };

  const { data, error } = await (sb as any).rpc("community_messenger_request_group_join", {
    p_token: token,
    p_user_id: userId,
  });
  if (error) {
    return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.INVITE_FAILED) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    ok?: boolean;
    error?: string;
    room_id?: string;
    request_id?: string;
    status?: string;
    existing?: boolean;
    already_member?: boolean;
  } | null;
  if (!row?.ok) return { ok: false, error: String(row?.error ?? GROUP_ROOM_ERROR.INVITE_FAILED) };
  if (row.already_member) {
    return {
      ok: true,
      roomId: trimText(row.room_id),
      requestId: "",
      status: "member",
      alreadyMember: true,
    };
  }
  return {
    ok: true,
    roomId: trimText(row.room_id),
    requestId: trimText(row.request_id),
    status: trimText(row.status) || "pending",
    existing: row.existing === true,
  };
}

export async function cancelGroupJoinRequest(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const { data, error } = await (sb as any).rpc("community_messenger_cancel_group_join_request", {
    p_room_id: trimText(input.roomId),
    p_user_id: trimText(input.userId),
  });
  if (error) return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string } | null;
  if (row && row.ok === false) return { ok: false, error: String(row.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  return { ok: true };
}

export async function decideGroupJoinRequest(input: {
  actorUserId: string;
  requestId: string;
  decision: "approved" | "rejected";
}): Promise<{ ok: true; roomId?: string; status: string } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const { data, error } = await (sb as any).rpc("community_messenger_decide_group_join_request", {
    p_request_id: trimText(input.requestId),
    p_actor_user_id: trimText(input.actorUserId),
    p_decision: input.decision,
  });
  if (error) return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  const row = (Array.isArray(data) ? data[0] : data) as {
    ok?: boolean;
    error?: string;
    room_id?: string;
    user_id?: string;
    status?: string;
  } | null;
  if (!row?.ok) return { ok: false, error: String(row?.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };

  const roomId = trimText(row.room_id);
  if (input.decision === "approved" && roomId && row.user_id) {
    const labels = await fetchProfileLabels(sb, [String(row.user_id)]);
    await insertGroupSystemMessage(sb, {
      roomId,
      content: cmMgmtMemberInviteContent(labels.get(String(row.user_id))),
    });
    await publishGroupRoomListBump({ roomId, fromUserId: trimText(input.actorUserId) });
  }
  return { ok: true, roomId: roomId || undefined, status: trimText(row.status) || input.decision };
}

export async function listPendingGroupJoinRequests(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: true; requests: GroupJoinRequestRow[]; pendingCount: number } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const me = await fetchActiveParticipant(sb, roomId, userId);
  if (!me) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const role = normalizeRole(me.role);
  const perm: GroupRoomPermissionContext = { viewerUserId: userId, viewerRole: role, room };
  if (role !== "owner" && role !== "admin" && !canInviteToGroup(perm)) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }

  const { data, error } = await (sb as any)
    .from("community_messenger_group_join_requests")
    .select("id, room_id, user_id, invite_link_id, status, requested_at, decided_at, decided_by")
    .eq("room_id", roomId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const userIds = rows.map((r) => trimText(r.user_id)).filter(Boolean);
  const linkIds = rows.map((r) => trimText(r.invite_link_id)).filter(Boolean);
  const labelMap = await fetchProfileLabels(sb, userIds);
  const { data: profiles } = await (sb as any).from("profiles").select("id, username").in("id", userIds);
  const usernameMap = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id?: string; username?: string | null }>) {
    if (p.id && p.username) usernameMap.set(String(p.id), String(p.username));
  }
  const linkNameMap = new Map<string, string | null>();
  if (linkIds.length) {
    const { data: links } = await (sb as any)
      .from("community_messenger_group_invite_links")
      .select("id, name")
      .in("id", linkIds);
    for (const l of (links ?? []) as Array<{ id?: string; name?: string | null }>) {
      if (l.id) linkNameMap.set(String(l.id), l.name ?? null);
    }
  }

  const requests: GroupJoinRequestRow[] = rows.map((r) => {
    const uid = trimText(r.user_id);
    const lid = trimText(r.invite_link_id) || null;
    return {
      id: trimText(r.id),
      roomId: trimText(r.room_id),
      userId: uid,
      inviteLinkId: lid,
      status: trimText(r.status) || "pending",
      requestedAt: trimText(r.requested_at),
      decidedAt: trimText(r.decided_at) || null,
      decidedBy: trimText(r.decided_by) || null,
      linkName: lid ? linkNameMap.get(lid) ?? null : null,
      userLabel: labelMap.get(uid) ?? null,
      username: usernameMap.get(uid) ?? null,
    };
  });

  return { ok: true, requests, pendingCount: requests.length };
}

export async function closePendingJoinRequestsOnDirectAdd(input: {
  sb: NonNullable<ReturnType<typeof resolveGroupRoomSupabase>>;
  roomId: string;
  memberIds: string[];
  actorUserId: string;
}): Promise<void> {
  const ids = input.memberIds.map(trimText).filter(Boolean);
  if (!ids.length) return;
  await (input.sb as any).rpc("community_messenger_close_pending_join_on_direct_add", {
    p_room_id: trimText(input.roomId),
    p_user_ids: ids,
    p_actor_user_id: trimText(input.actorUserId),
  });
}

export async function fetchPendingJoinUserIds(
  sb: NonNullable<ReturnType<typeof resolveGroupRoomSupabase>>,
  roomId: string
): Promise<Set<string>> {
  const { data } = await (sb as any)
    .from("community_messenger_group_join_requests")
    .select("user_id")
    .eq("room_id", trimText(roomId))
    .eq("status", "pending");
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ user_id?: string }>) {
    const id = trimText(row.user_id);
    if (id) out.add(id);
  }
  return out;
}
