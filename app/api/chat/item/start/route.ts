/**
 * POST /api/chat/item/start — 거래 채팅 시작/재사용 (구매자=세션)
 * Body: { itemId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ensureProductChatRowForItemTrade } from "@/lib/trade/ensure-product-chat-for-item-trade";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const buyerId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json(
      { ok: false, error: "서버 설정이 필요합니다." },
      { status: 500 }
    );
  }

  let body: { itemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "itemId 필요" }, { status: 400 });
  }
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!itemId) {
    return NextResponse.json({ ok: false, error: "itemId 필요" }, { status: 400 });
  }

  const sbAny = sb;

  // 1) 상품 및 판매자 — posts.user_id (스키마에 author_id 없음)
  const { data: post, error: postErr } = await sbAny.from("posts").select("*").eq("id", itemId).maybeSingle();

  if (postErr || !post) {
    return NextResponse.json({ ok: false, error: "상품을 찾을 수 없습니다." }, { status: 404 });
  }
  const row = post as Record<string, unknown>;
  const sellerId = postAuthorUserId(row) ?? "";
  if (!sellerId) {
    return NextResponse.json({ ok: false, error: "상품 정보가 올바르지 않습니다." }, { status: 400 });
  }

  if (sellerId === buyerId) {
    return NextResponse.json({ ok: false, error: "내 상품에는 채팅할 수 없습니다." }, { status: 400 });
  }
  if (row.is_deleted === true || row.status === "hidden" || row.visibility === "hidden") {
    return NextResponse.json({ ok: false, error: "비공개 또는 삭제된 상품입니다." }, { status: 400 });
  }

  if (shouldBlockNewItemChatForBuyer(row as Record<string, unknown>, buyerId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "다른 분과 예약이 진행 중인 상품입니다. 예약자만 이어서 채팅할 수 있어요.",
      },
      { status: 403 }
    );
  }

  // 2) 차단 확인 (user_blocks: user_id=blocker, blocked_user_id=blocked)
  const { data: block1 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", buyerId)
    .eq("blocked_user_id", sellerId)
    .maybeSingle();
  const { data: block2 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", sellerId)
    .eq("blocked_user_id", buyerId)
    .maybeSingle();
  if (block1 || block2) {
    return NextResponse.json({ ok: false, error: "차단 관계에서는 채팅할 수 없습니다." }, { status: 403 });
  }

  // 3) 기존 chat_rooms (item_trade, 동일 item+seller+buyer)
  const { data: existing } = await sbAny
    .from("chat_rooms")
    .select("id")
    .eq("room_type", "item_trade")
    .eq("item_id", itemId)
    .eq("seller_id", sellerId)
    .eq("buyer_id", buyerId)
    .maybeSingle();

  if (existing?.id) {
    // Reopen: participant hidden/left 복구
    const { data: participants } = await sbAny
      .from("chat_room_participants")
      .select("id, hidden, left_at, unread_count, reopen_count")
      .eq("room_id", existing.id);

    const now = new Date().toISOString();
    for (const p of participants || []) {
      const part = p as { id: string; hidden?: boolean; left_at?: string | null; reopen_count?: number };
      if (part.hidden || part.left_at) {
        await sbAny
          .from("chat_room_participants")
          .update({
            hidden: false,
            left_at: null,
            is_active: true,
            reopen_count: (part.reopen_count ?? 0) + 1,
            updated_at: now,
          })
          .eq("id", part.id);
      }
        }
    await sbAny
      .from("chat_rooms")
      .update({ reopened_at: now, updated_at: now })
      .eq("id", existing.id);

    try {
      await sbAny.from("chat_event_logs").insert({
        room_id: existing.id,
        event_type: "room_reopened",
        actor_user_id: buyerId,
        metadata: {},
      });
    } catch {
      /* ignore */
    }
    try {
      await ensureProductChatRowForItemTrade(sbAny, itemId, sellerId, buyerId);
    } catch {
      /* product_chats 실패 시에도 채팅방은 유효 */
    }
    return NextResponse.json({ ok: true, roomId: existing.id });
  }

  // 4) 새 방 생성
  const { data: insertedRoom, error: insertRoomErr } = await sbAny
    .from("chat_rooms")
    .insert({
      room_type: "item_trade",
      item_id: itemId,
      seller_id: sellerId,
      buyer_id: buyerId,
      initiator_id: buyerId,
      peer_id: sellerId,
      request_status: "none",
      trade_status: "inquiry",
    })
    .select("id")
    .single();

  if (insertRoomErr || !insertedRoom?.id) {
    return NextResponse.json(
      { ok: false, error: insertRoomErr?.message ?? "채팅방 생성에 실패했습니다." },
      { status: 500 }
    );
  }
  const roomId = insertedRoom.id as string;

  const now = new Date().toISOString();
  const { error: insertPartErr } = await sbAny.from("chat_room_participants").insert([
    { room_id: roomId, user_id: sellerId, role_in_room: "seller" },
    { room_id: roomId, user_id: buyerId, role_in_room: "buyer" },
  ]);

  if (insertPartErr) {
    return NextResponse.json(
      { ok: false, error: insertPartErr.message ?? "참여자 등록에 실패했습니다." },
      { status: 500 }
    );
  }

  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "room_created",
      actor_user_id: buyerId,
      metadata: { item_id: itemId },
    });
  } catch {
    /* ignore */
  }

  try {
    await ensureProductChatRowForItemTrade(sbAny, itemId, sellerId, buyerId);
  } catch {
    /* product_chats 실패 시에도 채팅방은 유효 */
  }

  return NextResponse.json({ ok: true, roomId });
}
