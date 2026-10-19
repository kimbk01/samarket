/**
 * DEF-60 — Admin 주문 채팅 단일 경로 (`/admin/stores/orders/{orderId}/chat`) 의 읽기 전용 로더.
 *
 * - 대상: `store_order` 채팅 (lib/chat-domain/samarket-three-chat-pillars.ts) — 주문의
 *   `store_orders.community_messenger_room_id` 로만 찾는다 (lookup-only, 방 생성·참여·읽음 처리 없음).
 * - 커뮤니티 메신저 관리 화면(`/admin/chats/messenger/{roomId}`)을 거치지 않는다.
 * - unread / bump / Realtime 계약은 건드리지 않는다 (participants 행·읽음 시각을 쓰지 않음).
 *
 * Server-only (service role) — client components import only the exported types.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export type AdminStoreOrderChatSenderRole = "buyer" | "store" | "system" | "other";

export type AdminStoreOrderChatMessage = {
  id: string;
  senderRole: AdminStoreOrderChatSenderRole;
  senderLabel: string;
  messageType: string;
  content: string;
  createdAt: string;
  hiddenByAdmin: boolean;
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
  messages: AdminStoreOrderChatMessage[];
  /** true when the message list was cut at the read limit (oldest shown first). */
  truncated: boolean;
};

export const ADMIN_STORE_ORDER_CHAT_MESSAGE_LIMIT = 300;

type MessageRow = {
  id: string;
  sender_id: string | null;
  message_type: string | null;
  content: string | null;
  created_at: string | null;
  is_hidden_by_admin?: boolean | null;
};

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
      return {
        id: m.id,
        senderRole: role,
        senderLabel,
        messageType: trim(m.message_type) || "text",
        content: typeof m.content === "string" ? m.content : "",
        createdAt: trim(m.created_at),
        hiddenByAdmin: m.is_hidden_by_admin === true,
      };
    });
}

export async function loadAdminStoreOrderChat(
  orderId: string
): Promise<{ ok: true; view: AdminStoreOrderChatView } | { ok: false; error: "order_not_found" | "load_failed" }> {
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
  const roomId = trim(o.community_messenger_room_id) || null;

  const [storeRes, msgRes] = await Promise.all([
    storeId
      ? sb.from("stores").select("id, store_name, owner_user_id").eq("id", storeId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    roomId
      ? sb
          .from("community_messenger_messages")
          .select("id, sender_id, message_type, content, created_at, is_hidden_by_admin")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .limit(ADMIN_STORE_ORDER_CHAT_MESSAGE_LIMIT + 1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (storeRes.error || msgRes.error) return { ok: false, error: "load_failed" };

  const store = (storeRes.data ?? null) as { store_name?: string | null; owner_user_id?: string | null } | null;
  const ownerUserId = trim(store?.owner_user_id);
  const storeName = trim(store?.store_name) || "—";
  const allRows = ((msgRes.data ?? []) as MessageRow[]);
  const truncated = allRows.length > ADMIN_STORE_ORDER_CHAT_MESSAGE_LIMIT;
  const rows = allRows.slice(0, ADMIN_STORE_ORDER_CHAT_MESSAGE_LIMIT);

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
      messages: mapAdminStoreOrderChatMessages(rows, { buyerUserId, ownerUserId, buyerLabel, storeName, profileLabel }),
      truncated,
    },
  };
}
