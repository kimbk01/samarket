/**
 * POST /api/chat/item/start 와 /api/trade/chat/entry/resolve 가 공유하는 본문.
 * resolve 에서 내부 HTTP hop 없이 직접 호출해 지연을 줄인다.
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { ensureMessengerRoomIdForItemTrade } from "@/lib/trade/ensure-messenger-room-for-trade-chat";
import { persistProductChatMessengerRoomId } from "@/lib/trade/persist-trade-messenger-room-link";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";
import { parsePostMetaField } from "@/lib/chats/chat-product-from-post";
import { fetchPostRowForTradeChatById } from "@/lib/posts/fetch-post-row-for-trade-chat";
import { isPostgresUniqueViolation } from "@/lib/postgres/unique-violation";
import type { TradeEntryPerfTrace } from "@/lib/trade/trade-entry-perf-log";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";

export type ItemTradeChatStartCoreResult =
  | {
      ok: true;
      httpStatus: 200;
      body: {
        ok: true;
        roomId: string;
        messengerRoomId?: string;
        tradeChatKind?: "job";
      };
    }
  | { ok: false; httpStatus: number; body: { ok: false; error: string } };

function trimMessengerCol(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  return t || "";
}

function trimMid(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t || undefined;
}

/** 메신저·`product_chats` 연결은 요청 경로에서 동기 처리 — 여기서는 감사 로그만 비동기 */
function schedulePostItemTradeRoomEventLog(
  sbAny: Parameters<typeof ensureMessengerRoomIdForItemTrade>[0],
  buyerId: string,
  itemId: string,
  chatRoomId: string,
  eventType: "room_reopened" | "room_created"
): void {
  after(async () => {
    try {
      await sbAny.from("chat_event_logs").insert({
        room_id: chatRoomId,
        event_type: eventType,
        actor_user_id: buyerId,
        metadata: eventType === "room_created" ? { item_id: itemId } : {},
      });
    } catch {
      /* ignore */
    }
  });
}

async function buildJsonForExistingItemTradeRoom(
  sbAny: SupabaseClient<any>,
  args: {
    existingRoomId: string;
    buyerId: string;
    itemId: string;
    sellerId: string;
    postRow: Record<string, unknown>;
    perf: TradeEntryPerfTrace | null;
  }
): Promise<ItemTradeChatStartCoreResult> {
  const { existingRoomId, buyerId, itemId, sellerId, postRow, perf } = args;

  const now = new Date().toISOString();
  perf?.mark("room_existing_parallel_load");
  const [participantsRes, linkQuickRes, pcRowRes] = await Promise.all([
    sbAny
      .from("chat_room_participants")
      .select("id, hidden, left_at, unread_count, reopen_count")
      .eq("room_id", existingRoomId),
    sbAny
      .from("chat_rooms")
      .update({ reopened_at: now, updated_at: now })
      .eq("id", existingRoomId)
      .select("community_messenger_room_id")
      .maybeSingle(),
    sbAny
      .from("product_chats")
      .select("id, community_messenger_room_id, buyer_left_at, seller_left_at")
      .eq("post_id", itemId)
      .eq("seller_id", sellerId)
      .eq("buyer_id", buyerId)
      .maybeSingle(),
  ]);
  perf?.noteDbRoundTrip(3);

  const participants = participantsRes.data;
  const hiddenOrLeftParticipants = (participants ?? []).filter((p) => {
    const part = p as { hidden?: boolean; left_at?: string | null };
    return part.hidden || Boolean(part.left_at);
  }) as { id: string; reopen_count?: number }[];
  if (hiddenOrLeftParticipants.length > 0) {
    perf?.mark("room_existing_participants_reopen_updates_start");
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
    perf?.noteDbRoundTrip(hiddenOrLeftParticipants.length);
    perf?.mark("room_existing_participants_reopen_updates_done");
  } else {
    perf?.mark("room_existing_participants_load");
  }

  /**
   * Reopen must also clear product_chats.*_left_at. Otherwise CM send still fails with
   * trade_sender_left while legacy chat_room_participants are already reactivated.
   */
  {
    const pcLeft = pcRowRes.data as {
      id?: string;
      buyer_left_at?: string | null;
      seller_left_at?: string | null;
    } | null;
    const pcLeftId = typeof pcLeft?.id === "string" ? pcLeft.id.trim() : "";
    if (
      pcLeftId &&
      (Boolean(pcLeft?.buyer_left_at) || Boolean(pcLeft?.seller_left_at))
    ) {
      await sbAny
        .from("product_chats")
        .update({
          buyer_left_at: null,
          seller_left_at: null,
          updated_at: now,
        })
        .eq("id", pcLeftId);
      perf?.noteDbRoundTrip(1);
    }
  }

  const quickMessengerId = trimMessengerCol(
    (linkQuickRes.data as { community_messenger_room_id?: unknown } | null)?.community_messenger_room_id
  );
  perf?.mark("room_existing_chat_rooms_link_select");

  const pcRow = pcRowRes.data as { id?: string; community_messenger_room_id?: unknown } | null;
  const pcId = trimMid(pcRow?.id);
  const onPc = trimMid(pcRow?.community_messenger_room_id);

  let messengerOut = quickMessengerId;

  if (quickMessengerId && pcId && onPc === quickMessengerId) {
    perf?.mark("messenger_room_existing_fast_path_aligned");
  } else if (quickMessengerId && pcId && !onPc) {
    perf?.mark("messenger_existing_fast_path_pc_backfill");
    await persistProductChatMessengerRoomId(sbAny, pcId, quickMessengerId);
    perf?.noteDbRoundTrip(1);
  } else if (quickMessengerId && !pcId) {
    perf?.mark("messenger_room_existing_fast_path_pc_ensure");
    const messengerRoomIdResolved = await ensureMessengerRoomIdForItemTrade(
      sbAny,
      buyerId,
      itemId,
      sellerId,
      existingRoomId,
      { knownMessengerRoomId: quickMessengerId, perf }
    ).catch(() => undefined);
    messengerOut = trimMessengerCol(messengerRoomIdResolved) || quickMessengerId;
  } else {
    perf?.mark("messenger_room_ensure_sync");
    const messengerRoomIdResolved = await ensureMessengerRoomIdForItemTrade(
      sbAny,
      buyerId,
      itemId,
      sellerId,
      existingRoomId,
      { knownMessengerRoomId: quickMessengerId || undefined, perf }
    ).catch(() => undefined);
    messengerOut = trimMessengerCol(messengerRoomIdResolved) || quickMessengerId;
  }

  perf?.mark("messenger_room_schedule_after");
  schedulePostItemTradeRoomEventLog(sbAny, buyerId, itemId, existingRoomId, "room_reopened");

  const metaEx = parsePostMetaField(postRow.meta);
  const tradeChatKind =
    String(metaEx.trade_chat_kind ?? "").toLowerCase() === "job" ? "job" : undefined;
  perf?.mark("response_payload_existing");

  return {
    ok: true,
    httpStatus: 200,
    body: {
      ok: true,
      roomId: existingRoomId,
      ...(messengerOut ? { messengerRoomId: messengerOut } : {}),
      ...(tradeChatKind ? { tradeChatKind } : {}),
    },
  };
}

/**
 * 구매자 세션 기준 item_trade 방 시작/재사용 (auth·세션은 호출자가 통과시킨 뒤 호출).
 */
export async function runItemTradeChatStartCore(args: {
  buyerId: string;
  itemId: string;
  sb: SupabaseClient<any>;
  perf?: TradeEntryPerfTrace | null;
}): Promise<ItemTradeChatStartCoreResult> {
  const { buyerId, itemId, sb: sbAny, perf = null } = args;

  perf?.mark("item_access_and_post_parallel");
  const [access, post] = await Promise.all([
    assertVerifiedMemberForAction(sbAny as never, buyerId),
    fetchPostRowForTradeChatById(sbAny, itemId),
  ]);
  if (!access.ok) {
    return { ok: false, httpStatus: access.status, body: { ok: false, error: access.error } };
  }

  perf?.mark("item_post_validate");
  if (!post) {
    return { ok: false, httpStatus: 404, body: { ok: false, error: "상품을 찾을 수 없습니다." } };
  }
  const row = post as Record<string, unknown>;
  const sellerId = postAuthorUserId(row) ?? "";
  if (!sellerId) {
    return { ok: false, httpStatus: 400, body: { ok: false, error: "상품 정보가 올바르지 않습니다." } };
  }

  if (sellerId === buyerId) {
    return { ok: false, httpStatus: 400, body: { ok: false, error: "내 상품에는 채팅할 수 없습니다." } };
  }
  if (row.is_deleted === true || row.status === "hidden" || row.visibility === "hidden") {
    return { ok: false, httpStatus: 400, body: { ok: false, error: "비공개 또는 삭제된 상품입니다." } };
  }

  if (shouldBlockNewItemChatForBuyer(row as Record<string, unknown>, buyerId)) {
    return {
      ok: false,
      httpStatus: 403,
      body: {
        ok: false,
        error: "다른 분과 예약이 진행 중인 상품입니다. 예약자만 이어서 채팅할 수 있어요.",
      },
    };
  }

  perf?.mark("blocks_and_existing_room_parallel");
  const [blockedEitherWay, existingRes] = await Promise.all([
    isBlockedEitherWay(buyerId, sellerId),
    sbAny
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
  if (blockedEitherWay) {
    return { ok: false, httpStatus: 403, body: { ok: false, error: "차단 관계에서는 채팅할 수 없습니다." } };
  }

  const existing = existingRes.data as { id?: string } | null;

  if (existing?.id) {
    return buildJsonForExistingItemTradeRoom(sbAny, {
      existingRoomId: existing.id,
      buyerId,
      itemId,
      sellerId,
      postRow: row,
      perf,
    });
  }

  perf?.mark("room_insert_new");
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

  if (insertRoomErr && isPostgresUniqueViolation(insertRoomErr)) {
    perf?.mark("room_insert_race_retry_select");
    const { data: afterRace } = await sbAny
      .from("chat_rooms")
      .select("id")
      .eq("room_type", "item_trade")
      .eq("item_id", itemId)
      .eq("seller_id", sellerId)
      .eq("buyer_id", buyerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raceId = (afterRace as { id?: string } | null)?.id;
    if (raceId) {
      return buildJsonForExistingItemTradeRoom(sbAny, {
        existingRoomId: raceId,
        buyerId,
        itemId,
        sellerId,
        postRow: row,
        perf,
      });
    }
  }

  if (insertRoomErr || !insertedRoom?.id) {
    return {
      ok: false,
      httpStatus: 500,
      body: { ok: false, error: insertRoomErr?.message ?? "채팅방 생성에 실패했습니다." },
    };
  }
  const roomId = insertedRoom.id as string;

  perf?.mark("participants_insert");
  const now = new Date().toISOString();
  const { error: insertPartErr } = await sbAny.from("chat_room_participants").insert([
    { room_id: roomId, user_id: sellerId, role_in_room: "seller", is_active: true, hidden: false },
    { room_id: roomId, user_id: buyerId, role_in_room: "buyer", is_active: true, hidden: false },
  ]);

  if (insertPartErr) {
    return {
      ok: false,
      httpStatus: 500,
      body: { ok: false, error: insertPartErr.message ?? "참여자 등록에 실패했습니다." },
    };
  }

  perf?.mark("messenger_ensure_sync_new_room");
  const messengerRoomIdNew = await ensureMessengerRoomIdForItemTrade(
    sbAny,
    buyerId,
    itemId,
    sellerId,
    roomId,
    { perf }
  ).catch(() => undefined);
  perf?.mark("messenger_schedule_after_new_room");
  schedulePostItemTradeRoomEventLog(sbAny, buyerId, itemId, roomId, "room_created");

  const metaNew = parsePostMetaField(row.meta);
  const tradeChatKind =
    String(metaNew.trade_chat_kind ?? "").toLowerCase() === "job" ? "job" : undefined;
  perf?.mark("response_payload_new_room");

  return {
    ok: true,
    httpStatus: 200,
    body: {
      ok: true,
      roomId,
      ...(trimMessengerCol(messengerRoomIdNew) ? { messengerRoomId: trimMessengerCol(messengerRoomIdNew) } : {}),
      ...(tradeChatKind ? { tradeChatKind } : {}),
    },
  };
}
