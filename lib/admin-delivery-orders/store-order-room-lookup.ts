/**
 * 채팅 Admin R1 (B · C-7) — 주문 → CM 방 조회 전용 해석 (방 생성·참여·FK 보정 없음).
 *
 * 사용자 측 정식 ensure(`ensureStoreOrderMessengerRoom`)의 조회 순서를 그대로 따르되 생성하지 않는다:
 *  1) `store_orders.community_messenger_room_id`
 *  2) `community_messenger_rooms.domain_identity_key = store_order:{orderId}` (chat_domain=store_order)
 *  3) `direct_key IN (store_order:{orderId}, trade_order:{orderId})` (room_type=direct, 오래된 방 우선)
 * sb 는 서버 호출부가 주입 (service role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { storeOrderRoomIdentity } from "@/lib/chat-domain/room-identity";
import { chunkIds } from "@/lib/chats/chat-list-limits";

export type StoreOrderRoomLookupSource = "linked" | "domain_identity" | "direct_key";

export function storeOrderRoomDirectKeys(orderId: string): string[] {
  const id = orderId.trim();
  return id ? [`store_order:${id}`, `trade_order:${id}`] : [];
}

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function orderIdFromKey(key: string): string | null {
  for (const prefix of ["store_order:", "trade_order:"]) {
    if (key.startsWith(prefix)) return key.slice(prefix.length).trim() || null;
  }
  return null;
}

export async function lookupStoreOrderMessengerRoomReadOnly(
  sb: SupabaseClient<any>,
  orderId: string,
  linkedRoomId?: string | null
): Promise<{ roomId: string | null; source: StoreOrderRoomLookupSource | null }> {
  const oid = orderId.trim();
  const linked = s(linkedRoomId);
  if (linked) return { roomId: linked, source: "linked" };
  if (!oid) return { roomId: null, source: null };
  const { data: byIdentity } = await sb
    .from("community_messenger_rooms")
    .select("id")
    .eq("chat_domain", "store_order")
    .eq("domain_identity_key", storeOrderRoomIdentity(oid).identityKey)
    .limit(1)
    .maybeSingle();
  const identityId = s((byIdentity as { id?: unknown } | null)?.id);
  if (identityId) return { roomId: identityId, source: "domain_identity" };
  const { data: byKey } = await sb
    .from("community_messenger_rooms")
    .select("id")
    .eq("room_type", "direct")
    .in("direct_key", storeOrderRoomDirectKeys(oid))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const keyId = s((byKey as { id?: unknown } | null)?.id);
  if (keyId) return { roomId: keyId, source: "direct_key" };
  return { roomId: null, source: null };
}

/** 목록용 배치 — FK 없는 주문들만 넘긴다. 반환: orderId → roomId (조회된 것만). */
export async function lookupStoreOrderMessengerRoomsBatchReadOnly(
  sb: SupabaseClient<any>,
  orderIds: readonly string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return out;
  for (const chunk of chunkIds(ids, 80)) {
    const { data } = await sb
      .from("community_messenger_rooms")
      .select("id, domain_identity_key")
      .eq("chat_domain", "store_order")
      .in(
        "domain_identity_key",
        chunk.map((id) => storeOrderRoomIdentity(id).identityKey)
      );
    for (const row of (data ?? []) as Array<{ id?: unknown; domain_identity_key?: unknown }>) {
      const oid = orderIdFromKey(s(row.domain_identity_key));
      const rid = s(row.id);
      if (oid && rid && !out.has(oid)) out.set(oid, rid);
    }
  }
  const remaining = ids.filter((id) => !out.has(id));
  for (const chunk of chunkIds(remaining, 40)) {
    const { data } = await sb
      .from("community_messenger_rooms")
      .select("id, direct_key, created_at")
      .eq("room_type", "direct")
      .in(
        "direct_key",
        chunk.flatMap((id) => storeOrderRoomDirectKeys(id))
      )
      .order("created_at", { ascending: true });
    for (const row of (data ?? []) as Array<{ id?: unknown; direct_key?: unknown }>) {
      const oid = orderIdFromKey(s(row.direct_key));
      const rid = s(row.id);
      if (oid && rid && !out.has(oid)) out.set(oid, rid);
    }
  }
  return out;
}
