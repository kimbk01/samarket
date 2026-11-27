/**
 * POST /api/chat/rooms/:roomId/block — 상대 차단
 * Body: { reason? } (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { blockUserSocial } from "@/lib/community-messenger/social-relations";
import { terminateDirectCallsOnBlockBestEffort } from "@/lib/community-messenger/block-call-termination";
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
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config", code: "server_config" }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: "room_id_required", code: "room_id_required" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: room } = await sbAny
    .from("chat_rooms")
    .select("seller_id, buyer_id, initiator_id, peer_id")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ ok: false, error: "room_not_found", code: "room_not_found" }, { status: 404 });
  }
  const r = room as { seller_id: string | null; buyer_id: string | null; initiator_id: string; peer_id: string | null };
  const ids = [r.seller_id, r.buyer_id, r.initiator_id, r.peer_id].filter(Boolean) as string[];
  const blockedUserId = ids.find((id) => id !== userId);
  if (!blockedUserId) {
    return NextResponse.json({ ok: false, error: "peer_not_found", code: "peer_not_found" }, { status: 400 });
  }

  const blockResult = await blockUserSocial(userId, blockedUserId);
  if (!blockResult.ok) {
    /** 코드만 — DB 원문은 로그로 (재감사 2026-11-27 · 화면 `USER_BLOCK_ERROR_KEYS`) */
    console.error("[chat/rooms/block] block failed", blockResult.error ?? "");
    return NextResponse.json({ ok: false, error: "block_failed", code: "block_failed" }, { status: 500 });
  }

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
      metadata: { blocked_user_id: blockedUserId, reason: reason ?? null },
    });
  } catch {
    /* ignore */
  }
  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  /** 메신저 차단 경로와 동일 정책 — pair 일반 DM 의 ringing/active 통화 종료(실패해도 차단은 성공) */
  await terminateDirectCallsOnBlockBestEffort({
    blockerUserId: userId,
    blockedUserId,
    logTag: "chat/rooms/block",
  });
  return NextResponse.json({ ok: true });
}
