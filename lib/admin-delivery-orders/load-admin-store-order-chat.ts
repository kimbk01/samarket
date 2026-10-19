/**
 * DEF-60 — Admin 주문 채팅 단일 경로 (`/admin/stores/orders/{orderId}/chat`) 의 읽기 전용 로더.
 *
 * - 대상: `store_order` 채팅 (lib/chat-domain/samarket-three-chat-pillars.ts).
 *   방 해석: `store_orders.community_messenger_room_id` → 없으면 주문 키(`store_order:{id}` identity·direct_key,
 *   과거 `trade_order:{id}`)로 조회만 한다 (R1-B C-7 — 방 생성·참여·읽음 처리 없음).
 * - 메시지: 사용자와 같은 id 커서 — 최신 페이지 먼저, `before` 로 이전 페이지 (R1-B C-6).
 * - metadata 를 함께 읽어 이미지·파일·음성·시스템·주문 요약을 표시한다.
 * - unread / bump / Realtime 계약은 건드리지 않는다 (participants 행·읽음 시각을 쓰지 않음).
 *
 * Server-only (service role) — client components import only the exported types.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  buildAdminCmMessageDisplay,
  type AdminCmMessageDisplay,
} from "@/lib/admin-community-messenger/admin-message-display";
import {
  ADMIN_CM_MESSAGE_PAGE_DEFAULT,
  clampAdminCmMessagePageLimit,
  queryAdminCmMessagePage,
} from "@/lib/admin-community-messenger/admin-message-page";
import {
  lookupStoreOrderMessengerRoomReadOnly,
  type StoreOrderRoomLookupSource,
} from "@/lib/admin-delivery-orders/store-order-room-lookup";

export type AdminStoreOrderChatSenderRole = "buyer" | "store" | "system" | "other";

export type AdminStoreOrderChatMessage = {
  id: string;
  senderRole: AdminStoreOrderChatSenderRole;
  senderLabel: string;
  messageType: string;
  content: string;
  createdAt: string;
  hiddenByAdmin: boolean;
  display: AdminCmMessageDisplay;
};

export type AdminStoreOrderChatView = {
  orderId: string;
  orderNo: string;
  orderStatus: string;
  storeId: string;
  storeName: string;
  buyerUserId: string;
  buyerLabel: string;
  roomId: string | null;
  /** linked = 주문 FK, 그 외 = 주문 키로 찾은 방 (읽기 전용 폴백) */
  roomSource: StoreOrderRoomLookupSource | null;
  roomStatus: "active" | "blocked" | "archived" | null;
  isReadonly: boolean | null;
  messages: AdminStoreOrderChatMessage[];
  /** 이 페이지보다 이전 메시지가 더 있음 (id 커서 `before` 로 이어 읽기) */
  hasMore: boolean;
  pageLimit: number;
  /** @deprecated hasMore 와 같음 — 구 클라이언트 호환 */
  truncated: boolean;
};

export const ADMIN_STORE_ORDER_CHAT_MESSAGE_LIMIT = ADMIN_CM_MESSAGE_PAGE_DEFAULT;

type MessageRow = {
  id: string;
  sender_id: string | null;
  message_type: string | null;
  content: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string | null;
  is_hidden_by_admin?: boolean | null;
};

const ORDER_CHAT_MESSAGE_SELECT = "id, sender_id, message_type, content, metadata, created_at, is_hidden_by_admin";

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function adminStoreOrderChatSenderRole(
  senderId: string | null | undefined,
  ids: { buyerUserId: string; ownerUserId: string }
): AdminStoreOrderChatSenderRole {
  const sid = trim(senderId);
  if (!sid) return "system";
  if (ids.buyerUserId && sid === ids.buyerUserId) return "buyer";
  if (ids.ownerUserId && sid === ids.ownerUserId) return "store";
  return "other";
}

/** Pure mapping (unit-tested): rows oldest → newest, sender role from the order's buyer / store owner. */
export function mapAdminStoreOrderChatMessages(
  rows: readonly MessageRow[],
  ctx: { buyerUserId: string; ownerUserId: string; buyerLabel: string; storeName: string; profileLabel: (id: string) => string }
): AdminStoreOrderChatMessage[] {
  return [...rows]
    .sort((a, b) => trim(a.created_at).localeCompare(trim(b.created_at)))
    .map((m) => {
      const role = adminStoreOrderChatSenderRole(m.sender_id, ctx);
      const senderLabel =
        role === "buyer"
          ? ctx.buyerLabel
          : role === "store"
            ? ctx.storeName
            : role === "system"
              ? ""
              : ctx.profileLabel(trim(m.sender_id));
      const messageType = trim(m.message_type) || "text";
      const content = typeof m.content === "string" ? m.content : "";
      return {
        id: m.id,
        senderRole: role,
        senderLabel,
        messageType,
        content,
        createdAt: trim(m.created_at),
        hiddenByAdmin: m.is_hidden_by_admin === true,
        display: buildAdminCmMessageDisplay({ messageType, content, metadata: m.metadata ?? null }),
      };
    });
}

function normalizeRoomStatus(value: unknown): "active" | "blocked" | "archived" {
  return value === "blocked" ? "blocked" : value === "archived" ? "archived" : "active";
}

export async function loadAdminStoreOrderChat(
  orderId: string,
  opts?: { before?: string | null; limit?: unknown }
): Promise<
  | { ok: true; view: AdminStoreOrderChatView }
  | { ok: false; error: "order_not_found" | "load_failed" | "anchor_not_found" }
> {
  const oid = trim(orderId);
  if (!oid) return { ok: false, error: "order_not_found" };
  const sb = getSupabaseServer();

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, order_no, order_status, store_id, buyer_user_id, community_messenger_room_id")
    .eq("id", oid)
    .maybeSingle();
  if (oErr) return { ok: false, error: "load_failed" };
  if (!order) return { ok: false, error: "order_not_found" };

  const o = order as Record<string, unknown>;
  const storeId = trim(o.store_id);
  const buyerUserId = trim(o.buyer_user_id);
  const lookup = await lookupStoreOrderMessengerRoomReadOnly(sb, oid, trim(o.community_messenger_room_id) || null);
  const roomId = lookup.roomId;

  const [storeRes, roomRes, page] = await Promise.all([
    storeId
      ? sb.from("stores").select("id, store_name, owner_user_id").eq("id", storeId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    roomId
      ? sb.from("community_messenger_rooms").select("id, room_status, is_readonly").eq("id", roomId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    roomId
      ? queryAdminCmMessagePage<MessageRow>(sb, {
          roomId,
          select: ORDER_CHAT_MESSAGE_SELECT,
          before: opts?.before ?? null,
          limit: opts?.limit ?? ADMIN_STORE_ORDER_CHAT_MESSAGE_LIMIT,
        })
      : Promise.resolve({ ok: true as const, rows: [] as MessageRow[], hasMore: false }),
  ]);
  if (storeRes.error) return { ok: false, error: "load_failed" };
  if (!page.ok) return { ok: false, error: page.error === "anchor_not_found" ? "anchor_not_found" : "load_failed" };

  const store = (storeRes.data ?? null) as { store_name?: string | null; owner_user_id?: string | null } | null;
  const ownerUserId = trim(store?.owner_user_id);
  const storeName = trim(store?.store_name) || "—";
  const rows = page.rows;
  const roomRow = (roomRes.data ?? null) as { room_status?: unknown; is_readonly?: unknown } | null;

  const profileIds = [...new Set([buyerUserId, ...rows.map((r) => trim(r.sender_id))].filter(Boolean))];
  const { data: profiles } = profileIds.length
    ? await sb.from("profiles").select("id, nickname, username").in("id", profileIds)
    : { data: [] as unknown[] };
  const labelById = new Map(
    ((profiles ?? []) as Array<{ id: string; nickname?: string | null; username?: string | null }>).map((p) => [
      p.id,
      trim(p.nickname) || trim(p.username) || "",
    ])
  );
  const profileLabel = (id: string) => labelById.get(id) || "—";
  const buyerLabel = buyerUserId ? profileLabel(buyerUserId) : "—";
  const pageLimit = clampAdminCmMessagePageLimit(opts?.limit ?? ADMIN_STORE_ORDER_CHAT_MESSAGE_LIMIT);

  return {
    ok: true,
    view: {
      orderId: oid,
      orderNo: trim(o.order_no),
      orderStatus: trim(o.order_status),
      storeId,
      storeName,
      buyerUserId,
      buyerLabel,
      roomId,
      roomSource: lookup.source,
      roomStatus: roomRow ? normalizeRoomStatus(roomRow.room_status) : null,
      isReadonly: roomRow ? roomRow.is_readonly === true : null,
      messages: mapAdminStoreOrderChatMessages(rows, { buyerUserId, ownerUserId, buyerLabel, storeName, profileLabel }),
      hasMore: page.hasMore,
      pageLimit,
      truncated: page.hasMore,
    },
  };
}
