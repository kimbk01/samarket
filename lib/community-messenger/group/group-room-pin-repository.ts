import type { GroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function setRoomPinnedMessageId(
  sb: GroupRoomSupabase,
  roomId: string,
  messageId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const rid = trimText(roomId);
  if (!rid) return { ok: false, error: "room_not_found" };
  const { error } = await (sb as any)
    .from("community_messenger_rooms")
    .update({ pinned_message_id: messageId, updated_at: new Date().toISOString() })
    .eq("id", rid);
  if (error) return { ok: false, error: String(error.message ?? "update_failed") };
  return { ok: true };
}

export async function fetchRoomPinnedMessageId(
  sb: GroupRoomSupabase,
  roomId: string
): Promise<string | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const { data } = await (sb as any)
    .from("community_messenger_rooms")
    .select("pinned_message_id")
    .eq("id", rid)
    .maybeSingle();
  const id = trimText((data as { pinned_message_id?: string } | null)?.pinned_message_id);
  return id || null;
}

export async function fetchMessageInRoom(
  sb: GroupRoomSupabase,
  roomId: string,
  messageId: string
): Promise<{ id: string; content: string; sender_id: string | null; message_type: string } | null> {
  const rid = trimText(roomId);
  const mid = trimText(messageId);
  if (!rid || !mid) return null;
  const { data, error } = await (sb as any)
    .from("community_messenger_messages")
    .select("id, content, sender_id, message_type, deleted_at")
    .eq("room_id", rid)
    .eq("id", mid)
    .maybeSingle();
  if (error || !data || data.deleted_at) return null;
  return {
    id: String(data.id),
    content: trimText(data.content),
    sender_id: typeof data.sender_id === "string" ? data.sender_id : null,
    message_type: trimText(data.message_type) || "text",
  };
}
