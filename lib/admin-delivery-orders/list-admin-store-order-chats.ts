import { resolveRoomLastMessageForViewer } from "@/lib/community-messenger/call-stub-room-tip";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { storeOrderRoomIdentity } from "@/lib/chat-domain/room-identity";
import { lookupStoreOrderMessengerRoomReadOnly } from "@/lib/admin-delivery-orders/store-order-room-lookup";
import { ADMIN_STORE_ORDER_CHAT_LIST_LIMIT } from "@/lib/admin-delivery-orders/admin-order-chat-limits";

export type AdminStoreOrderChatListRow = {
  orderId: string;
  orderNo: string;
  roomId: string;
  storeId: string;
  storeLabel: string;
  customerUserId: string;
  customerLabel: string;
  orderStatus: string;
  domainIdentityKey: string;
  lastMessage: string;
  lastMessageAt: string;
  /** R1-B C-7: linked = 주문 FK, fallback = 주문 키로 찾은 방 (읽기 전용) */
  roomSource: "linked" | "fallback";
};

/** RPC `admin_store_order_chats_page` 행 (DB 가 FK 연결 방 + 주문 키로 찾은 방을 합쳐 정렬·페이지). */
type ChatPageRpcRow = {
  order_id?: string | null;
  order_no?: string | null;
  room_id?: string | null;
  room_source?: string | null;
  store_id?: string | null;
  store_name?: string | null;
  buyer_user_id?: string | null;
  buyer_nickname?: string | null;
  buyer_username?: string | null;
  order_status?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  order_updated_at?: string | null;
  order_created_at?: string | null;
};

export type AdminStoreOrderChatPage = {
  rows: AdminStoreOrderChatListRow[];
  /** 검색 조건에 맞는 전체 주문 채팅 수 (DB count — 상한 없음). */
  total: number;
  limit: number;
  offset: number;
};

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapChatPageRow(r: ChatPageRpcRow): AdminStoreOrderChatListRow | null {
  const orderId = trim(r.order_id);
  const roomId = trim(r.room_id);
  if (!orderId || !roomId) return null;
  const storeId = trim(r.store_id);
  const customerUserId = trim(r.buyer_user_id);
  return {
    orderId,
    orderNo: trim(r.order_no),
    roomId,
    storeId,
    storeLabel: storeId ? trim(r.store_name) || storeId : "-",
    customerUserId,
    customerLabel: customerUserId
      ? trim(r.buyer_nickname) || trim(r.buyer_username) || `회원 ${customerUserId.replace(/-/g, "").slice(0, 8)}`
      : "-",
    orderStatus: trim(r.order_status) || "-",
    domainIdentityKey: storeOrderRoomIdentity(orderId).identityKey,
    lastMessage: trim(resolveRoomLastMessageForViewer(r.last_message, null)) || "-",
    lastMessageAt: trim(r.last_message_at) || trim(r.order_updated_at) || trim(r.order_created_at) || "",
    roomSource: r.room_source === "fallback" ? "fallback" : "linked",
  };
}

/**
 * Lookup-only Admin reader (R7 서버 페이지네이션): store_orders 의 community_messenger_room_id(FK) 방과
 * (R1-B C-7) FK 가 비었지만 주문 키(`store_order:{id}` identity / direct_key, legacy `trade_order:{id}`)로 찾은 방을
 * DB(`admin_store_order_chats_page`)에서 한 번에 합쳐 검색·정렬(최근 메시지 desc, 주문 id desc)·limit/offset·정확한 total.
 * 방 생성·FK 보정·unread 읽기/쓰기 없음. 한 페이지 최대 ADMIN_STORE_ORDER_CHAT_LIST_LIMIT 건 (전체 결과는 total + offset).
 */
export async function listAdminStoreOrderChats(
  opts: { limit?: number; offset?: number; q?: string } = {}
): Promise<AdminStoreOrderChatPage> {
  const sb = getSupabaseServer();
  const limit = Math.min(
    Math.max(1, Math.floor(Number(opts.limit)) || 20),
    ADMIN_STORE_ORDER_CHAT_LIST_LIMIT
  );
  const offset = Math.max(0, Math.floor(Number(opts.offset)) || 0);
  const q = trim(opts.q);
  const { data, error } = await (sb as any).rpc("admin_store_order_chats_page", {
    p_q: q || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(String(error.message ?? "admin_store_order_chats_page_failed"));
  const d = data && typeof data === "object" ? (data as { rows?: unknown; total?: unknown }) : {};
  const rows = (Array.isArray(d.rows) ? (d.rows as ChatPageRpcRow[]) : [])
    .map(mapChatPageRow)
    .filter((x): x is AdminStoreOrderChatListRow => x != null);
  const totalNum = Number(d.total);
  return {
    rows,
    total: Number.isFinite(totalNum) && totalNum >= 0 ? totalNum : rows.length,
    limit,
    offset,
  };
}

/**
 * Lookup-only: resolve CM room id for an order. Never creates.
 * R1-B C-7: FK 가 비면 주문 키(identity → direct_key)로 조회만 한다.
 */
export async function lookupAdminStoreOrderMessengerRoomId(
  orderId: string
): Promise<string | null> {
  const id = trim(orderId);
  if (!id) return null;
  const sb = getSupabaseServer();
  const { data, error } = await (sb as any)
    .from("store_orders")
    .select("community_messenger_room_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const linked = trim((data as { community_messenger_room_id?: string | null } | null)?.community_messenger_room_id);
  if (linked) return linked;
  if (!data) return null;
  const found = await lookupStoreOrderMessengerRoomReadOnly(sb as any, id, null);
  return found.roomId;
}
