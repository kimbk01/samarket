import { TRADE_CHAT_LIST_LOAD_MORE_MIN_MS } from "@/lib/community-messenger/trade-chat-list/trade-chat-list-pagination";

/** 더보기 스피너 최소 노출 — 리스트 하단이 자연스럽게 펼쳐지도록 */
export async function awaitTradeListLoadMoreMinDelay(startedAtMs: number): Promise<void> {
  const remaining = TRADE_CHAT_LIST_LOAD_MORE_MIN_MS - (Date.now() - startedAtMs);
  if (remaining <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, remaining);
  });
}
