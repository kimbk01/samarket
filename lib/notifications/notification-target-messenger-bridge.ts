/**
 * CM room → notification_targets bump/clear (badge SSOT write path).
 *
 * Domain snapshot: always pass canonical roomId into bumpNotificationTarget;
 * RPC loads rooms.chat_domain + domain_identity_key (pair fill only).
 *
 * DO NOT: trade/delivery CM 방에 consumer `chat_room` bump — bottom_nav_chat 는 general 만.
 * trade → `trade` target, delivery customer → `buyer_order`, delivery owner → `owner_order_chat`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";
import { runWithConcurrencyLimit } from "@/lib/shared/run-with-concurrency-limit";
import {
  bumpChatRoomTargetFromMessengerParticipant,
  bumpNotificationTarget,
  clearChatRoomTargetFromMessengerRead,
  clearNotificationTarget,
} from "@/lib/notifications/notification-targets";

type StoreOrderRoomContext = {
  orderId: string;
  storeId: string | null;
  ownerUserId: string | null;
};

type MessengerRoomBadgeKind = "general" | "group" | "trade" | "delivery";

async function loadStoreOrderRoomContext(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<StoreOrderRoomContext | null> {
  const rid = roomId.trim();
  if (!rid) return null;
  const { data } = await sb
    .from("store_orders")
    .select("id, store_id, stores(owner_user_id)")
    .eq("community_messenger_room_id", rid)
    .maybeSingle();
  if (!data || typeof data !== "object") return null;
  const row = data as {
    id?: unknown;
    store_id?: unknown;
    stores?: { owner_user_id?: unknown } | Array<{ owner_user_id?: unknown }> | null;
  };
  const orderId = typeof row.id === "string" ? row.id.trim() : "";
  if (!orderId) return null;
  const storeId = typeof row.store_id === "string" ? row.store_id.trim() : null;
  const stores = row.stores;
  const store = Array.isArray(stores) ? stores[0] : stores;
  const ownerUserId =
    store && typeof store.owner_user_id === "string" ? store.owner_user_id.trim() : null;
  return { orderId, storeId, ownerUserId };
}

async function loadMessengerRoomDirectKey(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<string | null> {
  const rid = roomId.trim();
  if (!rid) return null;
  const { data } = await sb
    .from("community_messenger_rooms")
    .select("direct_key")
    .eq("id", rid)
    .maybeSingle();
  if (!data || typeof data !== "object") return null;
  const dk = (data as { direct_key?: unknown }).direct_key;
  return typeof dk === "string" ? dk.trim() || null : null;
}

function orderIdFromDirectKey(directKey: string | null | undefined): string | null {
  const dk = directKey?.trim() ?? "";
  if (dk.startsWith("store_order:")) {
    const id = dk.slice("store_order:".length).trim();
    return id || null;
  }
  if (dk.startsWith("trade_order:")) {
    const id = dk.slice("trade_order:".length).trim();
    return id || null;
  }
  return null;
}

function resolveMessengerRoomBadgeKind(
  orderCtx: StoreOrderRoomContext | null,
  directKey: string | null,
  roomType?: string | null
): MessengerRoomBadgeKind {
  if (orderCtx?.orderId) return "delivery";
  const dk = directKey?.trim() ?? "";
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return "trade";
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) return "delivery";
  const rt = (roomType ?? "").trim();
  if (rt === "private_group" || rt === "open_group") return "group";
  return "general";
}

function messengerTargetForUser(
  userId: string,
  ctx: StoreOrderRoomContext | null
): { isOwnerOrderChat: boolean; storeId: string | null } {
  const uid = userId.trim();
  if (ctx?.ownerUserId && uid === ctx.ownerUserId) {
    return { isOwnerOrderChat: true, storeId: ctx.storeId };
  }
  return { isOwnerOrderChat: false, storeId: null };
}

async function bumpDeliveryTargetForRecipient(
  sb: SupabaseClient<any>,
  opts: {
    userId: string;
    roomId: string;
    orderCtx: StoreOrderRoomContext | null;
    directKey: string | null;
  }
): Promise<void> {
  const uid = opts.userId.trim();
  const rid = opts.roomId.trim();
  if (!uid || !rid) return;
  const ownerTarget = messengerTargetForUser(uid, opts.orderCtx);
  if (ownerTarget.isOwnerOrderChat) {
    await bumpChatRoomTargetFromMessengerParticipant(sb, {
      userId: uid,
      roomId: rid,
      isOwnerOrderChat: true,
      storeId: ownerTarget.storeId,
    });
    return;
  }
  const orderId = opts.orderCtx?.orderId ?? orderIdFromDirectKey(opts.directKey);
  if (!orderId) return;
  await bumpNotificationTarget(sb, {
    userId: uid,
    targetType: "buyer_order",
    targetId: orderId,
    scope: "consumer",
    roomId: rid,
  });
}

async function clearTradeTargetForMessengerRoomUser(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string
): Promise<void> {
  const uid = userId.trim();
  const rid = roomId.trim();
  if (!uid || !rid) return;

  const { data: pc } = await sb
    .from("product_chats")
    .select("post_id, seller_id, buyer_id")
    .eq("community_messenger_room_id", rid)
    .maybeSingle();
  if (!pc || typeof pc !== "object") return;

  const postId = typeof pc.post_id === "string" ? pc.post_id.trim() : "";
  const sellerId = typeof pc.seller_id === "string" ? pc.seller_id.trim() : "";
  const buyerId = typeof pc.buyer_id === "string" ? pc.buyer_id.trim() : "";
  if (!postId || !sellerId || !buyerId) return;

  await clearNotificationTarget(sb, {
    userId: uid,
    targetType: "trade",
    targetId: buildTradeTargetId(postId, sellerId, buyerId),
  });
}

export async function bumpMessengerRoomTargetsForRecipients(
  sb: SupabaseClient<any>,
  opts: {
    roomId: string;
    fromUserId: string;
    /** Opt-in T5 spans (`x-samarket-t5-trace`). */
    _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace;
  }
): Promise<void> {
  const roomId = opts.roomId.trim();
  const fromUserId = opts.fromUserId.trim();
  if (!roomId || !fromUserId) return;
  const t5 = opts._t5;
  let spanT5:
    | ((
        trace: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace,
        name: string,
        startedAtWall: number
      ) => number)
    | null = null;
  if (t5) {
    spanT5 = (await import("@/lib/community-messenger/monitoring/t5-send-stage-trace")).spanT5;
  }

  const parallelT0 = performance.now();
  const [{ data: roomRow }, { data: participants }, orderCtx, directKey] = await Promise.all([
    sb.from("community_messenger_rooms").select("room_type, chat_domain").eq("id", roomId).maybeSingle(),
    sb.from("community_messenger_participants").select("user_id, left_at").eq("room_id", roomId),
    loadStoreOrderRoomContext(sb, roomId),
    loadMessengerRoomDirectKey(sb, roomId),
  ]);
  if (t5 && spanT5) spanT5(t5, "TB_parallel_load_ms", parallelT0);

  const roomType =
    roomRow && typeof roomRow === "object" && typeof (roomRow as { room_type?: unknown }).room_type === "string"
      ? String((roomRow as { room_type: string }).room_type).trim()
      : "";
  const isGroupRoom = roomType === "private_group" || roomType === "open_group";
  const kind = resolveMessengerRoomBadgeKind(orderCtx, directKey, roomType);

  let recipientIds: string[];
  if (isGroupRoom) {
    const recipT0 = performance.now();
    const { listActiveGroupRecipientUserIds } = await import(
      "@/lib/community-messenger/group/group-active-membership-gate"
    );
    recipientIds =
      (await listActiveGroupRecipientUserIds({
        roomId,
        excludeUserId: fromUserId,
        roomType,
        supabase: sb,
      })) ?? [];
    if (t5 && spanT5) spanT5(t5, "TB_group_recipients_ms", recipT0);
  } else {
    recipientIds = [];
    for (const row of (participants ?? []) as Array<{ user_id?: unknown }>) {
      const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
      if (!uid || uid === fromUserId) continue;
      recipientIds.push(uid);
    }
  }

  const writesT0 = performance.now();
  for (const uid of recipientIds) {
    if (kind === "trade") {
      await bumpTradeTargetForMessengerRoomRecipients(sb, {
        roomId,
        recipientUserIds: [uid],
        senderUserId: fromUserId,
        _t5: t5,
      });
      continue;
    }
    if (kind === "delivery") {
      await bumpDeliveryTargetForRecipient(sb, { userId: uid, roomId, orderCtx, directKey });
      continue;
    }
    await bumpChatRoomTargetFromMessengerParticipant(sb, {
      userId: uid,
      roomId,
      isOwnerOrderChat: false,
      storeId: null,
      _t5: t5,
    });
  }
  if (t5 && spanT5) spanT5(t5, "TB_bump_writes_ms", writesT0);
}

export async function clearMessengerRoomNotificationTargetAfterRead(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string
): Promise<void> {
  const uid = userId.trim();
  const rid = roomId.trim();
  if (!uid || !rid) return;

  const [orderCtx, directKey, roomRow] = await Promise.all([
    loadStoreOrderRoomContext(sb, rid),
    loadMessengerRoomDirectKey(sb, rid),
    sb.from("community_messenger_rooms").select("room_type").eq("id", rid).maybeSingle(),
  ]);
  const roomType =
    roomRow.data &&
    typeof roomRow.data === "object" &&
    typeof (roomRow.data as { room_type?: unknown }).room_type === "string"
      ? String((roomRow.data as { room_type: string }).room_type).trim()
      : "";
  const kind = resolveMessengerRoomBadgeKind(orderCtx, directKey, roomType);

  if (kind === "trade") {
    await clearTradeTargetForMessengerRoomUser(sb, uid, rid);
    return;
  }
  if (kind === "delivery") {
    // OrderDomain.readOrderChat owns buyer_order / owner_order_chat clear.
    return;
  }
  await clearChatRoomTargetFromMessengerRead(sb, {
    userId: uid,
    roomId: rid,
    isOwnerOrderChat: false,
    storeId: null,
  });
}

export async function bumpTradeTargetForMessengerRoomRecipients(
  sb: SupabaseClient<any>,
  opts: {
    roomId: string;
    recipientUserIds: string[];
    senderUserId?: string | null;
    _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace;
  }
): Promise<void> {
  const roomId = opts.roomId.trim();
  if (!roomId || !opts.recipientUserIds.length) return;

  let addSpanT5:
    | ((
        trace: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace,
        name: string,
        startedAtWall: number
      ) => number)
    | null = null;
  if (opts._t5) {
    addSpanT5 = (await import("@/lib/community-messenger/monitoring/t5-send-stage-trace")).addSpanT5;
  }

  const pcT0 = performance.now();
  const { data: pc } = await sb
    .from("product_chats")
    .select("post_id, seller_id, buyer_id")
    .eq("community_messenger_room_id", roomId)
    .maybeSingle();
  if (opts._t5 && addSpanT5) addSpanT5(opts._t5, "TB_write_pc_select_ms", pcT0);
  if (!pc || typeof pc !== "object") return;

  const postId = typeof pc.post_id === "string" ? pc.post_id.trim() : "";
  const sellerId = typeof pc.seller_id === "string" ? pc.seller_id.trim() : "";
  const buyerId = typeof pc.buyer_id === "string" ? pc.buyer_id.trim() : "";
  if (!postId || !sellerId || !buyerId) return;

  const targetId = buildTradeTargetId(postId, sellerId, buyerId);
  for (const rawUid of opts.recipientUserIds) {
    const uid = rawUid.trim();
    if (!uid) continue;
    await bumpNotificationTarget(sb, {
      userId: uid,
      targetType: "trade",
      targetId,
      scope: "consumer",
      actorUserId: opts.senderUserId ?? null,
      roomId,
      _t5: opts._t5,
    });
  }
}

/** P2: 텍스트 전송 경로 전용 target bump 동시 실행 상한(큰 그룹에서 PostgREST 동시성 폭주 방지) */
export const MESSENGER_TARGET_BUMP_PARALLEL_CONCURRENCY = 8;

export type MessengerRoomTargetBumpParallelResult = {
  roomType: string;
  kind: MessengerRoomBadgeKind;
  directKey: string | null;
  recipientIds: string[];
};

/**
 * P2 — `POST /rooms/[roomId]/messages`(텍스트) 전용 병렬 target bump.
 *
 * 기존 `bumpMessengerRoomTargetsForRecipients`(통화 기록 bump 경로 `publish-messenger-room-bump.ts` 가 공유)는
 * 그대로 두고 이 함수만 텍스트 route 가 쓴다(통화 무접촉 I7).
 *
 * 기존과 같은 것: 수신자 집합 판정(그룹 = 활성 그룹 수신자), 종류별 target(trade/delivery/general·group),
 * 같은 upsert RPC·같은 인자. 수신자마다 다른 행(user_id)이라 순서 무관.
 * 다른 것: ① 수신자끼리 동시 실행(상한 8) ② 거래 방은 `product_chats` 를 1회만 읽음
 * ③ 비그룹 분기에서 나간 참가자(`left_at`)는 제외(B8 — 나간 사람 배지 bump 결함).
 * 한 수신자 실패가 다른 수신자 bump 를 멈추지 않는다.
 */
export async function bumpMessengerRoomTargetsForRecipientsParallel(
  sb: SupabaseClient<any>,
  opts: {
    roomId: string;
    fromUserId: string;
    /**
     * 보내기 1단계 (Owner 「둘 다 승인」 2026-11-19) — 전송 RPC 가 이미 돌려준 방 정보.
     * 있으면 방·참가자·주문 재조회를 건너뛴다(결과 동일 근거):
     * · room_type·direct_key = 같은 방 행(전송 RPC `v_room`), chat_domain 은 불변(guard 트리거)
     * · 주문 연결 방은 운영 전부 chat_domain='store_order'(11-19 조회 821/821) → 그 밖이면 주문 조회 결과는 항상 없음
     * · 비그룹 받는 사람 = RPC `user_id <> 보낸 사람 AND left_at IS NULL` = 아래 비그룹 분기와 같은 규칙.
     *   그룹은 강퇴 판정 경로가 달라 기존 조회 그대로.
     */
    known?: {
      roomType: string | null;
      chatDomain: string | null;
      directKey: string | null;
      recipientUserIds: string[] | null;
    } | null;
    _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace;
  }
): Promise<MessengerRoomTargetBumpParallelResult | null> {
  const roomId = opts.roomId.trim();
  const fromUserId = opts.fromUserId.trim();
  if (!roomId || !fromUserId) return null;
  const t5 = opts._t5;
  let spanT5:
    | ((
        trace: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace,
        name: string,
        startedAtWall: number
      ) => number)
    | null = null;
  if (t5) {
    spanT5 = (await import("@/lib/community-messenger/monitoring/t5-send-stage-trace")).spanT5;
  }

  const parallelT0 = performance.now();
  const known = opts.known ?? null;
  const knownRoomType = typeof known?.roomType === "string" ? known.roomType.trim() : "";
  const knownChatDomain = typeof known?.chatDomain === "string" ? known.chatDomain.trim() : "";
  const useKnown = Boolean(knownRoomType && knownChatDomain);
  const knownIsGroup = knownRoomType === "private_group" || knownRoomType === "open_group";
  const knownRecipients =
    useKnown && !knownIsGroup && Array.isArray(known?.recipientUserIds) ? known!.recipientUserIds : null;
  const [roomRes, participantsRes, orderCtx] = await Promise.all([
    useKnown
      ? Promise.resolve({ data: { room_type: knownRoomType, direct_key: known?.directKey ?? null } })
      : sb.from("community_messenger_rooms").select("room_type, direct_key").eq("id", roomId).maybeSingle(),
    knownRecipients
      ? Promise.resolve({
          data: knownRecipients.map((user_id) => ({ user_id, left_at: null as string | null })),
        })
      : useKnown && knownIsGroup
        ? /** 2026-11-21 보내기 1단계 — 그룹방은 아래 그룹 분기가 받는 사람을 따로 고른다 → 이 참가자 목록은 쓰지 않음 */
          Promise.resolve({ data: [] as Array<{ user_id: string; left_at: string | null }> })
        : sb.from("community_messenger_participants").select("user_id, left_at").eq("room_id", roomId),
    useKnown && knownChatDomain !== "store_order" ? Promise.resolve(null) : loadStoreOrderRoomContext(sb, roomId),
  ]);
  const roomRow = roomRes.data;
  const participants = participantsRes.data;
  if (t5 && spanT5) spanT5(t5, "TB_parallel_load_ms", parallelT0);

  const row =
    roomRow && typeof roomRow === "object" ? (roomRow as { room_type?: unknown; direct_key?: unknown }) : null;
  const roomType = typeof row?.room_type === "string" ? row.room_type.trim() : "";
  const directKey = typeof row?.direct_key === "string" ? row.direct_key.trim() || null : null;
  const isGroupRoom = roomType === "private_group" || roomType === "open_group";
  const kind = resolveMessengerRoomBadgeKind(orderCtx, directKey, roomType);

  let recipientIds: string[];
  if (isGroupRoom) {
    const recipT0 = performance.now();
    const { listActiveGroupRecipientUserIds } = await import(
      "@/lib/community-messenger/group/group-active-membership-gate"
    );
    recipientIds =
      (await listActiveGroupRecipientUserIds({
        roomId,
        excludeUserId: fromUserId,
        roomType,
        supabase: sb,
      })) ?? [];
    if (t5 && spanT5) spanT5(t5, "TB_group_recipients_ms", recipT0);
  } else {
    recipientIds = [];
    for (const p of (participants ?? []) as Array<{ user_id?: unknown; left_at?: unknown }>) {
      const uid = typeof p.user_id === "string" ? p.user_id.trim() : "";
      if (!uid || uid === fromUserId) continue;
      /** B8: 나간 참가자는 배지 bump 대상이 아니다(방 목록에 없는 방의 배지) */
      if (typeof p.left_at === "string" && p.left_at.trim()) continue;
      recipientIds.push(uid);
    }
  }

  const writesT0 = performance.now();
  if (kind === "trade") {
    const { data: pc } = await sb
      .from("product_chats")
      .select("post_id, seller_id, buyer_id")
      .eq("community_messenger_room_id", roomId)
      .maybeSingle();
    const pcRow =
      pc && typeof pc === "object" ? (pc as { post_id?: unknown; seller_id?: unknown; buyer_id?: unknown }) : null;
    const postId = typeof pcRow?.post_id === "string" ? pcRow.post_id.trim() : "";
    const sellerId = typeof pcRow?.seller_id === "string" ? pcRow.seller_id.trim() : "";
    const buyerId = typeof pcRow?.buyer_id === "string" ? pcRow.buyer_id.trim() : "";
    if (postId && sellerId && buyerId) {
      const targetId = buildTradeTargetId(postId, sellerId, buyerId);
      await runWithConcurrencyLimit(recipientIds, MESSENGER_TARGET_BUMP_PARALLEL_CONCURRENCY, (uid) =>
        bumpNotificationTarget(sb, {
          userId: uid,
          targetType: "trade",
          targetId,
          scope: "consumer",
          actorUserId: fromUserId,
          roomId,
          _t5: t5,
        })
      );
    }
  } else if (kind === "delivery") {
    await runWithConcurrencyLimit(recipientIds, MESSENGER_TARGET_BUMP_PARALLEL_CONCURRENCY, (uid) =>
      bumpDeliveryTargetForRecipient(sb, { userId: uid, roomId, orderCtx, directKey })
    );
  } else {
    await runWithConcurrencyLimit(recipientIds, MESSENGER_TARGET_BUMP_PARALLEL_CONCURRENCY, (uid) =>
      bumpChatRoomTargetFromMessengerParticipant(sb, {
        userId: uid,
        roomId,
        isOwnerOrderChat: false,
        storeId: null,
        _t5: t5,
      })
    );
  }
  if (t5 && spanT5) spanT5(t5, "TB_bump_writes_ms", writesT0);
  return { roomType, kind, directKey, recipientIds };
}
