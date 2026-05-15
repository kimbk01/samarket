/** HS5 unread prefetch — `fetchMyRoomsPayload` 직후 direct_key 기준 trade 방 힌트(요약 전) */
export function extractHs5TradeHintsFromRoomsPayload(payload: {
  roomRows: Array<{ id?: string; room_type?: string; roomType?: string; direct_key?: string | null; directKey?: string | null }>;
}): { cmRoomIds: string[]; productChatIds: string[] } {
  const cmRoomIds: string[] = [];
  const productChatIds: string[] = [];
  const seenRoom = new Set<string>();
  const seenPc = new Set<string>();
  for (const room of payload.roomRows) {
    const isDb = "room_type" in room;
    const roomType = isDb ? room.room_type : room.roomType;
    if (roomType !== "direct") continue;
    const dk = String(isDb ? room.direct_key ?? "" : room.directKey ?? "").trim();
    if (!dk.startsWith("trade_pc:") && !dk.startsWith("trade_item:")) continue;
    const rid = String(room.id ?? "").trim();
    if (rid && !seenRoom.has(rid)) {
      seenRoom.add(rid);
      cmRoomIds.push(rid);
    }
    if (dk.startsWith("trade_pc:")) {
      const pc = dk.slice("trade_pc:".length).trim();
      if (pc && !seenPc.has(pc)) {
        seenPc.add(pc);
        productChatIds.push(pc);
      }
    }
  }
  return { cmRoomIds, productChatIds };
}
