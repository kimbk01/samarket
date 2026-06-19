import type { GroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";
import {
  batchSetCachedGroupMessageReadCounts,
  getCachedGroupMessageReadCount,
} from "@/lib/community-messenger/group/group-room-read-cache";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function fetchGroupMessageReadCounts(
  sb: GroupRoomSupabase,
  roomId: string,
  messageIds: string[]
): Promise<Map<string, number>> {
  const rid = trimText(roomId);
  const ids = [...new Set(messageIds.map((id) => trimText(id)).filter(Boolean))];
  const out = new Map<string, number>();
  if (!rid || !ids.length) return out;

  const missing: string[] = [];
  for (const messageId of ids) {
    const cached = getCachedGroupMessageReadCount(rid, messageId);
    if (cached != null) out.set(messageId, cached);
    else missing.push(messageId);
  }
  if (!missing.length) return out;

  const { data, error } = await (sb as any).rpc("community_messenger_group_message_read_counts", {
    p_room_id: rid,
    p_message_ids: missing,
  });
  if (error) return out;
  const rows = (data ?? []) as Array<{ message_id?: string; read_count?: number }>;
  const batch: Array<{ messageId: string; readCount: number }> = [];
  for (const row of rows) {
    const messageId = trimText(row.message_id);
    if (!messageId) continue;
    const readCount = Math.max(0, Number(row.read_count ?? 0));
    out.set(messageId, readCount);
    batch.push({ messageId, readCount });
  }
  batchSetCachedGroupMessageReadCounts(rid, batch);
  return out;
}

export async function fetchActiveParticipantLabels(
  sb: GroupRoomSupabase,
  roomId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.map((id) => trimText(id)).filter(Boolean))];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data } = await (sb as any)
    .from("profiles")
    .select("id, nickname, display_name, full_name")
    .in("id", ids);
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = trimText(row.id);
    if (!id) continue;
    const label =
      trimText(row.display_name) || trimText(row.nickname) || trimText(row.full_name) || id.slice(0, 6);
    out.set(id, label);
  }
  return out;
}
