/**
 * POST /api/me/chats/mark-all-read
 * 로그인 사용자 기준: 거래·필라이프·오픈채팅·모임·매장 주문 등
 * `chat_rooms` 파이프라인 참가자 미읽음·레거시 `product_chats`·상대 메시지 read_at 을 일괄 읽음 처리.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const now = new Date().toISOString();

  const { data: partRows, error: partSelErr } = await sbAny
    .from("chat_room_participants")
    .select("room_id")
    .eq("user_id", userId);

  if (partSelErr) {
    return NextResponse.json({ ok: false, error: partSelErr.message }, { status: 500 });
  }

  const roomIds = [...new Set((partRows ?? []).map((r: { room_id: string }) => String(r.room_id ?? "").trim()).filter(Boolean))];

  let messageBatches = 0;
  for (const ids of chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
    const { error: msgErr } = await sbAny
      .from("chat_messages")
      .update({ read_at: now })
      .in("room_id", ids)
      .is("read_at", null)
      .or(`sender_id.is.null,sender_id.neq.${userId}`);
    if (msgErr) {
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
    }
    messageBatches += 1;
  }

  const { error: partUpErr } = await sbAny
    .from("chat_room_participants")
    .update({
      unread_count: 0,
      last_read_at: now,
      updated_at: now,
    })
    .eq("user_id", userId);

  if (partUpErr) {
    return NextResponse.json({ ok: false, error: partUpErr.message }, { status: 500 });
  }

  const [{ error: pcSellErr }, { error: pcBuyErr }] = await Promise.all([
    sbAny.from("product_chats").update({ unread_count_seller: 0, updated_at: now }).eq("seller_id", userId),
    sbAny.from("product_chats").update({ unread_count_buyer: 0, updated_at: now }).eq("buyer_id", userId),
  ]);

  if (pcSellErr || pcBuyErr) {
    const err = pcSellErr ?? pcBuyErr;
    return NextResponse.json({ ok: false, error: err?.message ?? "product_chats 갱신 실패" }, { status: 500 });
  }

  const { data: legacyRoomRows, error: legErr } = await sbAny
    .from("product_chats")
    .select("id")
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .limit(5000);

  if (legErr) {
    return NextResponse.json({ ok: false, error: legErr.message }, { status: 500 });
  }

  const legacyIds = [
    ...new Set(
      (legacyRoomRows ?? []).map((r: { id: string }) => String(r.id ?? "").trim()).filter(Boolean)
    ),
  ];
  let legacyMessageBatches = 0;
  for (const ids of chunkIds(legacyIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
    const { error: lmErr } = await sbAny
      .from("product_chat_messages")
      .update({ read_at: now })
      .in("product_chat_id", ids)
      .is("read_at", null)
      .or(`sender_id.is.null,sender_id.neq.${userId}`);
    if (lmErr) {
      return NextResponse.json({ ok: false, error: lmErr.message }, { status: 500 });
    }
    legacyMessageBatches += 1;
  }

  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);

  return NextResponse.json({
    ok: true,
    roomCount: roomIds.length,
    messageRoomBatches: messageBatches,
    legacyProductChatIds: legacyIds.length,
    legacyProductMessageBatches: legacyMessageBatches,
  });
}
