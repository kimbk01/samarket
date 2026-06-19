import type { GroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";
import type { GroupRoomProfilePatch } from "@/lib/community-messenger/group/group-room-profile-policy";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function patchGroupRoomProfile(
  sb: GroupRoomSupabase,
  roomId: string,
  patch: GroupRoomProfilePatch
): Promise<{ ok: boolean; error?: string }> {
  const rid = trimText(roomId);
  if (!rid) return { ok: false, error: "room_not_found" };
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.title === "string") dbPatch.title = trimText(patch.title).slice(0, 120);
  if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl;
  if (Object.keys(dbPatch).length <= 1) return { ok: true };
  const { error } = await (sb as any).from("community_messenger_rooms").update(dbPatch).eq("id", rid);
  if (error) return { ok: false, error: String(error.message ?? "update_failed") };
  return { ok: true };
}

export async function fetchGroupRoomProfileRow(
  sb: GroupRoomSupabase,
  roomId: string
): Promise<{ id: string; title: string; avatar_url: string | null; owner_user_id: string | null } | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const { data, error } = await (sb as any)
    .from("community_messenger_rooms")
    .select("id, title, avatar_url, owner_user_id, room_type")
    .eq("id", rid)
    .maybeSingle();
  if (error || !data || data.room_type !== "private_group") return null;
  return {
    id: String(data.id),
    title: trimText(data.title),
    avatar_url: typeof data.avatar_url === "string" ? data.avatar_url : null,
    owner_user_id: typeof data.owner_user_id === "string" ? data.owner_user_id : null,
  };
}
