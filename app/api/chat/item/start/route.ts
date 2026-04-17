/**
 * POST /api/chat/item/start — 거래 채팅 시작/재사용 (구매자=세션)
 * Body: { itemId: string }
 *
 * **상품 단위 방**: `chat_rooms` 에 `room_type=item_trade`, `item_id`, `seller_id`, `buyer_id` 로
 * 동일 쌍·동일 상품에 대해 기본은 한 방 재사용(재문의). 친구 관계여도 **물품 거래 스레드**는
 * `community_messenger_rooms.direct_key` 가 친구 DM 과 분리된다(`trade_item:` / `trade_pc:`).
 * 동일 상품·동일 쌍의 **여러 방**: `chat_rooms` 다중 행 허용. 기본은 `updated_at` 최신 방 재사용.
 * Body `forceNewThread: true` 이면 기존 방을 건너뛰고 **항상 새 `item_trade` 행**을 만든다.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { ensureMessengerRoomIdForItemTrade } from "@/lib/trade/ensure-messenger-room-for-trade-chat";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";
import { parsePostMetaField } from "@/lib/chats/chat-product-from-post";
import { fetchPostRowForTradeChatById } from "@/lib/posts/fetch-post-row-for-trade-chat";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const buyerId = auth.userId;

  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "서버 설정이 필요합니다." },
      { status: 500 }
    );
  }
  let body: { itemId?: string; forceNewThread?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "itemId 필요" }, { status: 400 });
  }
  const forceNewThread = body.forceNewThread === true;
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!itemId) {
    return NextResponse.json({ ok: false, error: "itemId 필요" }, { status: 400 });
  }

  const sbAny = sb;

  // 1) 회원 검증 + 상품 로더 — 직렬 대기 1회 제거
  const [access, post] = await Promise.all([
    assertVerifiedMemberForAction(sb as any, buyerId),
    fetchPostRowForTradeChatById(sbAny, itemId),
  ]);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  // 상품 및 판매자 — `/api/posts/.../detail` 과 동일 로더(DETAIL_SELECT → * → posts 폴백)
  if (!post) {
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

  // 2) 차단 + 기존 방 조회 — 순차 대신 병렬로 RTT 1회 절감
  const [block1Res, block2Res, existingRes] = await Promise.all([
    sbAny
      .from("user_blocks")
      .select("id")
      .eq("user_id", buyerId)
      .eq("blocked_user_id", sellerId)
      .maybeSingle(),
    sbAny
      .from("user_blocks")
      .select("id")
      .eq("user_id", sellerId)
      .eq("blocked_user_id", buyerId)
      .maybeSingle(),
    forceNewThread
      ? Promise.resolve({ data: null, error: null })
      : sbAny
          .from("chat_rooms")
          .select("id")
          .eq("room_type", "item_trade")
          .eq("item_id", itemId)
          .eq("seller_id", sellerId)
          .eq("buyer_id", buyerId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);
  const block1 = block1Res.data;
  const block2 = block2Res.data;
  if (block1 || block2) {
    return NextResponse.json({ ok: false, error: "차단 관계에서는 채팅할 수 없습니다." }, { status: 403 });
  }

  const existing = existingRes.data as { id?: string } | null;

  if (existing?.id && !forceNewThread) {
    // Reopen: participant hidden/left 복구
    const { data: participants } = await sbAny
      .from("chat_room_participants")
      .select("id, hidden, left_at, unread_count, reopen_count")
      .eq("room_id", existing.id);

    const now = new Date().toISOString();
    const hiddenOrLeftParticipants = (participants ?? []).filter((p) => {
      const part = p as { hidden?: boolean; left_at?: string | null };
      return part.hidden || Boolean(part.left_at);
    }) as { id: string; reopen_count?: number }[];
    if (hiddenOrLeftParticipants.length > 0) {
      await Promise.all(
        hiddenOrLeftParticipants.map((part) =>
          sbAny
            .from("chat_room_participants")
            .update({
              hidden: false,
              left_at: null,
              is_active: true,
              reopen_count: (part.reopen_count ?? 0) + 1,
              updated_at: now,
            })
            .eq("id", part.id)
        )
      );
    }
    await sbAny
      .from("chat_rooms")
      .update({ reopened_at: now, updated_at: now })
      .eq("id", existing.id);

    /** CM 확정 + 이벤트 로그 — 직렬 대기 1회 제거 */
    const [messengerRoomId] = await Promise.all([
      ensureMessengerRoomIdForItemTrade(sbAny, buyerId, itemId, sellerId, existing.id).catch(() => undefined),
      (async () => {
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
      })(),
    ]);
    const metaEx = parsePostMetaField(row.meta);
    const tradeChatKind =
      String(metaEx.trade_chat_kind ?? "").toLowerCase() === "job" ? "job" : undefined;
    return NextResponse.json({
      ok: true,
      roomId: existing.id,
      ...(messengerRoomId ? { messengerRoomId } : {}),
      tradeChatKind,
    });
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
    { room_id: roomId, user_id: sellerId, role_in_room: "seller", is_active: true, hidden: false },
    { room_id: roomId, user_id: buyerId, role_in_room: "buyer", is_active: true, hidden: false },
  ]);

  if (insertPartErr) {
    return NextResponse.json(
      { ok: false, error: insertPartErr.message ?? "참여자 등록에 실패했습니다." },
      { status: 500 }
    );
  }

  const [messengerRoomId] = await Promise.all([
    ensureMessengerRoomIdForItemTrade(sbAny, buyerId, itemId, sellerId, roomId).catch(() => undefined),
    (async () => {
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
    })(),
  ]);

  const metaNew = parsePostMetaField(row.meta);
  const tradeChatKind =
    String(metaNew.trade_chat_kind ?? "").toLowerCase() === "job" ? "job" : undefined;
  return NextResponse.json({
    ok: true,
    roomId,
    ...(messengerRoomId ? { messengerRoomId } : {}),
    tradeChatKind,
  });
}
