/**
 * 채팅 Admin R1 (B · C-1) — 거래 레거시 방(`chat_rooms.id` / `product_chats.id`) → 사용자 앱이 쓰는 CM 방 해석.
 *
 * 조회 전용 (방 생성·참여·FK 보정 없음). 사용자 측 ensure 경로와 같은 키를 쓴다:
 *  1) `product_chats.community_messenger_room_id` (ensureMessengerRoomIdForItemTrade 원장 FK)
 *  2) `chat_rooms.community_messenger_room_id` (syncChatRoomMessengerLink)
 *  3) `direct_key = trade_item:{chat_rooms.id}` → `trade_pc:{product_chats.id}` (ensureCommunityMessengerDirectRoom)
 *  4) `domain_identity_key = trade:{item}:{seller}:{buyer}` (tradeRoomIdentity)
 * FK 가 일반 친구 DM·그룹·주문 방을 가리키면(오염) 재사용하지 않는다 — isTradeCapableCommunityMessengerRoom 과 같은 규칙.
 *
 * sb 는 서버 호출부가 주입 (service role). 클라이언트에서 import 금지 — 타입만 허용.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tradeRoomIdentity } from "@/lib/chat-domain/room-identity";
import { chunkIds } from "@/lib/chats/chat-list-limits";
import {
  isMessengerCommerceDirectKey,
  isMessengerGeneralFriendDirectKey,
} from "@/lib/community-messenger/messenger-room-domain";

export type TradeMessengerRoomSource =
  | "product_chat_fk"
  | "chat_room_fk"
  | "direct_key_trade_item"
  | "direct_key_trade_pc"
  | "domain_identity";

export type TradeLegacyRoomRefs = {
  chatRoomId: string | null;
  productChatId: string | null;
  chatRoomFk: string | null;
  productChatFk: string | null;
  itemId: string | null;
  sellerId: string | null;
  buyerId: string | null;
};

export type TradeMessengerCandidateRow = {
  id?: unknown;
  direct_key?: unknown;
  chat_domain?: unknown;
  domain_identity_key?: unknown;
};

export type TradeMessengerRoomResolution = TradeLegacyRoomRefs & {
  legacyKind: "chat_room" | "product_chat" | null;
  messengerRoomId: string | null;
  source: TradeMessengerRoomSource | null;
};

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** isTradeCapableCommunityMessengerRoom 과 같은 판정 (순수). */
export function isTradeCapableMessengerRow(row: TradeMessengerCandidateRow): boolean {
  const domain = s(row.chat_domain);
  if (domain === "trade") return true;
  if (domain === "general_direct" || domain === "group" || domain === "store_order") return false;
  const dk = s(row.direct_key);
  if (isMessengerGeneralFriendDirectKey(dk)) return false;
  return isMessengerCommerceDirectKey(dk) && (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:"));
}

export function tradeMessengerDirectKeys(refs: Pick<TradeLegacyRoomRefs, "chatRoomId" | "productChatId">): string[] {
  const keys: string[] = [];
  if (refs.chatRoomId) keys.push(`trade_item:${refs.chatRoomId}`);
  if (refs.productChatId) keys.push(`trade_pc:${refs.productChatId}`);
  return keys;
}

export function tradeMessengerIdentityKey(
  refs: Pick<TradeLegacyRoomRefs, "itemId" | "sellerId" | "buyerId">
): string | null {
  if (!refs.itemId || !refs.sellerId || !refs.buyerId) return null;
  try {
    return tradeRoomIdentity({ itemId: refs.itemId, sellerId: refs.sellerId, buyerId: refs.buyerId }).identityKey;
  } catch {
    return null;
  }
}

/** Pure: 후보 CM 행 중 사용자 앱과 같은 방을 고른다 (우선순위는 파일 머리 주석 순서). */
export function pickTradeMessengerRoom(
  refs: TradeLegacyRoomRefs,
  rows: readonly TradeMessengerCandidateRow[]
): { messengerRoomId: string; source: TradeMessengerRoomSource } | null {
  const usable = rows.filter((r) => s(r.id) && isTradeCapableMessengerRow(r));
  const byId = (id: string | null) => (id ? usable.find((r) => s(r.id) === id) : undefined);
  const pcFk = byId(refs.productChatFk);
  if (pcFk) return { messengerRoomId: s(pcFk.id), source: "product_chat_fk" };
  const crFk = byId(refs.chatRoomFk);
  if (crFk) return { messengerRoomId: s(crFk.id), source: "chat_room_fk" };
  if (refs.chatRoomId) {
    const hit = usable.find((r) => s(r.direct_key) === `trade_item:${refs.chatRoomId}`);
    if (hit) return { messengerRoomId: s(hit.id), source: "direct_key_trade_item" };
  }
  if (refs.productChatId) {
    const hit = usable.find((r) => s(r.direct_key) === `trade_pc:${refs.productChatId}`);
    if (hit) return { messengerRoomId: s(hit.id), source: "direct_key_trade_pc" };
  }
  const identity = tradeMessengerIdentityKey(refs);
  if (identity) {
    const hit = usable.find((r) => s(r.domain_identity_key) === identity);
    if (hit) return { messengerRoomId: s(hit.id), source: "domain_identity" };
  }
  return null;
}

const CM_CANDIDATE_SELECT = "id, direct_key, chat_domain, domain_identity_key";
const CM_CANDIDATE_CHUNK = 80;

async function loadCandidateRows(
  sb: SupabaseClient<any>,
  refsList: readonly TradeLegacyRoomRefs[]
): Promise<TradeMessengerCandidateRow[]> {
  const fkIds = [...new Set(refsList.flatMap((r) => [r.productChatFk, r.chatRoomFk]).filter((v): v is string => Boolean(v)))];
  const directKeys = [...new Set(refsList.flatMap((r) => tradeMessengerDirectKeys(r)))];
  const identityKeys = [
    ...new Set(refsList.map((r) => tradeMessengerIdentityKey(r)).filter((v): v is string => Boolean(v))),
  ];
  const queries: Array<PromiseLike<{ data: unknown }>> = [];
  for (const chunk of chunkIds(fkIds, CM_CANDIDATE_CHUNK)) {
    queries.push(sb.from("community_messenger_rooms").select(CM_CANDIDATE_SELECT).in("id", chunk));
  }
  for (const chunk of chunkIds(directKeys, CM_CANDIDATE_CHUNK)) {
    queries.push(
      sb
        .from("community_messenger_rooms")
        .select(CM_CANDIDATE_SELECT)
        .eq("room_type", "direct")
        .in("direct_key", chunk)
        .order("created_at", { ascending: true })
    );
  }
  for (const chunk of chunkIds(identityKeys, CM_CANDIDATE_CHUNK)) {
    queries.push(
      sb
        .from("community_messenger_rooms")
        .select(CM_CANDIDATE_SELECT)
        .eq("chat_domain", "trade")
        .in("domain_identity_key", chunk)
    );
  }
  const results = await Promise.all(queries);
  return results.flatMap((r) => (Array.isArray(r.data) ? (r.data as TradeMessengerCandidateRow[]) : []));
}

/** 거래 Admin 상세·조치 — 레거시 id 하나 → CM 방. 조회 전용. */
export async function resolveTradeMessengerRoomForAdmin(
  sb: SupabaseClient<any>,
  legacyId: string
): Promise<TradeMessengerRoomResolution> {
  const id = s(legacyId);
  const empty: TradeMessengerRoomResolution = {
    legacyKind: null,
    chatRoomId: null,
    productChatId: null,
    chatRoomFk: null,
    productChatFk: null,
    itemId: null,
    sellerId: null,
    buyerId: null,
    messengerRoomId: null,
    source: null,
  };
  if (!id) return empty;
  const refs: TradeMessengerRoomResolution = { ...empty };

  const { data: cr } = await sb
    .from("chat_rooms")
    .select("id, room_type, item_id, seller_id, buyer_id, community_messenger_room_id")
    .eq("id", id)
    .maybeSingle();
  const crRow = cr as Record<string, unknown> | null;
  if (crRow && s(crRow.room_type) === "item_trade") {
    refs.legacyKind = "chat_room";
    refs.chatRoomId = id;
    refs.chatRoomFk = s(crRow.community_messenger_room_id) || null;
    refs.itemId = s(crRow.item_id) || null;
    refs.sellerId = s(crRow.seller_id) || null;
    refs.buyerId = s(crRow.buyer_id) || null;
    if (refs.itemId && refs.sellerId && refs.buyerId) {
      const { data: pc } = await sb
        .from("product_chats")
        .select("id, community_messenger_room_id")
        .eq("post_id", refs.itemId)
        .eq("seller_id", refs.sellerId)
        .eq("buyer_id", refs.buyerId)
        .limit(1)
        .maybeSingle();
      const pcRow = pc as Record<string, unknown> | null;
      refs.productChatId = s(pcRow?.id) || null;
      refs.productChatFk = s(pcRow?.community_messenger_room_id) || null;
    }
  } else {
    const { data: pc } = await sb
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id, community_messenger_room_id")
      .eq("id", id)
      .maybeSingle();
    const pcRow = pc as Record<string, unknown> | null;
    if (!pcRow) return empty;
    refs.legacyKind = "product_chat";
    refs.productChatId = id;
    refs.productChatFk = s(pcRow.community_messenger_room_id) || null;
    refs.itemId = s(pcRow.post_id) || null;
    refs.sellerId = s(pcRow.seller_id) || null;
    refs.buyerId = s(pcRow.buyer_id) || null;
    if (refs.itemId && refs.sellerId && refs.buyerId) {
      const { data: linked } = await sb
        .from("chat_rooms")
        .select("id, community_messenger_room_id")
        .eq("room_type", "item_trade")
        .eq("item_id", refs.itemId)
        .eq("seller_id", refs.sellerId)
        .eq("buyer_id", refs.buyerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const linkedRow = linked as Record<string, unknown> | null;
      refs.chatRoomId = s(linkedRow?.id) || null;
      refs.chatRoomFk = s(linkedRow?.community_messenger_room_id) || null;
    }
  }

  const rows = await loadCandidateRows(sb, [refs]);
  const picked = pickTradeMessengerRoom(refs, rows);
  return picked ? { ...refs, ...picked } : refs;
}

/**
 * 목록용 배치 해석 — 행마다 FK·direct_key 만 사용 (identity 는 item/seller/buyer 가 있으면 함께).
 * 반환: key(행 식별자) → CM room id.
 */
export async function resolveTradeMessengerRoomIdsBatch(
  sb: SupabaseClient<any>,
  rows: ReadonlyArray<{ key: string; refs: TradeLegacyRoomRefs }>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!rows.length) return out;
  const candidates = await loadCandidateRows(
    sb,
    rows.map((r) => r.refs)
  );
  for (const row of rows) {
    const picked = pickTradeMessengerRoom(row.refs, candidates);
    if (picked) out.set(row.key, picked.messengerRoomId);
  }
  return out;
}

export function emptyTradeLegacyRoomRefs(partial: Partial<TradeLegacyRoomRefs>): TradeLegacyRoomRefs {
  return {
    chatRoomId: partial.chatRoomId ?? null,
    productChatId: partial.productChatId ?? null,
    chatRoomFk: partial.chatRoomFk ?? null,
    productChatFk: partial.productChatFk ?? null,
    itemId: partial.itemId ?? null,
    sellerId: partial.sellerId ?? null,
    buyerId: partial.buyerId ?? null,
  };
}
