import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  encodeGroupMediaCursor,
  filterGroupMediaRows,
  parseGroupMediaCursorStrict,
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

export const GROUP_MEDIA_BAD_CURSOR = "bad_cursor" as const;

/** A-1: 뷰어가 숨긴 메시지 (`community_messenger_message_user_hides`) — 다른 읽기 경로와 같은 테이블·조건. */
async function fetchViewerHiddenMessageIds(
  sb: unknown,
  userId: string,
  messageIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(messageIds.map((id) => trimText(id)).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await (sb as any)
    .from("community_messenger_message_user_hides")
    .select("message_id")
    .eq("user_id", userId)
    .in("message_id", ids);
  if (error) return new Set();
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ message_id?: unknown }>) {
    const mid = trimText(row.message_id);
    if (mid) out.add(mid);
  }
  return out;
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
  const cursorParse = parseGroupMediaCursorStrict(input.cursor);
  if (!cursorParse.ok) return { ok: false, error: GROUP_MEDIA_BAD_CURSOR };
  const parsedCursor = cursorParse.cursor;

  let query = (sb as any)
    .from("community_messenger_messages")
    .select(
      "id, message_type, content, created_at, sender_id, metadata, deleted_at, deleted_for_everyone_at, is_hidden_by_admin"
    )
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .is("deleted_for_everyone_at", null)
    .not("is_hidden_by_admin", "is", true)
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
  const rawRows = (data ?? []) as Array<Record<string, unknown>>;
  /** 페이지 판정·커서는 DB 페이지(raw) 기준 — 뷰어 숨김 제외로 페이지가 줄어도 다음 커서가 끊기지 않는다. */
  const hasMore = rawRows.length > limit;
  const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
  const rawTail = pageRows[pageRows.length - 1];
  const hiddenIds = await fetchViewerHiddenMessageIds(
    sb,
    userId,
    pageRows.map((r) => trimText(r.id))
  );
  const items = filterGroupMediaRows(pageRows, filter, { hiddenMessageIds: hiddenIds });
  const tail = rawTail
    ? { createdAt: trimText(rawTail.created_at), messageId: trimText(rawTail.id) }
    : null;
  const nextCursor =
    hasMore && tail && tail.createdAt && tail.messageId
      ? encodeGroupMediaCursor(tail.createdAt, tail.messageId) : null;
  return { ok: true, page: { items, nextCursor } };
}
