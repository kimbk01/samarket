import type { GroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";
import { generateGroupInviteToken } from "@/lib/community-messenger/group/group-room-invite-token";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function fetchRoomInviteState(
  sb: GroupRoomSupabase,
  roomId: string
): Promise<{ inviteToken: string | null; inviteLinkEnabled: boolean } | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
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
  roomId: string
): Promise<string | null> {
  const state = await fetchRoomInviteState(sb, roomId);
  if (!state) return null;
  if (state.inviteToken) return state.inviteToken;
  const token = generateGroupInviteToken();
  const updated = await patchRoomInviteToken(sb, roomId, token, true);
  return updated.ok ? token : null;
}

export async function findRoomIdByInviteToken(
  sb: GroupRoomSupabase,
  token: string
): Promise<string | null> {
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
