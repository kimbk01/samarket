/** 방 메시지 bump용 Realtime Broadcast 채널/이벤트 — 클라·서버 공통 (번들에 `use client` 없음) */

export const CM_ROOM_BUMP_BROADCAST_EVENT = "cm_room_bump";

export function communityMessengerRoomBumpChannelName(roomId: string): string {
  return `community-messenger-room-bump:${roomId.trim().toLowerCase()}`;
}

/** 수신 측이 URL id·canonical id·스냅샷 id 중 무엇으로 구독/매칭하든 bump 를 받을 수 있게 묶는다. */
export function communityMessengerBumpKnownRoomIds(args: {
  routeRoomId: string;
  streamRoomId: string;
  snapshotRoomId?: string | null;
}): Set<string> {
  const s = new Set<string>();
  for (const x of [args.routeRoomId, args.streamRoomId, args.snapshotRoomId]) {
    const t = String(x ?? "").trim().toLowerCase();
    if (t) s.add(t);
  }
  return s;
}

/** 서버 v2 페이로드가 현재 방(라우트·스트림·스냅샷)과 같은 대화인지 — HTTP 검증 전 라우팅만. */
export function communityMessengerBumpPayloadMatchesKnownRooms(
  payload: Record<string, unknown>,
  known: Set<string>
): boolean {
  const pick = (key: string): string => {
    const v = payload[key];
    return typeof v === "string" ? v.trim().toLowerCase() : "";
  };
  const canon = pick("canonicalRoomId") || pick("roomId");
  const raw = pick("rawRouteRoomId");
  for (const id of [canon, raw]) {
    if (id && known.has(id)) return true;
  }
  return false;
}
