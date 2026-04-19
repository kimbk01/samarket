/**
 * POST /api/chat/rooms/:roomId/block — 상대 차단
 * Body: { reason? } (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
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
  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: room } = await sbAny
    .from("chat_rooms")
    .select("seller_id, buyer_id, initiator_id, peer_id")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  const r = room as { seller_id: string | null; buyer_id: string | null; initiator_id: string; peer_id: string | null };
  const ids = [r.seller_id, r.buyer_id, r.initiator_id, r.peer_id].filter(Boolean) as string[];
  const blockedUserId = ids.find((id) => id !== userId);
  if (!blockedUserId) {
    return NextResponse.json({ ok: false, error: "상대를 찾을 수 없습니다." }, { status: 400 });
  }

  await sbAny.from("user_blocks").upsert(
    {
      user_id: userId,
      blocked_user_id: blockedUserId,
      source_room_id: roomId,
      reason: reason ?? undefined,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,blocked_user_id" }
  );
  const now = new Date().toISOString();
  await sbAny
    .from("chat_rooms")
    .update({ is_blocked: true, blocked_by: userId, blocked_at: now, updated_at: now })
    .eq("id", roomId);
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "room_blocked",
      actor_user_id: userId,
      metadata: { blocked_user_id: blockedUserId },
    });
  } catch {
    /* ignore */
  }
  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  return NextResponse.json({ ok: true });
}
