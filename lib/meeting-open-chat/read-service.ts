import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingOpenChatRoomListEntry, MeetingOpenChatRoomPublic } from "./types";

function isMissingMeetingOpenChatSchemaError(message: string): boolean {
  return /42P01|meeting_open_chat_messages|meeting_open_chat_members|does not exist/i.test(message);
}

/**
 * 방의 메시지를 읽음으로 표시. `last_read_message_id`는 과거로 되돌리지 않음.
 * messageId 없으면 방의 가장 최근(삭제 제외) 메시지 기준.
 */
export async function markMeetingOpenChatRoomRead(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    userId: string;
    memberId: string;
    messageId?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const rid = input.roomId.trim();
  const uid = input.userId.trim();
  const mid = input.memberId.trim();
  if (!rid || !uid || !mid) {
    return { ok: false, error: "bad_request", status: 400 };
  }

  let targetId = input.messageId?.trim() || null;

  if (!targetId) {
    const { data: last, error: lastErr } = await sb
      .from("meeting_open_chat_messages")
      .select("id")
      .eq("room_id", rid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) {
      if (isMissingMeetingOpenChatSchemaError(lastErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: lastErr.message, status: 500 };
    }
    if (!last) return { ok: true };
    targetId = String((last as { id: string }).id);
  }

  const { data: targetMsg, error: tErr } = await sb
    .from("meeting_open_chat_messages")
    .select("id, created_at")
    .eq("id", targetId)
    .eq("room_id", rid)
    .is("deleted_at", null)
    .maybeSingle();
  if (tErr) {
    if (isMissingMeetingOpenChatSchemaError(tErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: tErr.message, status: 500 };
  }
  if (!targetMsg) return { ok: false, error: "message_not_found", status: 404 };

  const targetCreated = String((targetMsg as { created_at: string }).created_at);

  const { data: mem, error: mErr } = await sb
    .from("meeting_open_chat_members")
    .select("id, last_read_message_id")
    .eq("id", mid)
    .eq("room_id", rid)
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();
  if (mErr) {
    if (isMissingMeetingOpenChatSchemaError(mErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: mErr.message, status: 500 };
  }
  if (!mem) return { ok: false, error: "not_a_member", status: 403 };

  const currentReadId = (mem as { last_read_message_id: string | null }).last_read_message_id;
  if (currentReadId) {
    const { data: curMsg, error: cErr } = await sb
      .from("meeting_open_chat_messages")
      .select("created_at")
      .eq("id", currentReadId)
      .eq("room_id", rid)
      .maybeSingle();
    if (!cErr && curMsg) {
      const curCreated = String((curMsg as { created_at: string }).created_at);
      if (new Date(targetCreated).getTime() < new Date(curCreated).getTime()) {
        return { ok: true };
      }
    }
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("meeting_open_chat_members")
    .update({
      last_read_message_id: targetId,
      last_read_at: now,
      updated_at: now,
    })
    .eq("id", mid)
    .eq("room_id", rid)
    .eq("user_id", uid);

  if (upErr) {
    if (isMissingMeetingOpenChatSchemaError(upErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: upErr.message, status: 500 };
  }

  return { ok: true };
}

type MemberUnreadRow = { id: string; last_read_at: string | null; joined_at: string };

async function countOthersMessagesAfter(
  sb: SupabaseClient<any>,
  roomId: string,
  mem: MemberUnreadRow
): Promise<number> {
  const rid = roomId.trim();
  const since = mem.last_read_at ?? mem.joined_at;
  const { count, error } = await sb
    .from("meeting_open_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", rid)
    .is("deleted_at", null)
    .neq("message_type", "system")
    .neq("member_id", mem.id)
    .gt("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

/**
 * 활성 멤버인 경우, 본인이 보낸 메시지·시스템 메시지를 제외하고
 * `last_read_at`(없으면 `joined_at`) 이후의 메시지 개수.
 */
export async function getMeetingOpenChatUnreadOthersCount(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<
  | { ok: true; count: number; isMember: boolean }
  | { ok: false; error: string; status: number }
> {
  const rid = roomId.trim();
  const uid = userId.trim();
  const { data: m, error } = await sb
    .from("meeting_open_chat_members")
    .select("id, last_read_at, joined_at")
    .eq("room_id", rid)
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  if (!m) return { ok: true, count: 0, isMember: false };
  const mem = m as MemberUnreadRow;
  const count = await countOthersMessagesAfter(sb, rid, mem);
  return { ok: true, count, isMember: true };
}

export async function enrichMeetingOpenChatRoomsListWithViewer(
  sb: SupabaseClient<any>,
  rooms: MeetingOpenChatRoomPublic[],
  userId: string
): Promise<
  | { ok: true; rooms: MeetingOpenChatRoomListEntry[] }
  | { ok: false; error: string; status: number }
> {
  if (rooms.length === 0) return { ok: true, rooms: [] };
  const uid = userId.trim();
  const roomIds = rooms.map((r) => r.id);

  const { data: mems, error } = await sb
    .from("meeting_open_chat_members")
    .select("room_id, id, last_read_at, joined_at")
    .eq("user_id", uid)
    .eq("status", "active")
    .in("room_id", roomIds);

  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const byRoom = new Map<string, MemberUnreadRow>();
  for (const row of mems ?? []) {
    const r = row as { room_id: string; id: string; last_read_at: string | null; joined_at: string };
    byRoom.set(String(r.room_id), {
      id: String(r.id),
      last_read_at: r.last_read_at,
      joined_at: String(r.joined_at),
    });
  }

  const entries: MeetingOpenChatRoomListEntry[] = await Promise.all(
    rooms.map(async (room) => {
      const mem = byRoom.get(room.id);
      if (!mem) {
        return { ...room, viewerUnreadCount: 0, viewerIsChatMember: false };
      }
      const viewerUnreadCount = await countOthersMessagesAfter(sb, room.id, mem);
      return { ...room, viewerUnreadCount, viewerIsChatMember: true };
    })
  );

  return { ok: true, rooms: entries };
}
