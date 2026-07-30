import type { GroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";
import { generateGroupInviteToken } from "@/lib/community-messenger/group/group-room-invite-token";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type GroupInviteLinkRow = {
  id: string;
  room_id: string;
  token: string;
  name: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  requires_approval: boolean;
  revoked_at: string | null;
  is_default: boolean;
};

const LINK_SELECT =
  "id, room_id, token, name, created_by, created_at, expires_at, usage_limit, usage_count, requires_approval, revoked_at, is_default";

export function mapInviteLinkRow(raw: Record<string, unknown> | null | undefined): GroupInviteLinkRow | null {
  if (!raw) return null;
  const id = trimText(raw.id);
  const roomId = trimText(raw.room_id);
  const token = trimText(raw.token);
  if (!id || !roomId || !token) return null;
  return {
    id,
    room_id: roomId,
    token,
    name: trimText(raw.name) || null,
    created_by: trimText(raw.created_by) || null,
    created_at: trimText(raw.created_at) || new Date().toISOString(),
    expires_at: trimText(raw.expires_at) || null,
    usage_limit: typeof raw.usage_limit === "number" ? raw.usage_limit : raw.usage_limit == null ? null : Number(raw.usage_limit),
    usage_count: typeof raw.usage_count === "number" ? raw.usage_count : Number(raw.usage_count ?? 0) || 0,
    requires_approval: raw.requires_approval === true,
    revoked_at: trimText(raw.revoked_at) || null,
    is_default: raw.is_default === true,
  };
}

export async function listRoomInviteLinks(
  sb: GroupRoomSupabase,
  roomId: string,
  opts?: { includeRevoked?: boolean }
): Promise<GroupInviteLinkRow[]> {
  const rid = trimText(roomId);
  if (!rid) return [];
  let q = (sb as any).from("community_messenger_group_invite_links").select(LINK_SELECT).eq("room_id", rid);
  if (!opts?.includeRevoked) q = q.is("revoked_at", null);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(mapInviteLinkRow).filter(Boolean) as GroupInviteLinkRow[];
}

export async function fetchInviteLinkById(
  sb: GroupRoomSupabase,
  linkId: string
): Promise<GroupInviteLinkRow | null> {
  const id = trimText(linkId);
  if (!id) return null;
  const { data } = await (sb as any)
    .from("community_messenger_group_invite_links")
    .select(LINK_SELECT)
    .eq("id", id)
    .maybeSingle();
  return mapInviteLinkRow(data as Record<string, unknown> | null);
}

export async function fetchInviteLinkByToken(
  sb: GroupRoomSupabase,
  token: string
): Promise<GroupInviteLinkRow | null> {
  const t = trimText(token);
  if (!t) return null;
  const { data } = await (sb as any)
    .from("community_messenger_group_invite_links")
    .select(LINK_SELECT)
    .eq("token", t)
    .maybeSingle();
  return mapInviteLinkRow(data as Record<string, unknown> | null);
}

/** Compat: room columns still mirrored; prefer link table. */
export async function fetchRoomInviteState(
  sb: GroupRoomSupabase,
  roomId: string
): Promise<{ inviteToken: string | null; inviteLinkEnabled: boolean } | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const links = await listRoomInviteLinks(sb, rid);
  const def = links.find((l) => l.is_default) ?? links[0] ?? null;
  if (def) {
    return { inviteToken: def.token, inviteLinkEnabled: def.revoked_at == null };
  }
  const { data } = await (sb as any)
    .from("community_messenger_rooms")
    .select("invite_token, invite_link_enabled, room_type")
    .eq("id", rid)
    .maybeSingle();
  if (!data || data.room_type !== "private_group") return null;
  return {
    inviteToken: trimText(data.invite_token) || null,
    inviteLinkEnabled: data.invite_link_enabled !== false,
  };
}

export async function patchRoomInviteToken(
  sb: GroupRoomSupabase,
  roomId: string,
  token: string | null,
  enabled?: boolean
): Promise<{ ok: boolean; error?: string }> {
  const rid = trimText(roomId);
  if (!rid) return { ok: false, error: "room_not_found" };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (token !== undefined) patch.invite_token = token;
  if (typeof enabled === "boolean") patch.invite_link_enabled = enabled;
  const { error } = await (sb as any).from("community_messenger_rooms").update(patch).eq("id", rid);
  if (error) return { ok: false, error: String(error.message ?? "update_failed") };
  return { ok: true };
}

export async function ensureRoomInviteToken(
  sb: GroupRoomSupabase,
  roomId: string,
  actorUserId?: string
): Promise<string | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const links = await listRoomInviteLinks(sb, rid);
  const activeDefault = links.find((l) => l.is_default && !l.revoked_at);
  if (activeDefault) return activeDefault.token;
  const anyActive = links.find((l) => !l.revoked_at);
  if (anyActive) return anyActive.token;

  const token = generateGroupInviteToken();
  const { data, error } = await (sb as any).rpc("community_messenger_create_group_invite_link", {
    p_room_id: rid,
    p_actor_user_id: actorUserId || null,
    p_token: token,
    p_name: null,
    p_expires_at: null,
    p_usage_limit: null,
    p_requires_approval: false,
    p_is_default: true,
  });
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; link?: { token?: string } } | null;
    if (row?.ok && row.link?.token) return String(row.link.token);
  }
  // Pre-migration fallback
  const updated = await patchRoomInviteToken(sb, rid, token, true);
  return updated.ok ? token : null;
}

export async function findRoomIdByInviteToken(
  sb: GroupRoomSupabase,
  token: string
): Promise<string | null> {
  const link = await fetchInviteLinkByToken(sb, token);
  if (link && !link.revoked_at) {
    const { data } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type, room_status")
      .eq("id", link.room_id)
      .maybeSingle();
    if (data?.room_type === "private_group" && data.room_status === "active") {
      return trimText(data.id) || null;
    }
    return null;
  }
  // Compat fallback to room column
  const t = trimText(token);
  if (!t) return null;
  const { data } = await (sb as any)
    .from("community_messenger_rooms")
    .select("id, invite_link_enabled, room_type, room_status")
    .eq("invite_token", t)
    .maybeSingle();
  if (!data || data.room_type !== "private_group" || data.room_status !== "active") return null;
  if (data.invite_link_enabled === false) return null;
  return trimText(data.id) || null;
}

export function isInviteLinkCurrentlyValid(link: GroupInviteLinkRow, nowMs = Date.now()): boolean {
  if (link.revoked_at) return false;
  if (link.expires_at && Date.parse(link.expires_at) <= nowMs) return false;
  if (link.usage_limit != null && link.usage_count >= link.usage_limit) return false;
  return true;
}
