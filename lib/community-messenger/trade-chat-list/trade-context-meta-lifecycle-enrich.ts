/**
 * 거래 CM 목록 — `product_chats` 원장 lifecycle 필드를 contextMeta·isReadonly 에 반영.
 * 추측 fallback 없음 — DB 컬럼만 사용.
 */
import { parseTradeMessengerDirectKey } from "@/lib/messenger-policy/parse-trade-messenger-direct-key";
import type { CommunityMessengerRoomContextMetaV1, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export const PRODUCT_CHAT_LIFECYCLE_SELECT =
  "id, post_id, seller_id, buyer_id, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, community_messenger_room_id";

export type ProductChatLifecycleRow = {
  id: string;
  post_id: string;
  seller_id: string;
  buyer_id: string;
  trade_flow_status?: string | null;
  chat_mode?: string | null;
  seller_completed_at?: string | null;
  buyer_confirmed_at?: string | null;
  community_messenger_room_id?: string | null;
};

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** `seller_completed_at`·`buyer_confirmed_at` 중 늦은 ISO — 둘 다 없으면 undefined */
export function resolveTradeCompletedAtIso(row: {
  seller_completed_at?: string | null;
  buyer_confirmed_at?: string | null;
}): string | undefined {
  const seller = trim(row.seller_completed_at);
  const buyer = trim(row.buyer_confirmed_at);
  if (!seller && !buyer) return undefined;
  if (!seller) return buyer;
  if (!buyer) return seller;
  const sMs = Date.parse(seller);
  const bMs = Date.parse(buyer);
  if (!Number.isFinite(sMs)) return buyer;
  if (!Number.isFinite(bMs)) return seller;
  return bMs >= sMs ? buyer : seller;
}

export function productChatChatModeIsReadonly(chatMode: string | null | undefined): boolean {
  return trim(chatMode) === "readonly";
}

export function mergeProductChatLifecycleIntoTradeContextMeta(
  meta: CommunityMessengerRoomContextMetaV1,
  row: ProductChatLifecycleRow
): CommunityMessengerRoomContextMetaV1 {
  const completedAt = resolveTradeCompletedAtIso(row);
  const flow = trim(row.trade_flow_status);
  const sellerAt = trim(row.seller_completed_at);
  const buyerAt = trim(row.buyer_confirmed_at);
  return {
    ...meta,
    kind: "trade",
    v: 1,
    productChatId: trim(meta.productChatId) || row.id,
    postId: trim(meta.postId) || row.post_id,
    sellerId: row.seller_id,
    buyerId: row.buyer_id,
    ...(flow ? { tradeFlowStatus: flow } : {}),
    ...(sellerAt ? { sellerCompletedAt: sellerAt } : {}),
    ...(buyerAt ? { buyerConfirmedAt: buyerAt } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

function resolveProductChatIdForTradeSummary(summary: CommunityMessengerRoomSummary): string | null {
  const fromMeta = trim(summary.contextMeta?.productChatId);
  if (fromMeta) return fromMeta;
  const parsed = parseTradeMessengerDirectKey(summary.messengerDirectKey);
  if (parsed?.kind === "trade_pc") return parsed.productChatId;
  return null;
}

function parseProductChatLifecycleRow(raw: Record<string, unknown>): ProductChatLifecycleRow | null {
  const id = trim(raw.id);
  const post_id = trim(raw.post_id);
  const seller_id = trim(raw.seller_id);
  const buyer_id = trim(raw.buyer_id);
  if (!id || !post_id || !seller_id || !buyer_id) return null;
  return {
    id,
    post_id,
    seller_id,
    buyer_id,
    trade_flow_status: trim(raw.trade_flow_status) || null,
    chat_mode: trim(raw.chat_mode) || null,
    seller_completed_at: trim(raw.seller_completed_at) || null,
    buyer_confirmed_at: trim(raw.buyer_confirmed_at) || null,
    community_messenger_room_id: trim(raw.community_messenger_room_id) || null,
  };
}

/** trade 방 요약에 product_chats lifecycle 필드를 병합한다. */
export async function enrichTradeRoomLifecycleFieldsFromProductChats(
  sb: { from: (table: string) => { select: (cols: string) => unknown } },
  summaries: CommunityMessengerRoomSummary[]
): Promise<void> {
  const tradeTargets = summaries.filter(
    (s) =>
      s.roomType === "direct" &&
      (s.contextMeta?.kind === "trade" || parseTradeMessengerDirectKey(s.messengerDirectKey) != null)
  );
  if (!tradeTargets.length) return;

  const pcIdByRoomId = new Map<string, string>();
  const pcIds = new Set<string>();
  const roomIdsNeedingLookup: string[] = [];

  for (const s of tradeTargets) {
    const rid = trim(s.id);
    if (!rid) continue;
    const pcid = resolveProductChatIdForTradeSummary(s);
    if (pcid) {
      pcIds.add(pcid);
      pcIdByRoomId.set(rid, pcid);
    } else {
      roomIdsNeedingLookup.push(rid);
    }
  }

  const pcById = new Map<string, ProductChatLifecycleRow>();
  const pcByRoomId = new Map<string, ProductChatLifecycleRow>();

  const loadRows = async (rows: Array<Record<string, unknown>>) => {
    for (const raw of rows) {
      const parsed = parseProductChatLifecycleRow(raw);
      if (!parsed) continue;
      pcById.set(parsed.id, parsed);
      const cmRid = trim(parsed.community_messenger_room_id);
      if (cmRid) pcByRoomId.set(cmRid, parsed);
    }
  };

  const idList = [...pcIds];
  if (idList.length) {
    const q = sb.from("product_chats").select(PRODUCT_CHAT_LIFECYCLE_SELECT) as {
      in: (col: string, vals: string[]) => Promise<{ data?: unknown }>;
    };
    const { data } = await q.in("id", idList);
    await loadRows((Array.isArray(data) ? data : []) as Array<Record<string, unknown>>);
  }

  const missingRoomIds = roomIdsNeedingLookup.filter((rid) => !pcByRoomId.has(rid));
  if (missingRoomIds.length) {
    const q = sb.from("product_chats").select(PRODUCT_CHAT_LIFECYCLE_SELECT) as {
      in: (col: string, vals: string[]) => Promise<{ data?: unknown }>;
    };
    const { data } = await q.in("community_messenger_room_id", missingRoomIds);
    await loadRows((Array.isArray(data) ? data : []) as Array<Record<string, unknown>>);
  }

  for (const summary of tradeTargets) {
    const rid = trim(summary.id);
    if (!rid) continue;
    const pcid = pcIdByRoomId.get(rid);
    const row = (pcid ? pcById.get(pcid) : undefined) ?? pcByRoomId.get(rid);
    if (!row) continue;

    const base: CommunityMessengerRoomContextMetaV1 =
      summary.contextMeta?.kind === "trade"
        ? summary.contextMeta
        : { v: 1, kind: "trade", headline: summary.title.trim() || "거래" };

    summary.contextMeta = mergeProductChatLifecycleIntoTradeContextMeta(base, row);
    if (productChatChatModeIsReadonly(row.chat_mode)) {
      summary.isReadonly = true;
    }
  }
}
