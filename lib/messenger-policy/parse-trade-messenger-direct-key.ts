/** `community_messenger_rooms.direct_key` — 거래 스레드 원장 키 (`trade_pc:` / `trade_item:`). */
export type ParsedTradeMessengerDirectKey =
  | { kind: "trade_pc"; productChatId: string }
  | { kind: "trade_item"; itemTradeChatRoomId: string };

export function parseTradeMessengerDirectKey(
  directKey: string | null | undefined
): ParsedTradeMessengerDirectKey | null {
  const t = typeof directKey === "string" ? directKey.trim() : "";
  if (!t) return null;
  if (t.startsWith("trade_pc:")) {
    const id = t.slice("trade_pc:".length).trim();
    return id ? { kind: "trade_pc", productChatId: id } : null;
  }
  if (t.startsWith("trade_item:")) {
    const id = t.slice("trade_item:".length).trim();
    return id ? { kind: "trade_item", itemTradeChatRoomId: id } : null;
  }
  return null;
}
