import { normalizeCmRealtimeSubscribeRoomId } from "@/lib/community-messenger/realtime/cm-rt-room-sub-log";

/** 느슨한 UUID 검사 — CM room id 후보 필터 */
function looksLikeMessengerRoomUuid(value: string): boolean {
  const s = value.trim();
  if (s.length < 32 || s.length > 40) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * 거래/통합 채팅 행에서 CM 방 UUID 후보를 하나로 고른다.
 * UnifiedRoomListItem(`{ room }`)·레거시 ChatRoom 형 모두 허용.
 */
export function resolveCommunityMessengerRoomIdFromChatRow(row: unknown): string | null {
  if (row == null) return null;

  const candidates: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t) candidates.push(t);
  };

  if (typeof row === "object" && row !== null) {
    const r = row as Record<string, unknown>;
    push(r.communityMessengerRoomId);
    push(r.community_messenger_room_id);
    push(r.roomId);
    push(r.cmRoomId);
    push(r.id);

    const nestedRoom = r.room;
    if (nestedRoom && typeof nestedRoom === "object") {
      const rm = nestedRoom as Record<string, unknown>;
      push(rm.communityMessengerRoomId);
      push(rm.community_messenger_room_id);
      push(rm.id);
      push(rm.cmRoomId);
    }
  }

  for (const c of candidates) {
    const n = normalizeCmRealtimeSubscribeRoomId(c);
    if (!n) continue;
    if (looksLikeMessengerRoomUuid(n)) return n;
  }
  for (const c of candidates) {
    const n = normalizeCmRealtimeSubscribeRoomId(c);
    if (n) return n;
  }
  return null;
}
