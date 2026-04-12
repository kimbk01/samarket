/**
 * GET /api/group-chat/rooms/:roomId/bootstrap — 단일 부트스트랩 (문서: docs/group-chat-bootstrap.md)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  GROUP_CHAT_BOOTSTRAP_MEMBER_CAP,
  GROUP_CHAT_BOOTSTRAP_MESSAGE_LIMIT,
} from "@/lib/group-chat/constants";
import { loadGroupRoomMessageRowsForUser } from "@/lib/group-chat/server/load-group-room-messages";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const { data: room, error: roomErr } = await sb
    .from("group_rooms")
    .select("id, title, created_at, message_seq, member_count, last_message_at, last_message_preview, settings")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !(room as { id?: string } | null)?.id) {
    return NextResponse.json({ error: "방을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: memRow, error: memErr } = await sb
    .from("group_room_members")
    .select("id, role, last_read_seq, notification_muted")
    .eq("room_id", roomId)
    .eq("user_id", auth.userId)
    .is("left_at", null)
    .maybeSingle();

  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }
  if (!(memRow as { id?: string } | null)?.id) {
    return NextResponse.json({ error: "멤버만 볼 수 있습니다." }, { status: 403 });
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
    roomId,
    userId: auth.userId,
    limit: GROUP_CHAT_BOOTSTRAP_MESSAGE_LIMIT,
  });
  if (!msgRes.ok) {
    return NextResponse.json({ error: msgRes.error }, { status: msgRes.status });
  }

  const { data: memberRows, error: listErr } = await sb
    .from("group_room_members")
    .select("user_id, role, joined_at")
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at", { ascending: true })
    .limit(GROUP_CHAT_BOOTSTRAP_MEMBER_CAP);

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
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

  const messages = msgRes.value.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    messageType: row.message_type,
    body: row.body,
    metadata: row.metadata,
    createdAt: row.created_at,
    seq: row.seq,
  }));

  return NextResponse.json({
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
  });
}
