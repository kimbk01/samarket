import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  encodeGroupMediaCursor,
  filterGroupMediaRows,
  parseGroupMediaCursor,
  type GroupMediaIndexPage,
} from "@/lib/community-messenger/group/group-room-media-index";
import {
  fetchActiveParticipant,
  resolveGroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 80;

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function listGroupRoomMedia(input: {
  userId: string;
  roomId: string;
  filter?: "all" | "image" | "file";
  cursor?: string | null;
  limit?: number;
}): Promise<{ ok: true; page: GroupMediaIndexPage } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const filter = input.filter ?? "all";
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const parsedCursor = parseGroupMediaCursor(input.cursor);

  let query = (sb as any)
    .from("community_messenger_messages")
    .select("id, message_type, content, created_at, sender_id, metadata")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (filter === "image") query = query.eq("message_type", "image");
  else if (filter === "file") query = query.eq("message_type", "file");
  else query = query.in("message_type", ["image", "file"]);

  if (parsedCursor) {
    query = query.or(
      `created_at.lt.${parsedCursor.createdAt},and(created_at.eq.${parsedCursor.createdAt},id.lt.${parsedCursor.messageId})`
    );
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: String(error.message ?? "media_list_failed") };
  const rows = filterGroupMediaRows((data ?? []) as Array<Record<string, unknown>>, filter);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const tail = items[items.length - 1];
  const nextCursor =
    hasMore && tail ? encodeGroupMediaCursor(tail.createdAt, tail.messageId) : null;
  return { ok: true, page: { items, nextCursor } };
}
