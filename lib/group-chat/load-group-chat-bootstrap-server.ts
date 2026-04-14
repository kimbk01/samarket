/**
 * GET /api/group-chat/rooms/:roomId/bootstrap 과 동일 로직 — RSC·Route Handler 공유.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  GROUP_CHAT_BOOTSTRAP_MEMBER_CAP,
  GROUP_CHAT_BOOTSTRAP_MESSAGE_LIMIT,
} from "@/lib/group-chat/constants";
import { loadGroupRoomMessageRowsForUser } from "@/lib/group-chat/server/load-group-room-messages";
import type {
  GroupChatBootstrapApiBody,
  LoadGroupChatBootstrapResult,
} from "@/lib/group-chat/group-chat-bootstrap-types";

export type { GroupChatBootstrapApiBody, LoadGroupChatBootstrapResult };

export async function loadGroupChatBootstrapForUser(
  userId: string,
  roomId: string
): Promise<LoadGroupChatBootstrapResult> {
  const rid = roomId.trim();
  if (!rid) {
    return { ok: false, status: 400, error: "roomId 필요" };
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { ok: false, status: 500, error: "서버 설정 필요" };
  }

  const { data: room, error: roomErr } = await sb
    .from("group_rooms")
    .select("id, title, created_at, message_seq, member_count, last_message_at, last_message_preview, settings")
    .eq("id", rid)
    .maybeSingle();

  if (roomErr || !(room as { id?: string } | null)?.id) {
    return { ok: false, status: 404, error: "방을 찾을 수 없습니다." };
  }

  const { data: memRow, error: memErr } = await sb
    .from("group_room_members")
    .select("id, role, last_read_seq, notification_muted")
    .eq("room_id", rid)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (memErr) {
    return { ok: false, status: 500, error: memErr.message };
  }
  if (!(memRow as { id?: string } | null)?.id) {
    return { ok: false, status: 403, error: "멤버만 볼 수 있습니다." };
  }

  const r = room as {
    message_seq?: number;
    member_count?: number;
  };
  const m = memRow as { last_read_seq?: number };
  const roomSeq = Number(r.message_seq ?? 0);
  const lastRead = Number(m.last_read_seq ?? 0);
  const unreadCount = Math.max(0, roomSeq - lastRead);

  const msgRes = await loadGroupRoomMessageRowsForUser({
    roomId: rid,
    userId,
    limit: GROUP_CHAT_BOOTSTRAP_MESSAGE_LIMIT,
  });
  if (!msgRes.ok) {
    return { ok: false, status: msgRes.status, error: msgRes.error };
  }

  const { data: memberRows, error: listErr } = await sb
    .from("group_room_members")
    .select("user_id, role, joined_at")
    .eq("room_id", rid)
    .is("left_at", null)
    .order("joined_at", { ascending: true })
    .limit(GROUP_CHAT_BOOTSTRAP_MEMBER_CAP);

  if (listErr) {
    return { ok: false, status: 500, error: listErr.message };
  }

  const membersRaw = (memberRows ?? []) as { user_id: string; role: string; joined_at: string }[];
  const ids = [...new Set(membersRaw.map((x) => x.user_id))];

  let profiles: { id: string; nickname: string | null; username: string | null; avatar_url: string | null }[] = [];
  if (ids.length > 0) {
    const { data: profs } = await sb.from("profiles").select("id, nickname, username, avatar_url").in("id", ids);
    profiles = (profs ?? []) as typeof profiles;
  }
  const pfMap = new Map(profiles.map((p) => [p.id, p]));

  const members = membersRaw.map((row) => {
    const p = pfMap.get(row.user_id);
    return {
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
      nickname: p?.nickname ?? null,
      username: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
    };
  });

  const memberCount = Number(r.member_count ?? membersRaw.length);
  const hasMoreMembers = memberCount > GROUP_CHAT_BOOTSTRAP_MEMBER_CAP;

  const messages = msgRes.value.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      roomId: String(r.room_id ?? rid),
      senderId: String(r.sender_id ?? ""),
      messageType: String(r.message_type ?? "text"),
      body: String(r.body ?? ""),
      metadata: r.metadata,
      createdAt: String(r.created_at ?? ""),
      seq: Number(r.seq ?? 0),
    };
  });

  const body: GroupChatBootstrapApiBody = {
    ok: true,
    v: 1,
    domain: "group",
    room: {
      id: (room as { id: string }).id,
      title: (room as { title?: string }).title ?? "",
      createdAt: (room as { created_at?: string }).created_at,
      messageSeq: roomSeq,
      memberCount,
      lastMessageAt: (room as { last_message_at?: string | null }).last_message_at ?? null,
      lastMessagePreview: (room as { last_message_preview?: string | null }).last_message_preview ?? null,
      settings: (room as { settings?: unknown }).settings ?? {},
    },
    messages,
    unread: { count: unreadCount, lastReadSeq: lastRead },
    members,
    memberCount,
    hasMoreMembers,
  };

  return { ok: true, body };
}
