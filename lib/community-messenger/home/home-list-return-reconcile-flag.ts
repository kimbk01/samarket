/**
 * N-3 (docs/audit/messenger-2026-10-26-remaining-reaudit-plan.md §1): 방 안에서 「모두에게서 삭제」를 받은 뒤 목록으로
 * 돌아오면 미리보기가 원문으로 남았다. 휴대폰은 방 안에 있는 동안 목록 실시간이 없고, 목록 복귀 정합(D-7 W2)은
 * 서버 확인 10초 미만이면 건너뛴다. 방 화면이 삭제를 새로 반영하면
 * ① 다음 목록 복귀 때 캐시 그림에서 그 방 미리보기를 서버와 같은 값으로 바꾸고(원문이 잠깐도 보이지 않게)
 * ② 서버 정합을 1회 강제한다.
 */
import { canonicalRoomListPreviewFromMessageFields } from "@/lib/community-messenger/room-list-semantic-preview";

let needed = false;
/** roomId → 삭제된 메시지의 createdAt(ms) */
const deletedTips = new Map<string, number>();

export function markHomeListReturnReconcileNeeded(tip?: { roomId?: string | null; createdAt?: string | null }): void {
  needed = true;
  const roomId = tip?.roomId?.trim() ?? "";
  const at = tip?.createdAt ? Date.parse(tip.createdAt) : Number.NaN;
  if (roomId && Number.isFinite(at)) {
    const prev = deletedTips.get(roomId);
    if (prev == null || at > prev) deletedTips.set(roomId, at);
  }
}

/** 읽고 지운다 — 복귀 1회에만 적용 */
export function consumeHomeListReturnReconcileNeeded(): boolean {
  const v = needed;
  needed = false;
  return v;
}

/** 읽고 지운다 — 복귀 1회의 캐시 그림에만 적용 */
export function consumeDeletedRoomListTips(): Map<string, number> {
  const out = new Map(deletedTips);
  deletedTips.clear();
  return out;
}

type RoomTip = { id: string; lastMessage: string; lastMessageAt: string; lastMessageType?: string };

/**
 * 목록 캐시의 그 방 마지막 메시지가 삭제된 메시지면(시각 같음) 서버 재계산과 같은 미리보기로 바꾼다
 * (삭제 행은 본문이 비어 `canonicalRoomListPreviewFromMessageFields` 결과 — `recomputeCommunityMessengerRoomLastMessage` 와 같음).
 */
export function applyDeletedTipsToRooms<T extends RoomTip>(rooms: T[], tips: ReadonlyMap<string, number>): T[] {
  if (tips.size === 0) return rooms;
  const placeholder = canonicalRoomListPreviewFromMessageFields({ messageType: "text", content: "" });
  let changed = false;
  const next = rooms.map((room) => {
    const at = tips.get(room.id);
    if (at == null) return room;
    const lastAt = Date.parse(room.lastMessageAt);
    if (!Number.isFinite(lastAt) || Math.abs(lastAt - at) > 1_000) return room;
    if (room.lastMessage === placeholder.lastMessage) return room;
    changed = true;
    return { ...room, lastMessage: placeholder.lastMessage, lastMessageType: placeholder.lastMessageType };
  });
  return changed ? next : rooms;
}
