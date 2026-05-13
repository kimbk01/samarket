/**
 * POST /api/community-messenger/trade-chat-list-meta — dedupe 캐시·in-flight 가 patches 만이 아니라
 * `[dev-api-perf]` 용 perf 까지 보관할 때 공유 타입.
 */
export type TradeChatListMetaPatch = { roomId: string; contextMeta: unknown };

export type TradeChatListMetaComputeResult = {
  patches: TradeChatListMetaPatch[];
  perf: Record<string, unknown>;
};
