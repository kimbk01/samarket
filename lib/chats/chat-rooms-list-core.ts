/**
 * Trade chat rooms list — shared dedupe/filter/assemble (CR1).
 */
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import {
  enrichPostWithAuthorNickname,
  postAuthorUserId,
} from "@/lib/chats/resolve-author-nickname";
import { tradeListUnreadHintFromCursor } from "@/lib/chats/server/trade-list-unread-hint";
import {
  ingestProductChatCompletionRow,
  shouldOmitTradeRoomFromChatHubList,
  type TradeHubCompletionTimestamps,
} from "@/lib/chats/trade-hub-completed-list-expiry";
import { participantRowActive } from "@/lib/chat/user-chat-unread-parts";
import { translate } from "@/lib/i18n/messages";
import { normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import type { ChatRoom, GeneralChatMeta } from "@/lib/types/chat";
import {
  memberDisplayLabelFromRow,
  resolvePublicMemberIdentity,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";

export type ChatRoomListRow = ChatRoom;
export type EffectiveListSegment = "trade" | "order" | "all";

export function isStoreOrderRoomRow(r: ChatRoomListRow): boolean {
  return r.generalChat?.kind === "store_order";
}

export function filterRoomsByListSegment(rows: ChatRoomListRow[], segment: EffectiveListSegment): ChatRoomListRow[] {
  if (segment === "order") return rows.filter(isStoreOrderRoomRow);
  if (segment === "trade") return rows.filter((r) => r.generalChat == null);
  return rows;
}

function tradeTripleKey(r: ChatRoomListRow): string | null {
  const pid = (r.productId ?? "").trim();
  const bid = (r.buyerId ?? "").trim();
  const sid = (r.sellerId ?? "").trim();
  if (!pid || !bid || !sid) return null;
  return `${pid}:${bid}:${sid}`;
}

function mergeLegacyProductChatIntoItemTradeRow(pc: ChatRoomListRow, cr: ChatRoomListRow): ChatRoomListRow {
  const tCr = new Date(cr.lastMessageAt).getTime();
  const tPc = new Date(pc.lastMessageAt).getTime();
  const newer = tPc > tCr ? pc : cr;
  const mergedUnread =
    cr.source === "chat_room" ? (cr.unreadCount ?? 0) : Math.max(cr.unreadCount ?? 0, pc.unreadCount ?? 0);
  const cmLink =
    typeof cr.communityMessengerRoomId === "string" && cr.communityMessengerRoomId.trim()
      ? cr.communityMessengerRoomId.trim()
      : typeof pc.communityMessengerRoomId === "string" && pc.communityMessengerRoomId.trim()
        ? pc.communityMessengerRoomId.trim()
        : undefined;
  return {
    ...cr,
    ...(cmLink ? { communityMessengerRoomId: cmLink } : null),
    lastMessageAt: newer.lastMessageAt,
    lastMessage: newer.lastMessage,
    unreadCount: mergedUnread,
    tradeStatus: newer.tradeStatus ?? cr.tradeStatus ?? pc.tradeStatus,
  };
}

export function dedupeTradeChatRoomRows(rows: ChatRoomListRow[]): ChatRoomListRow[] {
  const general = rows.filter((r) => r.generalChat != null);
  const trade = rows.filter((r) => r.generalChat == null);
  const loose: ChatRoomListRow[] = [];
  const crByTriple = new Map<string, ChatRoomListRow[]>();
  const pcByTriple = new Map<string, ChatRoomListRow>();

  for (const r of trade) {
    const tk = tradeTripleKey(r);
    if (!tk) {
      loose.push(r);
      continue;
    }
    if (r.source === "chat_room") {
      const arr = crByTriple.get(tk) ?? [];
      arr.push(r);
      crByTriple.set(tk, arr);
    } else {
      pcByTriple.set(tk, r);
    }
  }

  const out: ChatRoomListRow[] = [...loose];
  for (const [, crsRaw] of crByTriple) {
    const crs = [...crsRaw].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
    const tk = tradeTripleKey(crs[0]!);
    const pc = tk ? pcByTriple.get(tk) : undefined;
    if (tk) pcByTriple.delete(tk);
    if (crs.length === 0) continue;
    if (crs.length === 1) {
      out.push(pc ? mergeLegacyProductChatIntoItemTradeRow(pc, crs[0]) : crs[0]);
      continue;
    }
    const newest = crs[0];
    out.push(pc ? mergeLegacyProductChatIntoItemTradeRow(pc, newest) : newest);
    /* 동일 triple 다중 item_trade — 최신 1행만(레거시 유니크 위반 잔여) */
  }
  for (const pc of pcByTriple.values()) out.push(pc);
  return [...general, ...out];
}

export type ChatRoomsListAssembleInput = {
  userId: string;
  segment: EffectiveListSegment;
  pcRows: Array<{
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
  }>;
  partByRoom: Map<string, { unread_count?: number; last_read_message_id?: string | null }>;
  crTradeRows: Array<{
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
  }>;
  soRoomRows: Array<{
    id: string;
    seller_id: string;
    buyer_id: string;
    store_order_id: string | null;
    last_message_at: string | null;
    last_message_preview: string | null;
    created_at: string;
    community_messenger_room_id?: string | null;
  }>;
  postMap: Map<string, Record<string, unknown>>;
  nicknameByUserId: Map<string, string>;
  identityByUserId: Map<string, { username: string | null; displayName: string | null }>;
  tradeLastSenderByMsgId: Map<string, string>;
  completionByTradeTriple: Map<string, TradeHubCompletionTimestamps>;
  orderMap: Map<
    string,
    { id: string; order_no: string; store_id: string; order_status?: string; community_messenger_room_id?: string | null }
  >;
  storeMap: Map<string, { id: string; store_name: string }>;
  userLang: AppLanguageCode;
  nowMs?: number;
};

export function assembleChatRoomsList(input: ChatRoomsListAssembleInput): ChatRoomListRow[] {
  const { userId, segment } = input;
  const nowMs = input.nowMs ?? Date.now();
  const postMap = input.postMap;

  const listFromProductChats: ChatRoomListRow[] = input.pcRows.map((r) => {
    const post = postMap.get(r.post_id);
    const amISeller = r.seller_id === userId;
    const unreadCount = amISeller ? (r.unread_count_seller ?? 0) : (r.unread_count_buyer ?? 0);
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    const partnerNickname = input.nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8);
    const ident = input.identityByUserId.get(partnerId);
    return {
      id: r.id,
      productId: r.post_id,
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      partnerUsername: ident?.username ?? null,
      partnerDisplayName: ident?.displayName ?? null,
      partnerNickname,
      partnerAvatar: "",
      lastMessage: r.last_message_preview ?? "",
      lastMessageAt: r.last_message_at ?? r.created_at,
      unreadCount,
      product: chatProductSummaryFromPostRow(
        enrichPostWithAuthorNickname(post, input.nicknameByUserId),
        r.post_id
      ),
      source: "product_chat",
      chatDomain: "trade",
      roomTitle: partnerNickname,
      roomSubtitle: translate(
        input.userLang,
        amISeller ? "nav_trade_partner_buyer" : "nav_trade_partner_seller_of_post"
      ),
      ...(typeof r.community_messenger_room_id === "string" && r.community_messenger_room_id.trim()
        ? { communityMessengerRoomId: r.community_messenger_room_id.trim() }
        : null),
    };
  });

  const listFromChatRooms: ChatRoomListRow[] = input.crTradeRows.map((r) => {
    const post = r.item_id ? postMap.get(r.item_id) : undefined;
    const amISeller = r.seller_id === userId;
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    const part = input.partByRoom.get(r.id);
    const lastMid = r.last_message_id ?? null;
    const lastSender = lastMid ? input.tradeLastSenderByMsgId.get(lastMid) ?? null : null;
    const lastMsgResolvable = !lastMid || input.tradeLastSenderByMsgId.has(lastMid);
    const unreadCount = tradeListUnreadHintFromCursor({
      viewerUserId: userId,
      lastMessageId: lastMid,
      lastMessageSenderId: lastSender,
      lastReadMessageId: part?.last_read_message_id ?? null,
      lastMessageRowResolvable: lastMsgResolvable,
    });
    const ident = input.identityByUserId.get(partnerId);
    return {
      id: r.id,
      productId: r.item_id ?? "",
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      partnerUsername: ident?.username ?? null,
      partnerDisplayName: ident?.displayName ?? null,
      partnerNickname: input.nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8),
      partnerAvatar: "",
      lastMessage: r.last_message_preview ?? "",
      lastMessageAt: r.last_message_at ?? r.created_at,
      unreadCount,
      tradeStatus: r.trade_status ?? "inquiry",
      product: chatProductSummaryFromPostRow(
        enrichPostWithAuthorNickname(post, input.nicknameByUserId),
        r.item_id ?? ""
      ),
      source: "chat_room" as const,
      chatDomain: "trade",
      roomTitle: input.nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8),
      roomSubtitle: translate(
        input.userLang,
        amISeller ? "nav_trade_partner_buyer" : "nav_trade_partner_seller_of_post"
      ),
      ...(typeof r.community_messenger_room_id === "string" && r.community_messenger_room_id.trim()
        ? { communityMessengerRoomId: r.community_messenger_room_id.trim() }
        : null),
    };
  });

  const listFromStoreOrderRooms: ChatRoomListRow[] = input.soRoomRows.map((r) => {
    const amISeller = r.seller_id === userId;
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    const ident = input.identityByUserId.get(partnerId);
    const part = input.partByRoom.get(r.id);
    const unreadCount = part?.unread_count ?? 0;
    const oid = r.store_order_id ?? "";
    const ord = oid ? input.orderMap.get(oid) : undefined;
    const st = ord ? input.storeMap.get(ord.store_id) : undefined;
    const statusLabel =
      ord && typeof ord.order_status === "string"
        ? buyerOrderStatusLabel(ord.order_status, input.userLang)
        : "";
    const title =
      ord && st
        ? translate(input.userLang, "store_messenger_order_title", {
            store: st.store_name,
            orderNo: ord.order_no,
          })
        : translate(input.userLang, "store_messenger_delivery_order_title");
    const orderCmRoomId =
      typeof ord?.community_messenger_room_id === "string"
        ? (ord.community_messenger_room_id ?? "").trim()
        : "";
    const legacyCmRoomId =
      typeof r.community_messenger_room_id === "string" ? r.community_messenger_room_id.trim() : "";
    const cmRoomId = orderCmRoomId || legacyCmRoomId || null;
    const generalChat: GeneralChatMeta = {
      kind: "store_order",
      storeOrderId: r.store_order_id,
      relatedPostId: null,
      relatedCommentId: null,
      relatedGroupId: null,
      relatedBusinessId: null,
      contextType: null,
    };
    return {
      id: r.id,
      productId: oid || r.id,
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      partnerUsername: ident?.username ?? null,
      partnerDisplayName: ident?.displayName ?? null,
      partnerNickname: input.nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8),
      partnerAvatar: "",
      lastMessage: r.last_message_preview ?? "",
      lastMessageAt: r.last_message_at ?? r.created_at,
      unreadCount,
      product: chatProductSummaryFromPostRow({ title, status: "active" } as Record<string, unknown>, oid || r.id),
      source: "chat_room" as const,
      generalChat,
      chatDomain: "store_order" as const,
      communityMessengerRoomId: cmRoomId,
      roomTitle: title,
      roomSubtitle: statusLabel ? `주문 상태 · ${statusLabel}` : "배달채팅",
    };
  });

  const mergedRaw = [...listFromProductChats, ...listFromChatRooms, ...listFromStoreOrderRooms];
  const mergedDeduped = dedupeTradeChatRoomRows(mergedRaw);
  const mergedHubFiltered =
    segment === "order"
      ? mergedDeduped
      : mergedDeduped.filter(
          (room) =>
            !shouldOmitTradeRoomFromChatHubList({
              room: {
                generalChat: room.generalChat,
                productId: room.productId,
                buyerId: room.buyerId,
                sellerId: room.sellerId,
              },
              postByProductId: postMap,
              completionByTriple: input.completionByTradeTriple,
              nowMs,
            })
        );
  const merged = mergedHubFiltered.sort((a, b) => {
    const ta = new Date(a.lastMessageAt).getTime();
    const tb = new Date(b.lastMessageAt).getTime();
    return tb - ta;
  });
  return filterRoomsByListSegment(merged, segment);
}

export function buildNicknamesFromIdentityRows(
  profiles: Array<Record<string, unknown>>,
  testUsers: Array<Record<string, unknown>>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of profiles) {
    const id = String(p.id ?? "").trim();
    if (!id) continue;
    const name = memberDisplayLabelFromRow(p as MemberIdentityProfileFields, { userId: id });
    if (name) map.set(id, name);
  }
  for (const t of testUsers) {
    const id = String(t.id ?? "").trim();
    if (!id || map.has(id)) continue;
    const name = String(t.display_name ?? t.username ?? "").trim();
    if (name) map.set(id, name);
  }
  return map;
}

export function buildIdentityMapFromProfiles(
  profiles: Array<Record<string, unknown>>,
  testUsers: Array<Record<string, unknown>>
): Map<string, { username: string | null; displayName: string | null }> {
  const identityByUserId = new Map<string, { username: string | null; displayName: string | null }>();
  for (const row of profiles) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const identity = resolvePublicMemberIdentity(row as MemberIdentityProfileFields, { userId: id });
    identityByUserId.set(id, {
      username: identity?.dibayId ?? null,
      displayName: identity?.nickname ?? identity?.displayLabel ?? null,
    });
  }
  for (const row of testUsers) {
    const id = String(row.id ?? "").trim();
    if (!id || identityByUserId.has(id)) continue;
    identityByUserId.set(id, {
      username: typeof row.username === "string" ? row.username.trim() || null : null,
      displayName: typeof row.display_name === "string" ? row.display_name.trim() || null : null,
    });
  }
  return identityByUserId;
}

export function parseParticipantRows(raw: unknown[]): Map<string, { unread_count?: number; last_read_message_id?: string | null }> {
  const partRowsEarly = (
    raw as {
      room_id: string;
      unread_count?: number;
      last_read_message_id?: string | null;
      left_at?: string | null;
      is_active?: boolean | null;
      hidden?: boolean;
    }[]
  ).filter((p) => participantRowActive(p));
  return new Map(
    partRowsEarly.map((p) => [
      p.room_id,
      { unread_count: p.unread_count, last_read_message_id: p.last_read_message_id },
    ])
  );
}

export function ingestCompletionRows(
  rows: Array<{
    post_id: string;
    seller_id: string;
    buyer_id: string;
    seller_completed_at?: string | null;
    buyer_confirmed_at?: string | null;
  }>
): Map<string, TradeHubCompletionTimestamps> {
  const completionByTradeTriple = new Map<string, TradeHubCompletionTimestamps>();
  for (const r of rows) ingestProductChatCompletionRow(completionByTradeTriple, r);
  return completionByTradeTriple;
}

export function normalizeUserLang(raw: unknown): AppLanguageCode {
  return normalizeAppLanguage(raw);
}

export function enrichAuthorNicknamesInPostMap(
  postMap: Map<string, Record<string, unknown>>,
  nicknameByUserId: Map<string, string>
): void {
  for (const [pid, post] of postMap) {
    const aid = postAuthorUserId(post);
    const n = aid ? nicknameByUserId.get(aid)?.trim() : undefined;
    if (n && !String(post.author_nickname ?? "").trim()) {
      postMap.set(pid, { ...post, author_nickname: n });
    }
  }
}
