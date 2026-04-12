import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { keysetBeforeMessagesOrFilter, isLikelyIso8601 } from "@/lib/group-chat/server/keyset-filters";

type LoaderError = { ok: false; status: number; error: string };
type LoaderOk<T> = { ok: true; value: T };

export type GroupMessageRow = Record<string, unknown>;

function ok<T>(value: T): LoaderOk<T> {
  return { ok: true, value };
}

function fail(status: number, error: string): LoaderError {
  return { ok: false, status, error };
}

/**
 * 그룹 방 메시지 — 활성 멤버만, 숨김/삭제 제외, 키셋 (created_at,id).
 */
export async function loadGroupRoomMessageRowsForUser(input: {
  roomId: string;
  userId: string;
  before?: string | null;
  beforeCreatedAt?: string | null;
  limit?: number;
}): Promise<LoaderOk<GroupMessageRow[]> | LoaderError> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return fail(500, "서버 설정 필요");
  }

  const roomId = input.roomId.trim();
  if (!roomId) return fail(400, "roomId 필요");

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const before = input.before?.trim();
  const beforeCreatedAtHint = input.beforeCreatedAt?.trim() ?? "";

  const { data: member, error: memErr } = await sb
    .from("group_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .is("left_at", null)
    .maybeSingle();

  if (memErr) return fail(500, memErr.message);
  if (!(member as { id?: string } | null)?.id) {
    return fail(403, "멤버만 조회할 수 있습니다.");
  }

  let q = sb
    .from("group_messages")
    .select(
      "id, room_id, sender_id, message_type, body, metadata, created_at, seq, deleted_at, hidden_by_moderator"
    )
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .eq("hidden_by_moderator", false)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (before) {
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    if (beforeCreatedAtHint && isLikelyIso8601(beforeCreatedAtHint)) {
      cursorCreatedAt = beforeCreatedAtHint;
      cursorId = before;
    } else {
      const { data: beforeRow } = await sb
        .from("group_messages")
        .select("id, created_at")
        .eq("room_id", roomId)
        .eq("id", before)
        .maybeSingle();
      const br = beforeRow as { id?: string; created_at?: string } | null;
      if (!br || typeof br.created_at !== "string") {
        return fail(404, "기준 메시지를 찾을 수 없습니다.");
      }
      cursorCreatedAt = br.created_at;
      cursorId = typeof br.id === "string" ? br.id : before;
    }

    if (cursorCreatedAt && cursorId) {
      q = q.or(keysetBeforeMessagesOrFilter(cursorCreatedAt, cursorId));
    }
  }

  const { data: messages, error } = await q;
  if (error) return fail(500, error.message);
  const rows = ((messages ?? []) as GroupMessageRow[]).reverse();
  return ok(rows);
}
