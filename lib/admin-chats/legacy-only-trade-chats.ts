/**
 * 레거시 거래 기록 (설계 §3-6) — 앱 채팅방(CM)이 없는 과거 거래 채팅의 단일 판정. 서버 전용.
 *
 * 기준 (채팅방 목록 안내 줄 건수 = 레거시 거래 기록 화면 행 수):
 * - 같은 상품·판매자·구매자 묶음(product_chats ↔ chat_rooms item_trade) 중 **어느 행도 CM 방이 없다**
 *   (FK · direct_key · domain_identity_key — 목록·상세와 같은 해석기 `resolveTradeMessengerRoomIdsBatch`).
 * - 메시지가 있다 (last_message_at 또는 미리보기).
 * 후보는 CM FK 가 비어 있는 행만 읽는다 (FK 가 있으면 CM 방이 있는 것) — 최신 N건 상한 없음.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyTradeLegacyRoomRefs, resolveTradeMessengerRoomIdsBatch } from "@/lib/admin-chats/trade-messenger-room";

export type LegacyOnlyTradeChats = {
  /** 묶음(상품·판매자·구매자) 수 = 화면 행 수 */
  count: number;
  productChatIds: string[];
  chatRoomIds: string[];
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const tripleKey = (item: string, seller: string, buyer: string) =>
  item && seller && buyer ? `${item}\u0001${seller}\u0001${buyer}` : "";

const SCAN_LIMIT = 5000;

export async function loadLegacyOnlyTradeChats(sb: SupabaseClient<any>): Promise<LegacyOnlyTradeChats> {
  const [pcRes, crRes] = await Promise.all([
    sb
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id, last_message_at, last_message_preview")
      .is("community_messenger_room_id", null)
      .limit(SCAN_LIMIT),
    sb
      .from("chat_rooms")
      .select("id, item_id, seller_id, buyer_id, last_message_at, last_message_preview")
      .eq("room_type", "item_trade")
      .is("community_messenger_room_id", null)
      .limit(SCAN_LIMIT),
  ]);
  if (pcRes.error) throw new Error(pcRes.error.message);
  if (crRes.error) throw new Error(crRes.error.message);

  type Row = { key: string; kind: "pc" | "cr"; id: string; triple: string; hasMessage: boolean; item: string; seller: string; buyer: string };
  const rows: Row[] = [
    ...((pcRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      key: `pc:${s(r.id)}`,
      kind: "pc" as const,
      id: s(r.id),
      item: s(r.post_id),
      seller: s(r.seller_id),
      buyer: s(r.buyer_id),
      triple: tripleKey(s(r.post_id), s(r.seller_id), s(r.buyer_id)),
      hasMessage: Boolean(s(r.last_message_at) || s(r.last_message_preview)),
    })),
    ...((crRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      key: `cr:${s(r.id)}`,
      kind: "cr" as const,
      id: s(r.id),
      item: s(r.item_id),
      seller: s(r.seller_id),
      buyer: s(r.buyer_id),
      triple: tripleKey(s(r.item_id), s(r.seller_id), s(r.buyer_id)),
      hasMessage: Boolean(s(r.last_message_at) || s(r.last_message_preview)),
    })),
  ];
  if (!rows.length) return { count: 0, productChatIds: [], chatRoomIds: [] };

  // 1) 같은 해석기로 CM 방이 잡히는 행 (FK 없어도 direct_key·identity 로 연결된 방)
  const cmByKey = await resolveTradeMessengerRoomIdsBatch(
    sb,
    rows.map((r) => ({
      key: r.key,
      refs: emptyTradeLegacyRoomRefs(
        r.kind === "pc"
          ? { productChatId: r.id, itemId: r.item || null, sellerId: r.seller || null, buyerId: r.buyer || null }
          : { chatRoomId: r.id, itemId: r.item || null, sellerId: r.seller || null, buyerId: r.buyer || null }
      ),
    }))
  );

  // 2) 같은 묶음의 짝 행이 CM FK 를 가진 경우 (예: product_chats 는 비었지만 chat_rooms 에 CM 연결)
  const linkedTriples = new Set<string>();
  const items = [...new Set(rows.map((r) => r.item).filter(Boolean))];
  if (items.length) {
    const [pcLinked, crLinked] = await Promise.all([
      sb.from("product_chats").select("post_id, seller_id, buyer_id").in("post_id", items).not("community_messenger_room_id", "is", null),
      sb
        .from("chat_rooms")
        .select("item_id, seller_id, buyer_id")
        .eq("room_type", "item_trade")
        .in("item_id", items)
        .not("community_messenger_room_id", "is", null),
    ]);
    for (const r of (pcLinked.data ?? []) as Array<Record<string, unknown>>) {
      linkedTriples.add(tripleKey(s(r.post_id), s(r.seller_id), s(r.buyer_id)));
    }
    for (const r of (crLinked.data ?? []) as Array<Record<string, unknown>>) {
      linkedTriples.add(tripleKey(s(r.item_id), s(r.seller_id), s(r.buyer_id)));
    }
  }

  // 3) 묶음 판정 — 묶음 키가 없는 행은 단독 묶음
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const g = r.triple || r.key;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const productChatIds: string[] = [];
  const chatRoomIds: string[] = [];
  let count = 0;
  for (const [g, members] of groups) {
    if (linkedTriples.has(g)) continue;
    if (members.some((m) => cmByKey.has(m.key))) continue;
    if (!members.some((m) => m.hasMessage)) continue;
    count += 1;
    for (const m of members) (m.kind === "pc" ? productChatIds : chatRoomIds).push(m.id);
  }
  return { count, productChatIds, chatRoomIds };
}
