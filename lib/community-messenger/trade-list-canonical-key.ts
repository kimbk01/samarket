/**
 * 거래 탭·home-sync 목록 dedupe — 동일 product_chats / post 단위 1행.
 * @see docs/trade-chat-room-identity.md
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

/** 목록 dedupe 그룹 키 — `productChatId` 우선, 없으면 `postId`, 마지막으로 direct_key 원장 id. */
export function tradeMessengerListCanonicalKey(summary: CommunityMessengerRoomSummary): string | null {
  const meta = summary.contextMeta;
  const parsed = parseTradeMessengerDirectKey(summary.messengerDirectKey);
  if (meta?.kind === "trade") {
    const pcid = trimId(meta.productChatId);
    if (pcid) return `pc:${pcid}`;
    const postId = trimId(meta.postId);
    if (postId) return `post:${postId}`;
  }
  if (parsed?.kind === "trade_pc") return `pc:${parsed.productChatId}`;
  if (parsed?.kind === "trade_item") return `item:${parsed.itemTradeChatRoomId}`;
  return null;
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
