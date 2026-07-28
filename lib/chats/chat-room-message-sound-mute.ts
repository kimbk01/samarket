/**
 * 채팅방 단위 메시지 알림음(인앱) 끔 — localStorage + 세션 메모리.
 * memory 가 우선(같은 탭 즉시 반영). storage 실패 시에도 mute 가 동작한다.
 */

const STORAGE_PREFIX = "samarket:chatRoom:msgSoundMuted:";

/** 세션 내 즉시 반영 — gate/polling 이 localStorage 레이스에 의존하지 않음 */
const mutedRoomIds = new Set<string>();

function key(roomId: string): string {
  return `${STORAGE_PREFIX}${roomId.trim()}`;
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim();
}

export function isChatRoomMessageSoundMuted(roomId: string): boolean {
  const rid = normalizeRoomId(roomId);
  if (!rid) return false;
  if (mutedRoomIds.has(rid)) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key(rid)) === "1";
  } catch {
    return false;
  }
}

/** true = 알림음 끔(🔕 상태) */
export function setChatRoomMessageSoundMuted(roomId: string, muted: boolean): void {
  const rid = normalizeRoomId(roomId);
  if (!rid) return;
  if (muted) mutedRoomIds.add(rid);
  else mutedRoomIds.delete(rid);
  if (typeof window === "undefined") return;
  try {
    const k = key(rid);
    if (muted) window.localStorage.setItem(k, "1");
    else window.localStorage.removeItem(k);
  } catch {
    /* memory already updated */
  }
}

/** @internal vitest */
export function clearChatRoomMessageSoundMuteForTests(): void {
  mutedRoomIds.clear();
}
