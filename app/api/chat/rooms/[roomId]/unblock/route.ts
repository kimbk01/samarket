/**
 * POST /api/chat/rooms/:roomId/unblock — 차단 해제 (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { data: room } = await sbAny
    .from("chat_rooms")
    .select("id, blocked_by, seller_id, buyer_id, initiator_id, peer_id")
    .eq("id", roomId)
    .maybeSingle();

  if (!room || (room as { blocked_by: string | null }).blocked_by !== userId) {
    return NextResponse.json({ ok: false, error: "차단한 사용자만 해제할 수 있습니다." }, { status: 403 });
  }
  const r = room as { seller_id: string | null; buyer_id: string | null; initiator_id: string; peer_id: string | null };
  const ids = [r.seller_id, r.buyer_id, r.initiator_id, r.peer_id].filter(Boolean) as string[];
  const blockedUserId = ids.find((id) => id !== userId);
  if (!blockedUserId) {
    return NextResponse.json({ ok: false, error: "상대 정보를 찾을 수 없습니다." }, { status: 400 });
  }
  const now = new Date().toISOString();
  await sbAny
    .from("user_blocks")
    .update({ released_at: now })
    .eq("user_id", userId)
    .eq("blocked_user_id", blockedUserId);
  await sbAny
    .from("chat_rooms")
    .update({ is_blocked: false, blocked_by: null, blocked_at: null, updated_at: now })
    .eq("id", roomId);
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "room_unblocked",
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
