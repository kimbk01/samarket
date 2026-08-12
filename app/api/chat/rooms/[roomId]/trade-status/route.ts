import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/rooms/:roomId/trade-status — 거래 상태 변경 (세션)
 * Body: { tradeStatus: string }
 *
 * Bridge / secondary: listing SSOT is L1 (`seller-listing-state`).
 * When syncing posts for inquiry|negotiating|reserved, write seller_listing_state + status
 * via `buildPostsPatchFromSellerListingState` and bind reserved_buyer_id from room buyer.
 * completed → room trade_status only (seller-complete owns sold_buyer_id).
 * Exit: `TRADE_BRIDGE_EXIT_CONDITIONS.TRADE_STATUS_ROOM_API` — do not remove yet.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import {
  L1_SELLER_LISTING_STATES,
  buildPostsPatchFromSellerListingState,
} from "@/lib/trade/posts-listing-write-fields";

const ALLOWED: string[] = [
  "inquiry",
  "negotiating",
  "reserved",
  "appointment_set",
  "completed",
  "cancelled",
  "dispute",
];

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
  let body: { tradeStatus?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const tradeStatus = typeof body.tradeStatus === "string" ? body.tradeStatus.trim() : "";
  if (!roomId || !ALLOWED.includes(tradeStatus)) {
    return NextResponse.json({ ok: false, error: "roomId, tradeStatus 필요" }, { status: 400 });
  }

  const sbAny = sb;

  type TradeRow = { id: string; seller_id: string; buyer_id: string; item_id: string | null };

  let effectiveRoomId = roomId;
  let r: TradeRow | null = null;

  const { data: crById } = await sbAny
    .from("chat_rooms")
    .select("id, room_type, seller_id, buyer_id, item_id")
    .eq("id", roomId)
    .eq("room_type", "item_trade")
    .maybeSingle();

  if (crById) {
    r = crById as TradeRow;
  } else {
    // URL/클라이언트가 product_chats.id를 넘기는 경우 — chat_rooms UUID와 불일치하면 404 → UI가 판매중으로 롤백됨
    const { data: pc } = await sbAny
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id")
      .eq("id", roomId)
      .maybeSingle();
    if (!pc) {
      return NextResponse.json({ ok: false, error: "거래 채팅방을 찾을 수 없습니다." }, { status: 404 });
    }
    const pcRow = pc as { post_id: string; seller_id: string; buyer_id: string };
    if (pcRow.seller_id !== userId) {
      return NextResponse.json({ ok: false, error: "판매자만 거래 상태를 변경할 수 있습니다." }, { status: 403 });
    }

    const { data: postRow } = await sbAny
      .from(POSTS_TABLE_READ)
      .select("user_id")
      .eq("id", pcRow.post_id)
      .maybeSingle();
    const post = postRow as { user_id?: string } | null;
    const sellerCandidates = new Set(
      [pcRow.seller_id, post?.user_id].filter((x): x is string => typeof x === "string" && x.length > 0)
    );

    const { data: crRows } = await sbAny
      .from("chat_rooms")
      .select("id, seller_id, buyer_id, item_id")
      .eq("room_type", "item_trade")
      .eq("item_id", pcRow.post_id)
      .eq("buyer_id", pcRow.buyer_id);

    const rows = (crRows ?? []) as TradeRow[];
    const linked =
      rows.find((row) => row.seller_id === userId) ??
      rows.find((row) => sellerCandidates.has(row.seller_id)) ??
      null;

    if (linked) {
      effectiveRoomId = linked.id;
      r = linked;
    } else {
      const nowIns = new Date().toISOString();
      const { data: insertedRoom, error: insertRoomErr } = await sbAny
        .from("chat_rooms")
        .insert({
          room_type: "item_trade",
          item_id: pcRow.post_id,
          seller_id: pcRow.seller_id,
          buyer_id: pcRow.buyer_id,
          initiator_id: pcRow.buyer_id,
          peer_id: pcRow.seller_id,
          request_status: "none",
          trade_status: "inquiry",
          updated_at: nowIns,
        })
        .select("id")
        .single();

      if (insertRoomErr || !insertedRoom?.id) {
        return NextResponse.json(
          { ok: false, error: insertRoomErr?.message ?? "거래 채팅방을 준비하지 못했습니다." },
          { status: 500 }
        );
      }
      effectiveRoomId = insertedRoom.id as string;
      const { error: insertPartErr } = await sbAny.from("chat_room_participants").insert([
        {
          room_id: effectiveRoomId,
          user_id: pcRow.seller_id,
          role_in_room: "seller",
          is_active: true,
          hidden: false,
        },
        {
          room_id: effectiveRoomId,
          user_id: pcRow.buyer_id,
          role_in_room: "buyer",
          is_active: true,
          hidden: false,
        },
      ]);
      if (insertPartErr) {
        return NextResponse.json(
          { ok: false, error: insertPartErr.message ?? "참여자 등록에 실패했습니다." },
          { status: 500 }
        );
      }
      r = {
        id: effectiveRoomId,
        seller_id: pcRow.seller_id,
        buyer_id: pcRow.buyer_id,
        item_id: pcRow.post_id,
      };
      try {
        await sbAny.from("chat_event_logs").insert({
          room_id: effectiveRoomId,
          event_type: "room_created",
          actor_user_id: userId,
          metadata: { item_id: pcRow.post_id, source: "trade_status_product_chat" },
        });
      } catch {
        /* ignore */
      }
    }
  }

  if (!r) {
    return NextResponse.json({ ok: false, error: "거래 채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  if (r.seller_id !== userId) {
    return NextResponse.json({ ok: false, error: "판매자만 거래 상태를 변경할 수 있습니다." }, { status: 403 });
  }

  const now = new Date().toISOString();
  await sbAny.from("chat_rooms").update({ trade_status: tradeStatus, updated_at: now }).eq("id", effectiveRoomId);
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: effectiveRoomId,
      event_type: "trade_status_changed",
      actor_user_id: userId,
      metadata: { trade_status: tradeStatus },
    });
  } catch {
    /* ignore */
  }

  // Bridge mirror: L1 listing columns when tradeStatus is a listing state.
  // reserved → always bind this room's buyer_id (no buyer-less reserved).
  // completed → room-only (sold_buyer_id / chat flow remain seller-complete authority).
  if (
    r.item_id &&
    (L1_SELLER_LISTING_STATES as readonly string[]).includes(tradeStatus) &&
    tradeStatus !== "completed"
  ) {
    const { data: postRow } = await sbAny
      .from(POSTS_TABLE_READ)
      .select("id, user_id")
      .eq("id", r.item_id)
      .maybeSingle();
    const post = postRow as { user_id?: string } | null;
    const ownerId = post?.user_id ?? "";
    if (post && ownerId === r.seller_id) {
      const listing = tradeStatus as SellerListingState;
      if (listing === "reserved" && !String(r.buyer_id ?? "").trim()) {
        return NextResponse.json(
          { ok: false, error: "예약에는 채팅 상대 구매자가 필요합니다.", code: "reserved_requires_buyer" },
          { status: 400 }
        );
      }
      const patch = buildPostsPatchFromSellerListingState({
        sellerListingState: listing,
        nowIso: now,
        reservedBuyerId: listing === "reserved" ? String(r.buyer_id).trim() : null,
        clearReservedBuyer: listing !== "reserved",
      });
      await sbAny.from(POSTS_TABLE_WRITE).update(patch).eq("id", r.item_id);
    }
  }

  return NextResponse.json({ ok: true, tradeStatus });
}
