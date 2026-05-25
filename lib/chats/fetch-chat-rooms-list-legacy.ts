/**
 * Legacy multi-wave chat rooms list builder — temporary fallback only (CR1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNicknamesForUserIds, postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { fetchPostRowsForChatIn } from "@/lib/chats/post-select-compat";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT, chunkIds } from "@/lib/chats/chat-list-limits";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import {
  assembleChatRoomsList,
  buildIdentityMapFromProfiles,
  enrichAuthorNicknamesInPostMap,
  parseParticipantRows,
  type EffectiveListSegment,
} from "@/lib/chats/chat-rooms-list-core";
import {
  ingestProductChatCompletionRow,
  type TradeHubCompletionTimestamps,
} from "@/lib/chats/trade-hub-completed-list-expiry";
import { auditLegacyFallbackUsage } from "@/lib/ops/legacy-fallback-usage-audit";
import type { ChatRoom } from "@/lib/types/chat";

const CHAT_ROOMS_LIST_SELECT =
  "id, room_type, item_id, seller_id, buyer_id, meeting_id, last_message_id, last_message_at, last_message_preview, created_at, trade_status, initiator_id, peer_id, related_post_id, related_comment_id, related_group_id, related_business_id, context_type, store_order_id, community_messenger_room_id";

const PRODUCT_CHATS_LIST_SELECT = `
      id,
      post_id,
      seller_id,
      buyer_id,
      last_message_at,
      last_message_preview,
      unread_count_seller,
      unread_count_buyer,
      created_at,
      seller_completed_at,
      buyer_confirmed_at,
      community_messenger_room_id
    `;

async function fetchParticipantChatRoomsChunked(
  sbAny: SupabaseClient<any>,
  roomIds: string[],
  segment: EffectiveListSegment
): Promise<Record<string, unknown>[]> {
  if (roomIds.length === 0) return [];
  const chunks = chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE);
  const parts = await Promise.all(
    chunks.map(async (ids) => {
      let q = sbAny.from("chat_rooms").select(CHAT_ROOMS_LIST_SELECT).in("id", ids);
      if (segment === "trade") q = q.eq("room_type", "item_trade");
      else if (segment === "order") q = q.eq("room_type", "store_order");
      else q = q.in("room_type", ["item_trade", "store_order"]);
      const { data } = await q;
      return (data ?? []) as Record<string, unknown>[];
    })
  );
  return parts.flat();
}

export type ChatRoomsListLegacyResult = {
  rooms: ChatRoom[];
  dbMs: number;
  waveCount: number;
  queryWave2Ms: number;
};

export async function buildChatRoomsListLegacy(
  sbAny: SupabaseClient<any>,
  userId: string,
  segment: EffectiveListSegment
): Promise<{ ok: true; result: ChatRoomsListLegacyResult } | { ok: false; error: string }> {
  auditLegacyFallbackUsage({
    route: "/api/chat/rooms",
    fallback_branch: "legacy_multi_wave_aggregate",
    reason: "unified_rpc_unavailable",
  });
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot deploy probe
    console.warn("[chat-rooms-snapshot-fallback]", {
      user_id: userId,
      segment,
      reason: "unified_rpc_unavailable",
    });
  }

  const db0 = performance.now();
  const needProductChats = segment === "all" || segment === "trade";

  const [pcRes, partRes] = await Promise.all([
    needProductChats
      ? sbAny
          .from("product_chats")
          .select(PRODUCT_CHATS_LIST_SELECT)
          .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    sbAny
      .from("chat_room_participants")
      .select("room_id, unread_count, last_read_message_id, left_at, is_active, hidden")
      .eq("user_id", userId)
      .eq("hidden", false),
  ]);

  if (pcRes.error) return { ok: false, error: pcRes.error.message };
  if (partRes.error) return { ok: false, error: partRes.error.message };

  const wave1Ms = performance.now() - db0;
  const partByRoom = parseParticipantRows(partRes.data ?? []);
  const roomIdsEarly = [...partByRoom.keys()];

  const pcRows = (pcRes.data ?? []) as ChatRoomsListAssemblePcRow[];
  const completionByTradeTriple = new Map<string, TradeHubCompletionTimestamps>();
  for (const r of pcRows) {
    ingestProductChatCompletionRow(completionByTradeTriple, r);
  }

  let allCrRows: Record<string, unknown>[] = [];
  try {
    allCrRows = await fetchParticipantChatRoomsChunked(sbAny, roomIdsEarly, segment);
  } catch {
    allCrRows = [];
  }

  const wave2Start = performance.now();
  const crTradeRows = allCrRows.filter((r) => String(r.room_type) === "item_trade") as ChatRoomsListAssembleCrTradeRow[];
  const soRoomRows = allCrRows.filter((r) => String(r.room_type) === "store_order") as ChatRoomsListAssembleSoRow[];

  const postIdsFromPc = [...new Set(pcRows.map((r) => r.post_id))];
  const itemIds = [...new Set(crTradeRows.map((r) => r.item_id).filter(Boolean))] as string[];
  const allPostIds = [...new Set([...postIdsFromPc, ...itemIds])];

  const tradeLastMsgIds = [
    ...new Set(
      crTradeRows
        .map((r) => r.last_message_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const tradeLastSenderByMsgId = new Map<string, string>();
  if (tradeLastMsgIds.length > 0) {
    const { data: lastMsgRows } = await sbAny.from("chat_messages").select("id, sender_id").in("id", tradeLastMsgIds);
    for (const row of lastMsgRows ?? []) {
      const id = (row as { id?: string }).id;
      const sid = (row as { sender_id?: string }).sender_id;
      if (typeof id === "string" && typeof sid === "string") tradeLastSenderByMsgId.set(id, sid);
    }
  }

  const itemIdsForCompletion = [...new Set(crTradeRows.map((r) => r.item_id).filter(Boolean))] as string[];
  if (itemIdsForCompletion.length > 0 && (segment === "trade" || segment === "all")) {
    const idChunks = chunkIds(itemIdsForCompletion, CHAT_ROOM_ID_IN_CHUNK_SIZE);
    const extraRows = await Promise.all(
      idChunks.map(async (ids) => {
        const { data } = await sbAny
          .from("product_chats")
          .select("post_id, seller_id, buyer_id, seller_completed_at, buyer_confirmed_at")
          .in("post_id", ids);
        return (data ?? []) as {
          post_id: string;
          seller_id: string;
          buyer_id: string;
          seller_completed_at?: string | null;
          buyer_confirmed_at?: string | null;
        }[];
      })
    );
    for (const row of extraRows.flat()) {
      ingestProductChatCompletionRow(completionByTradeTriple, row);
    }
  }

  const partnerIdsFromPc = [...new Set(pcRows.map((r) => (r.seller_id === userId ? r.buyer_id : r.seller_id)))];
  const crPartnerIds = [
    ...new Set(crTradeRows.flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id !== userId)),
  ];
  const partnerIdsSo =
    soRoomRows.length > 0
      ? [
          ...new Set(
            soRoomRows.flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id && id !== userId) as string[]
          ),
        ]
      : [];
  const partnerIdsEarly = [...new Set([...partnerIdsFromPc, ...crPartnerIds, ...partnerIdsSo])];

  const [posts, nicknameByUserId] = await Promise.all([
    allPostIds.length ? fetchPostRowsForChatIn(sbAny, allPostIds) : Promise.resolve([]),
    partnerIdsEarly.length ? fetchNicknamesForUserIds(sbAny, partnerIdsEarly) : Promise.resolve(new Map<string, string>()),
  ]);

  const profiles0 = performance.now();
  let profiles: Record<string, unknown>[] = [];
  let testUsers: Record<string, unknown>[] = [];
  if (partnerIdsEarly.length > 0) {
    const { data: profs } = await sbAny
      .from("profiles")
      .select("id, display_name, username, nickname")
      .in("id", partnerIdsEarly);
    profiles = (profs ?? []) as Record<string, unknown>[];
    const identityByUserId = buildIdentityMapFromProfiles(profiles, []);
    const missing = partnerIdsEarly.filter((id) => !identityByUserId.has(id));
    if (missing.length > 0) {
      const { data: tus } = await sbAny.from("test_users").select("id, display_name, username").in("id", missing);
      testUsers = (tus ?? []) as Record<string, unknown>[];
    }
  }
  const profilesMs = performance.now() - profiles0;

  const postMap = new Map((posts ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));
  const authorIdsFromPosts = [
    ...new Set(
      (posts ?? [])
        .map((p: Record<string, unknown>) => postAuthorUserId(p))
        .filter((id): id is string => !!id)
    ),
  ];
  const authorNickMissing = authorIdsFromPosts.filter((id) => !nicknameByUserId.has(id));
  if (authorNickMissing.length > 0) {
    const more = await fetchNicknamesForUserIds(sbAny, authorNickMissing);
    for (const [k, v] of more) nicknameByUserId.set(k, v);
  }
  enrichAuthorNicknamesInPostMap(postMap, nicknameByUserId);

  let orderMap = new Map<
    string,
    { id: string; order_no: string; store_id: string; order_status?: string; community_messenger_room_id?: string | null }
  >();
  let storeMap = new Map<string, { id: string; store_name: string }>();
  const userLang = await loadNotificationUserLanguage(sbAny, userId);
  if (soRoomRows.length > 0) {
    const oids = [...new Set(soRoomRows.map((x) => x.store_order_id).filter(Boolean))] as string[];
    const { data: orows } = oids.length
      ? await sbAny
          .from("store_orders")
          .select("id, order_no, store_id, order_status, community_messenger_room_id")
          .in("id", oids)
      : { data: [] as Record<string, unknown>[] };
    const stids = [...new Set((orows ?? []).map((o) => (o as { store_id: string }).store_id))];
    const { data: sts } = stids.length
      ? await sbAny.from("stores").select("id, store_name").in("id", stids)
      : { data: [] as Record<string, unknown>[] };
    orderMap = new Map(
      (orows ?? []).map((o) => {
        const row = o as {
          id: string;
          order_no: string;
          store_id: string;
          order_status?: string;
          community_messenger_room_id?: string | null;
        };
        return [row.id, row];
      })
    );
    storeMap = new Map(
      (sts ?? []).map((s) => {
        const row = s as { id: string; store_name: string };
        return [row.id, row];
      })
    );
  }

  const wave2Ms = performance.now() - wave2Start + profilesMs;
  const dbMs = performance.now() - db0;

  const rooms = assembleChatRoomsList({
    userId,
    segment,
    pcRows,
    partByRoom,
    crTradeRows,
    soRoomRows,
    postMap,
    nicknameByUserId,
    identityByUserId: buildIdentityMapFromProfiles(profiles, testUsers),
    tradeLastSenderByMsgId,
    completionByTradeTriple,
    orderMap,
    storeMap,
    userLang,
  });

  return {
    ok: true,
    result: {
      rooms,
      dbMs: Math.round(dbMs),
      waveCount: wave2Ms > 0 ? 7 : 2,
      queryWave2Ms: Math.round(wave2Ms),
    },
  };
}

type ChatRoomsListAssemblePcRow = {
  id: string;
  post_id: string;
  seller_id: string;
  buyer_id: string;
  community_messenger_room_id?: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_seller: number;
  unread_count_buyer: number;
  created_at: string;
  seller_completed_at?: string | null;
  buyer_confirmed_at?: string | null;
};

type ChatRoomsListAssembleCrTradeRow = {
  id: string;
  item_id: string | null;
  seller_id: string;
  buyer_id: string;
  last_message_id?: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  trade_status?: string;
  community_messenger_room_id?: string | null;
};

type ChatRoomsListAssembleSoRow = {
  id: string;
  seller_id: string;
  buyer_id: string;
  store_order_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  community_messenger_room_id?: string | null;
};
