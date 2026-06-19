/**
 * 거래 탭·home-sync 목록 dedupe — 상품×판매자×구매자 1행.
 * @see docs/trade-chat-room-identity.md
 *
 * Canonical key 우선순위:
 * 1. pc:{productChatId}
 * 2. trade:{postId}:{sellerId}:{buyerId}
 * 3. room:{roomId}
 *
 * post:{postId} 단독 key 는 사용하지 않는다.
 */
import { parseTradeMessengerDirectKey } from "@/lib/messenger-policy/parse-trade-messenger-direct-key";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function roomIsTradeSummary(summary: CommunityMessengerRoomSummary): boolean {
  return (
    summary.contextMeta?.kind === "trade" ||
    parseTradeMessengerDirectKey(summary.messengerDirectKey) != null
  );
}

function tradeTripleFromMeta(summary: CommunityMessengerRoomSummary): {
  postId: string;
  sellerId: string;
  buyerId: string;
} | null {
  const meta = summary.contextMeta?.kind === "trade" ? summary.contextMeta : null;
  if (!meta) return null;
  const postId = trimId(meta.postId);
  const sellerId = trimId(meta.sellerId);
  const buyerId = trimId(meta.buyerId);
  if (!postId || !sellerId || !buyerId) return null;
  return { postId, sellerId, buyerId };
}

/** 목록 dedupe 그룹 키 */
export function tradeMessengerListCanonicalKey(summary: CommunityMessengerRoomSummary): string | null {
  if (!roomIsTradeSummary(summary)) return null;

  const meta = summary.contextMeta?.kind === "trade" ? summary.contextMeta : null;
  const parsed = parseTradeMessengerDirectKey(summary.messengerDirectKey);

  const pcid = trimId(meta?.productChatId) || (parsed?.kind === "trade_pc" ? trimId(parsed.productChatId) : "");
  if (pcid) return `pc:${pcid}`;

  const triple = tradeTripleFromMeta(summary);
  if (triple) {
    return `trade:${triple.postId}:${triple.sellerId}:${triple.buyerId}`;
  }

  const roomId = trimId(summary.id);
  return roomId ? `room:${roomId}` : null;
}

function preferTradeSummary(
  a: CommunityMessengerRoomSummary,
  b: CommunityMessengerRoomSummary
): CommunityMessengerRoomSummary {
  const aMs = new Date(a.lastMessageAt).getTime();
  const bMs = new Date(b.lastMessageAt).getTime();
  if (bMs !== aMs) return bMs > aMs ? b : a;
  const aItem = trimId(a.messengerDirectKey).startsWith("trade_item:");
  const bItem = trimId(b.messengerDirectKey).startsWith("trade_item:");
  if (aItem !== bItem) return bItem ? b : a;
  return a;
}

/** 거래 방 요약만 canonical key 기준 1행으로 줄인다(비거래 행 순서·위치 유지). */
export function dedupeTradeMessengerRoomSummaries(
  summaries: CommunityMessengerRoomSummary[]
): CommunityMessengerRoomSummary[] {
  const tradeByKey = new Map<string, CommunityMessengerRoomSummary>();
  for (const s of summaries) {
    if (!roomIsTradeSummary(s)) continue;
    const key = tradeMessengerListCanonicalKey(s);
    if (!key) continue;
    const prev = tradeByKey.get(key);
    tradeByKey.set(key, prev ? preferTradeSummary(prev, s) : s);
  }

  const emittedTradeKeys = new Set<string>();
  const out: CommunityMessengerRoomSummary[] = [];
  for (const s of summaries) {
    if (!roomIsTradeSummary(s)) {
      out.push(s);
      continue;
    }
    const key = tradeMessengerListCanonicalKey(s);
    if (!key) {
      out.push(s);
      continue;
    }
    if (emittedTradeKeys.has(key)) continue;
    emittedTradeKeys.add(key);
    out.push(tradeByKey.get(key) ?? s);
  }
  return out;
}
