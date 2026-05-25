/**
 * CR1 chat rooms snapshot assembly — CPU-only from precomputed RPC payload.
 */
import {
  assembleChatRoomsList,
  buildIdentityMapFromProfiles,
  buildNicknamesFromIdentityRows,
  enrichAuthorNicknamesInPostMap,
  ingestCompletionRows,
  parseParticipantRows,
  type EffectiveListSegment,
} from "@/lib/chats/chat-rooms-list-core";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import type { ChatRoom } from "@/lib/types/chat";

export type ChatRoomsSnapshotPayloadJson = {
  ok?: boolean;
  error?: string;
  product_chats?: unknown[];
  participants?: unknown[];
  chat_rooms?: unknown[];
  last_message_senders?: unknown[];
  completion_product_chats?: unknown[];
  posts?: unknown[];
  profiles?: unknown[];
  test_users?: unknown[];
  store_orders?: unknown[];
  stores?: unknown[];
  user_lang?: string | null;
  rooms?: unknown[];
  unread_snapshot?: {
    participant_unread_total?: number;
    product_chat_unread_total?: number;
  };
  next_cursor?: string | null;
  snapshot_version?: number;
  list_limit?: number;
  updated_at?: string;
};

function asRecordArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
}

export function parseChatRoomsSnapshotRpcData(data: unknown): ChatRoomsSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as ChatRoomsSnapshotPayloadJson;
}

export function chatRoomsSnapshotGateFromPayload(
  payload: ChatRoomsSnapshotPayloadJson
): { ok: true } | { ok: false; error: string; status: number } {
  if (payload.ok === false) {
    const err = String(payload.error ?? "invalid_snapshot");
    return { ok: false, error: err, status: 500 };
  }
  if (payload.ok !== true) return { ok: false, error: "invalid_snapshot", status: 500 };
  return { ok: true };
}

export function assembleChatRoomsFromSnapshotPayload(
  userId: string,
  segment: EffectiveListSegment,
  payload: ChatRoomsSnapshotPayloadJson
): ChatRoom[] | null {
  const pcRows = asRecordArray(payload.product_chats).map((r) => ({
    id: String(r.id ?? ""),
    post_id: String(r.post_id ?? ""),
    seller_id: String(r.seller_id ?? ""),
    buyer_id: String(r.buyer_id ?? ""),
    community_messenger_room_id: r.community_messenger_room_id as string | null | undefined,
    last_message_at: (r.last_message_at as string | null) ?? null,
    last_message_preview: (r.last_message_preview as string | null) ?? null,
    unread_count_seller: Number(r.unread_count_seller ?? 0),
    unread_count_buyer: Number(r.unread_count_buyer ?? 0),
    created_at: String(r.created_at ?? ""),
    seller_completed_at: r.seller_completed_at as string | null | undefined,
    buyer_confirmed_at: r.buyer_confirmed_at as string | null | undefined,
  }));

  const partByRoom = parseParticipantRows(payload.participants ?? []);
  const crRows = asRecordArray(payload.chat_rooms);
  const crTradeRows = crRows
    .filter((r) => String(r.room_type) === "item_trade")
    .map((r) => ({
      id: String(r.id ?? ""),
      item_id: (r.item_id as string | null) ?? null,
      seller_id: String(r.seller_id ?? ""),
      buyer_id: String(r.buyer_id ?? ""),
      last_message_id: r.last_message_id as string | null | undefined,
      last_message_at: (r.last_message_at as string | null) ?? null,
      last_message_preview: (r.last_message_preview as string | null) ?? null,
      created_at: String(r.created_at ?? ""),
      trade_status: r.trade_status as string | undefined,
      community_messenger_room_id: r.community_messenger_room_id as string | null | undefined,
    }));

  const soRoomRows = crRows
    .filter((r) => String(r.room_type) === "store_order")
    .map((r) => ({
      id: String(r.id ?? ""),
      seller_id: String(r.seller_id ?? ""),
      buyer_id: String(r.buyer_id ?? ""),
      store_order_id: (r.store_order_id as string | null) ?? null,
      last_message_at: (r.last_message_at as string | null) ?? null,
      last_message_preview: (r.last_message_preview as string | null) ?? null,
      created_at: String(r.created_at ?? ""),
      community_messenger_room_id: r.community_messenger_room_id as string | null | undefined,
    }));

  const tradeLastSenderByMsgId = new Map<string, string>();
  for (const row of asRecordArray(payload.last_message_senders)) {
    const id = String(row.id ?? "").trim();
    const sid = String(row.sender_id ?? "").trim();
    if (id && sid) tradeLastSenderByMsgId.set(id, sid);
  }

  const completionByTradeTriple = ingestCompletionRows([
    ...pcRows,
    ...asRecordArray(payload.completion_product_chats).map((r) => ({
      post_id: String(r.post_id ?? ""),
      seller_id: String(r.seller_id ?? ""),
      buyer_id: String(r.buyer_id ?? ""),
      seller_completed_at: r.seller_completed_at as string | null | undefined,
      buyer_confirmed_at: r.buyer_confirmed_at as string | null | undefined,
    })),
  ]);

  const profiles = asRecordArray(payload.profiles);
  const testUsers = asRecordArray(payload.test_users);
  const nicknameByUserId = buildNicknamesFromIdentityRows(profiles, testUsers);
  const identityByUserId = buildIdentityMapFromProfiles(profiles, testUsers);

  const postMap = new Map(asRecordArray(payload.posts).map((p) => [String(p.id ?? ""), p]));
  enrichAuthorNicknamesInPostMap(postMap, nicknameByUserId);

  const orderMap = new Map(
    asRecordArray(payload.store_orders).map((o) => [
      String(o.id ?? ""),
      {
        id: String(o.id ?? ""),
        order_no: String(o.order_no ?? ""),
        store_id: String(o.store_id ?? ""),
        order_status: o.order_status as string | undefined,
        community_messenger_room_id: o.community_messenger_room_id as string | null | undefined,
      },
    ])
  );
  const storeMap = new Map(
    asRecordArray(payload.stores).map((s) => [
      String(s.id ?? ""),
      { id: String(s.id ?? ""), store_name: String(s.store_name ?? "") },
    ])
  );

  const userLang = normalizeAppLanguage(payload.user_lang);

  return assembleChatRoomsList({
    userId,
    segment,
    pcRows,
    partByRoom,
    crTradeRows,
    soRoomRows,
    postMap,
    nicknameByUserId,
    identityByUserId,
    tradeLastSenderByMsgId,
    completionByTradeTriple,
    orderMap,
    storeMap,
    userLang,
  });
}
