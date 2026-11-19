import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnreadParticipantRoomRows } from "@/lib/notifications/load-unread-participant-room-rows";
import {
  parseOrderId,
  TRADE_STORE_ORDER_CHAT_DOMAINS,
} from "@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants";

/**
 * D2 2단계 (Owner 「승인」 2026-11-19) — 쓰기 시점 배지 입력 표 `member_unread_room_inputs`.
 *
 * 표 1행 = 지금 배지 로더가 요청마다 읽는 입력(참가자 안 읽음 · 방 종류/식별 키/삭제/내용 유무 · 주문 구매자/매장 · 매장 주인).
 * 이 행들을 기존 로더 입력 모양(`UnreadParticipantRoomRows` + 주문 지도)으로 되돌려 **같은 판정 함수**에 넣는다.
 * 2-b 단계: 배지 계산이 표본 요청에서 기존 로더 결과와 비교만 한다(화면 불변).
 *
 * 설계: docs/audit/supabase-request-surge-2026-11-18/d2-stage2-design-2026-11-19.md
 */

export type MemberUnreadRoomInputRow = {
  user_id: string;
  room_id: string;
  unread_count: number;
  chat_domain: string | null;
  domain_identity_key: string | null;
  room_deleted: boolean;
  last_message_has_content: boolean;
  order_id: string | null;
  order_buyer_user_id: string | null;
  order_store_id: string | null;
  store_owner_user_id: string | null;
};

export type MemberUnreadRoomInputsAsLoaderInput = {
  loaded: UnreadParticipantRoomRows;
  orderMaps: {
    orderBuyerById: Record<string, string>;
    orderStoreById: Record<string, string>;
    storeOwnerById: Record<string, string>;
  };
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * 표 행 → 기존 로더 입력.
 * - parts: `unread_count > 0 AND left_at IS NULL` 행만 표에 있으므로 left_at = null.
 * - rooms: 삭제면 deleted_at 에 표시 문자열, 내용 유무는 last_message 에 "·"(있음) / ""(없음) — 판정 함수가 trim 으로 같은 결과.
 * - 주문 지도: 거래·주문 방 중 TS `parseOrderId` 와 같은 주문 id 이고, 주문이 있을 때만(없으면 기존 조회처럼 키 없음).
 */
export function memberUnreadRoomInputsToLoaderInput(
  rows: readonly MemberUnreadRoomInputRow[]
): MemberUnreadRoomInputsAsLoaderInput {
  const parts = rows.map((r) => ({ room_id: s(r.room_id), unread_count: r.unread_count, left_at: null }));
  const rooms = rows.map((r) => ({
    id: s(r.room_id),
    chat_domain: r.chat_domain,
    deleted_at: r.room_deleted ? "deleted" : null,
    last_message: r.last_message_has_content ? "·" : "",
    domain_identity_key: r.domain_identity_key,
  }));
  const orderBuyerById: Record<string, string> = {};
  const orderStoreById: Record<string, string> = {};
  const storeOwnerById: Record<string, string> = {};
  for (const r of rows) {
    if (!TRADE_STORE_ORDER_CHAT_DOMAINS.has(String(r.chat_domain ?? ""))) continue;
    const orderId = parseOrderId(r.domain_identity_key);
    if (!orderId || orderId !== s(r.order_id)) continue;
    const buyer = s(r.order_buyer_user_id);
    const store = s(r.order_store_id);
    if (!buyer && !store) continue; // 주문 없음 = 기존 조회에서도 키 없음
    orderBuyerById[orderId] = buyer;
    orderStoreById[orderId] = store;
    if (store && s(r.store_owner_user_id)) storeOwnerById[store] = s(r.store_owner_user_id);
  }
  return { loaded: { ok: true, parts, rooms }, orderMaps: { orderBuyerById, orderStoreById, storeOwnerById } };
}

export async function loadMemberUnreadRoomInputs(
  sb: SupabaseClient,
  userId: string
): Promise<MemberUnreadRoomInputRow[] | null> {
  const uid = userId.trim();
  if (!uid) return [];
  const { data, error } = await sb.rpc("get_member_unread_room_inputs", { p_user_id: uid });
  if (error || !Array.isArray(data)) return null;
  return data as MemberUnreadRoomInputRow[];
}

/** 비교용 정규화 — 방 ID 목록은 정렬, 지도는 키 정렬 */
export function stableFactsKey(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${[...value].map(stableFactsKey).sort().join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableFactsKey(o[k])}`)
    .join(",")}}`;
}
