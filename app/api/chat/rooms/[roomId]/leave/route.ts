/**
 * POST /api/chat/rooms/:roomId/leave — 채팅방 나가기 (soft, 세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const now = new Date().toISOString();
  const { data: openChatMeta } = await sbAny
    .from("open_chat_rooms")
    .select("id")
    .eq("linked_chat_room_id", roomId)
    .maybeSingle();
  const openChatRoomId = (openChatMeta as { id?: string } | null)?.id ?? null;

  if (openChatRoomId) {
    const { data: member } = await sbAny
      .from("open_chat_members")
      .select("id, role, status")
      .eq("room_id", String(openChatRoomId))
      .eq("user_id", userId)
      .maybeSingle();
    const openChatMember = member as { id?: string; role?: string | null; status?: string | null } | null;
    if (!openChatMember?.id || openChatMember.status !== "joined") {
      return NextResponse.json({ ok: false, error: "오픈채팅 참여 정보를 찾을 수 없습니다." }, { status: 404 });
    }
    if (openChatMember.role === "owner") {
      return NextResponse.json({ ok: false, error: "방장은 채팅방에서 나갈 수 없습니다." }, { status: 400 });
    }
    await sbAny
      .from("open_chat_members")
      .update({
        status: "left",
        left_at: now,
        status_reason: "chat_room_leave",
      })
      .eq("id", String(openChatMember.id));
  }

  const { data: part, error: upErr } = await sbAny
    .from("chat_room_participants")
    .update({
      left_at: now,
      is_active: false,
      hidden: true,
      updated_at: now,
    })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (upErr || !part) {
    return NextResponse.json({ ok: false, error: "참여 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  /* 활성 참가자가 더 없으면 방 잠금 — 유령 대화·뱃지용 미읽음 정리 */
  const { data: stillRows } = await sbAny
    .from("chat_room_participants")
    .select("id, is_active")
    .eq("room_id", roomId)
    .eq("hidden", false)
    .is("left_at", null);
  const activeOthers = (stillRows ?? []).filter((row: { is_active?: boolean | null }) => row.is_active !== false);
  if (activeOthers.length === 0) {
    await sbAny
      .from("chat_rooms")
      .update({ is_locked: true, locked_at: now, updated_at: now })
      .eq("id", roomId);
  }

  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "participant_left",
      actor_user_id: userId,
      metadata: {},
    });
  } catch {
    /* ignore */
  }
  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  return NextResponse.json({ ok: true });
}
