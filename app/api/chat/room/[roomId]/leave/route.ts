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
    return NextResponse.json({ ok: false, error: "roomId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const access = await assertVerifiedMemberForAction(sbAny, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { data: row, error: fetchErr } = await sbAny
    .from("product_chats")
    .select("id, post_id, seller_id, buyer_id, seller_left_at, buyer_left_at")
    .eq("id", roomId)
    .maybeSingle();
  if (fetchErr || !row) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }

  const r = row as {
    post_id?: string | null;
    seller_id?: string | null;
    buyer_id?: string | null;
    seller_left_at?: string | null;
    buyer_left_at?: string | null;
  };
  const sid = String(r.seller_id ?? "").trim();
  const bid = String(r.buyer_id ?? "").trim();
  if (sid !== userId && bid !== userId) {
    return NextResponse.json({ ok: false, error: "참여자만 나갈 수 있습니다." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (sid === userId) {
    if (r.seller_left_at) {
      return NextResponse.json({ ok: true, alreadyLeft: true });
    }
    patch.seller_left_at = now;
  } else {
    if (r.buyer_left_at) {
      return NextResponse.json({ ok: true, alreadyLeft: true });
    }
    patch.buyer_left_at = now;
  }

  const { error: upErr } = await sbAny.from("product_chats").update(patch).eq("id", roomId);
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: "나가기 처리에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  const postId = String(r.post_id ?? "").trim();
  if (postId) {
    void syncPostInquiryNegotiatingFromItemTradeChats(sbAny, postId).catch(() => {});
  }

  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  return NextResponse.json({ ok: true });
}
