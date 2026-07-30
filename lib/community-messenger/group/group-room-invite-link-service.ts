import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { canInviteToGroup, type GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";
import {
  buildGroupInviteAbsoluteUrl,
  generateGroupInviteToken,
  normalizeGroupInviteToken,
} from "@/lib/community-messenger/group/group-room-invite-token";
import {
  ensureRoomInviteToken,
  fetchInviteLinkById,
  fetchInviteLinkByToken,
  fetchRoomInviteState,
  isInviteLinkCurrentlyValid,
  listRoomInviteLinks,
  mapInviteLinkRow,
  type GroupInviteLinkRow,
} from "@/lib/community-messenger/group/group-room-invite-link-repository";
import {
  countActiveParticipants,
  fetchActiveParticipant,
  fetchPrivateGroupRoom,
  resolveGroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";
import { getSiteOrigin } from "@/lib/env/runtime";
import { publishGroupRoomListBump } from "@/lib/community-messenger/group/group-room-realtime";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeRole(value: unknown): GroupRoomRole {
  const role = trimText(value);
  if (role === "owner" || role === "admin") return role;
  return "member";
}

function permissionCtx(
  viewerUserId: string,
  viewerRole: GroupRoomRole,
  room: NonNullable<Awaited<ReturnType<typeof fetchPrivateGroupRoom>>>
): GroupRoomPermissionContext {
  return { viewerUserId, viewerRole, room };
}

function linkPublic(link: GroupInviteLinkRow, origin: string) {
  return {
    id: link.id,
    roomId: link.room_id,
    name: link.name,
    inviteUrl: buildGroupInviteAbsoluteUrl(link.token, origin),
    /** token only for managers who already have invite permission */
    inviteToken: link.token,
    createdAt: link.created_at,
    expiresAt: link.expires_at,
    usageLimit: link.usage_limit,
    usageCount: link.usage_count,
    requiresApproval: link.requires_approval,
    revokedAt: link.revoked_at,
    isDefault: link.is_default,
    createdBy: link.created_by,
  };
}

async function requireInviteManager(userId: string, roomId: string) {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false as const, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false as const, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) return { ok: false as const, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const viewerRole = normalizeRole(participant.role);
  if (!canInviteToGroup(permissionCtx(userId, viewerRole, room))) {
    return { ok: false as const, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  return { ok: true as const, sb, room, viewerRole };
}

export async function getGroupInviteLink(input: {
  userId: string;
  roomId: string;
}): Promise<
  | { ok: true; inviteToken: string; inviteUrl: string; enabled: boolean }
  | { ok: false; error: string }
> {
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const gate = await requireInviteManager(userId, roomId);
  if (!gate.ok) return gate;
  const token = await ensureRoomInviteToken(gate.sb, roomId, userId);
  if (!token) return { ok: false, error: GROUP_ROOM_ERROR.UPDATE_FAILED };
  const state = await fetchRoomInviteState(gate.sb, roomId);
  const origin = getSiteOrigin() || "https://dibay.app";
  return {
    ok: true,
    inviteToken: token,
    inviteUrl: buildGroupInviteAbsoluteUrl(token, origin),
    enabled: state?.inviteLinkEnabled !== false,
  };
}

export async function listGroupInviteLinks(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: true; links: ReturnType<typeof linkPublic>[] } | { ok: false; error: string }> {
  const gate = await requireInviteManager(trimText(input.userId), trimText(input.roomId));
  if (!gate.ok) return gate;
  const links = await listRoomInviteLinks(gate.sb, trimText(input.roomId), { includeRevoked: false });
  const origin = getSiteOrigin() || "https://dibay.app";
  return { ok: true, links: links.map((l) => linkPublic(l, origin)) };
}

export async function createGroupInviteLink(input: {
  userId: string;
  roomId: string;
  name?: string | null;
  expiresAt?: string | null;
  usageLimit?: number | null;
  requiresApproval?: boolean;
  isDefault?: boolean;
}): Promise<{ ok: true; link: ReturnType<typeof linkPublic> } | { ok: false; error: string }> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  const gate = await requireInviteManager(userId, roomId);
  if (!gate.ok) return gate;
  const token = generateGroupInviteToken();
  const { data, error } = await (gate.sb as any).rpc("community_messenger_create_group_invite_link", {
    p_room_id: roomId,
    p_actor_user_id: userId,
    p_token: token,
    p_name: trimText(input.name) || null,
    p_expires_at: input.expiresAt ?? null,
    p_usage_limit: input.usageLimit ?? null,
    p_requires_approval: input.requiresApproval === true,
    p_is_default: input.isDefault === true,
  });
  if (error) {
    // Fallback: insert via table if RPC missing
    if (!/could not find the function|does not exist|PGRST202/i.test(String(error.message ?? ""))) {
      return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
    }
    return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string; link?: Record<string, unknown> } | null;
  if (!row?.ok || !row.link) return { ok: false, error: String(row?.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  const link = mapInviteLinkRow(row.link);
  if (!link) return { ok: false, error: GROUP_ROOM_ERROR.UPDATE_FAILED };
  const origin = getSiteOrigin() || "https://dibay.app";
  return { ok: true, link: linkPublic(link, origin) };
}

export async function updateGroupInviteLink(input: {
  userId: string;
  linkId: string;
  name?: string | null;
  expiresAt?: string | null;
  clearExpires?: boolean;
  usageLimit?: number | null;
  clearUsageLimit?: boolean;
  requiresApproval?: boolean;
}): Promise<{ ok: true; link: ReturnType<typeof linkPublic> } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const existing = await fetchInviteLinkById(sb, trimText(input.linkId));
  if (!existing || existing.revoked_at) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const gate = await requireInviteManager(trimText(input.userId), existing.room_id);
  if (!gate.ok) return gate;
  if (gate.viewerRole !== "owner" && gate.viewerRole !== "admin") {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  const { data, error } = await (sb as any).rpc("community_messenger_update_group_invite_link", {
    p_link_id: existing.id,
    p_actor_user_id: trimText(input.userId),
    p_name: input.name === undefined ? null : input.name,
    p_expires_at: input.expiresAt ?? null,
    p_clear_expires: input.clearExpires === true,
    p_usage_limit: input.usageLimit ?? null,
    p_clear_usage_limit: input.clearUsageLimit === true,
    p_requires_approval: typeof input.requiresApproval === "boolean" ? input.requiresApproval : null,
  });
  if (error) return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string; link?: Record<string, unknown> } | null;
  if (!row?.ok || !row.link) return { ok: false, error: String(row?.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  const link = mapInviteLinkRow(row.link);
  if (!link) return { ok: false, error: GROUP_ROOM_ERROR.UPDATE_FAILED };
  const origin = getSiteOrigin() || "https://dibay.app";
  return { ok: true, link: linkPublic(link, origin) };
}

export async function revokeGroupInviteLink(input: {
  userId: string;
  linkId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const existing = await fetchInviteLinkById(sb, trimText(input.linkId));
  if (!existing) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const gate = await requireInviteManager(trimText(input.userId), existing.room_id);
  if (!gate.ok) return gate;
  if (gate.viewerRole !== "owner" && gate.viewerRole !== "admin") {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  const { data, error } = await (sb as any).rpc("community_messenger_revoke_group_invite_link", {
    p_link_id: existing.id,
    p_actor_user_id: trimText(input.userId),
  });
  if (error) return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string } | null;
  if (row && row.ok === false) return { ok: false, error: String(row.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  return { ok: true };
}

/** Legacy: regenerate = create new default link (old default revoked). */
export async function regenerateGroupInviteLink(input: {
  userId: string;
  roomId: string;
}): Promise<
  | { ok: true; inviteToken: string; inviteUrl: string }
  | { ok: false; error: string }
> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  const gate = await requireInviteManager(userId, roomId);
  if (!gate.ok) return gate;
  const existing = await listRoomInviteLinks(gate.sb, roomId);
  for (const link of existing.filter((l) => l.is_default && !l.revoked_at)) {
    await (gate.sb as any).rpc("community_messenger_revoke_group_invite_link", {
      p_link_id: link.id,
      p_actor_user_id: userId,
    });
  }
  const created = await createGroupInviteLink({
    userId,
    roomId,
    requiresApproval: false,
    isDefault: true,
  });
  if (!created.ok) return created;
  return {
    ok: true,
    inviteToken: created.link.inviteToken,
    inviteUrl: created.link.inviteUrl,
  };
}

export async function disableGroupInviteLink(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  const gate = await requireInviteManager(userId, roomId);
  if (!gate.ok) return gate;
  if (gate.viewerRole !== "owner" && gate.viewerRole !== "admin") {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  const links = await listRoomInviteLinks(gate.sb, roomId);
  for (const link of links) {
    await (gate.sb as any).rpc("community_messenger_revoke_group_invite_link", {
      p_link_id: link.id,
      p_actor_user_id: userId,
    });
  }
  return { ok: true };
}

export type GroupInvitePreview = {
  roomId: string;
  title: string;
  summary: string;
  avatarUrl: string | null;
  memberCount: number;
  requiresApproval: boolean;
  linkName: string | null;
  viewerStatus: "guest" | "member" | "pending";
  requestId: string | null;
};

export async function previewGroupInviteLink(input: {
  userId: string | null;
  inviteToken: string;
}): Promise<{ ok: true; preview: GroupInvitePreview } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const token = normalizeGroupInviteToken(input.inviteToken);
  if (!token) return { ok: false, error: GROUP_ROOM_ERROR.CONTENT_REQUIRED };
  const link = await fetchInviteLinkByToken(sb, token);
  if (!link || !isInviteLinkCurrentlyValid(link)) {
    return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  }
  const room = await fetchPrivateGroupRoom(sb, link.room_id);
  if (!room || (room.room_status ?? "active") !== "active") {
    return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  }
  const memberCount = await countActiveParticipants(sb, link.room_id);
  let viewerStatus: GroupInvitePreview["viewerStatus"] = "guest";
  let requestId: string | null = null;
  const userId = trimText(input.userId);
  if (userId) {
    const active = await fetchActiveParticipant(sb, link.room_id, userId);
    if (active) viewerStatus = "member";
    else {
      const { data: pending } = await (sb as any)
        .from("community_messenger_group_join_requests")
        .select("id")
        .eq("room_id", link.room_id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .maybeSingle();
      if (pending?.id) {
        viewerStatus = "pending";
        requestId = String(pending.id);
      }
    }
  }
  return {
    ok: true,
    preview: {
      roomId: link.room_id,
      title: trimText(room.title) || "",
      summary: trimText(room.summary) || "",
      avatarUrl: trimText((room as { avatar_url?: string | null }).avatar_url) || null,
      memberCount,
      requiresApproval: link.requires_approval,
      linkName: link.name,
      viewerStatus,
      requestId,
    },
  };
}

export async function joinGroupRoomByInviteToken(input: {
  userId: string;
  inviteToken: string;
}): Promise<{ ok: true; roomId: string; alreadyMember?: boolean } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const userId = trimText(input.userId);
  const token = normalizeGroupInviteToken(input.inviteToken);
  if (!token) return { ok: false, error: GROUP_ROOM_ERROR.CONTENT_REQUIRED };

  const { data, error } = await (sb as any).rpc("community_messenger_join_group_via_invite_link", {
    p_token: token,
    p_user_id: userId,
  });
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as {
      ok?: boolean;
      error?: string;
      room_id?: string;
      already_member?: boolean;
    } | null;
    if (!row?.ok) {
      const err = String(row?.error ?? GROUP_ROOM_ERROR.INVITE_FAILED);
      return { ok: false, error: err };
    }
    const roomId = trimText(row.room_id);
    if (!roomId) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
    if (!row.already_member) {
      await publishGroupRoomListBump({ roomId, fromUserId: userId });
    }
    return { ok: true, roomId, alreadyMember: row.already_member === true };
  }

  const rpcMissing = /could not find the function|does not exist|PGRST202/i.test(String(error.message ?? ""));
  if (!rpcMissing) return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.INVITE_FAILED) };

  // Pre-migration fallback (legacy room token, no usage/approval)
  const link = await fetchInviteLinkByToken(sb, token);
  if (link?.requires_approval) return { ok: false, error: GROUP_ROOM_ERROR.APPROVAL_REQUIRED };
  const { findRoomIdByInviteToken } = await import("@/lib/community-messenger/group/group-room-invite-link-repository");
  const { upsertGroupMemberParticipants } = await import("@/lib/community-messenger/group/group-room-repository");
  const roomId = await findRoomIdByInviteToken(sb, token);
  if (!roomId) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const existing = await fetchActiveParticipant(sb, roomId, userId);
  if (existing) return { ok: true, roomId, alreadyMember: true };
  const joined = await upsertGroupMemberParticipants(sb, roomId, [userId]);
  if (!joined.ok) return { ok: false, error: joined.error ?? GROUP_ROOM_ERROR.INVITE_FAILED };
  await publishGroupRoomListBump({ roomId, fromUserId: userId });
  return { ok: true, roomId };
}
