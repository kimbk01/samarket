/**
 * POST /api/chat/room/[roomId]/leave — 레거시 product_chats 방 나가기(참가자 시각 기록 + 물품 단계 재집계)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { parseRoomId } from "@/lib/validate-params";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { syncPostInquiryNegotiatingFromItemTradeChats } from "@/lib/trade/maybe-auto-promote-trade-listing-negotiating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const { roomId: raw } = await params;
  const roomId = parseRoomId(raw);
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "invalid_room_id", code: "invalid_room_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_config", code: "server_config" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const access = await assertVerifiedMemberForAction(sbAny, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { data: row, error: fetchErr } = await sbAny
    .from("product_chats")
    .select("id, post_id, seller_id, buyer_id, seller_left_at, buyer_left_at, community_messenger_room_id")
    .eq("id", roomId)
    .maybeSingle();
  if (fetchErr || !row) {
    return NextResponse.json({ ok: false, error: "chat_room_not_found", code: "chat_room_not_found" }, { status: 404 });
  }

  const r = row as {
    post_id?: string | null;
    seller_id?: string | null;
    buyer_id?: string | null;
    seller_left_at?: string | null;
    buyer_left_at?: string | null;
    community_messenger_room_id?: string | null;
  };
  const syncCmParticipant = async () => {
    const cmrid = String(r.community_messenger_room_id ?? "").trim();
    if (!cmrid) return;
    await sbAny.from("community_messenger_participants").delete().eq("room_id", cmrid).eq("user_id", userId);
  };
  const sid = String(r.seller_id ?? "").trim();
  const bid = String(r.buyer_id ?? "").trim();
  if (sid !== userId && bid !== userId) {
    return NextResponse.json({ ok: false, error: "not_participant", code: "not_participant" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (sid === userId) {
    if (r.seller_left_at) {
      await syncCmParticipant();
      return NextResponse.json({ ok: true, alreadyLeft: true });
    }
    patch.seller_left_at = now;
  } else {
    if (r.buyer_left_at) {
      await syncCmParticipant();
      return NextResponse.json({ ok: true, alreadyLeft: true });
    }
    patch.buyer_left_at = now;
  }

  const { error: upErr } = await sbAny.from("product_chats").update(patch).eq("id", roomId);
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: "leave_failed", code: "leave_failed" },
      { status: 500 }
    );
  }

  await syncCmParticipant();

  const postId = String(r.post_id ?? "").trim();
  if (postId) {
    void syncPostInquiryNegotiatingFromItemTradeChats(sbAny, postId).catch(() => {});
  }

  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  return NextResponse.json({ ok: true });
}
