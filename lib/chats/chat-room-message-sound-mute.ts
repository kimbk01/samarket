/**
 * 채팅방 단위 메시지 알림음(인앱) 끔 — localStorage, 해당 방에서 다시 켤 때까지 유지.
 */

const STORAGE_PREFIX = "samarket:chatRoom:msgSoundMuted:";

function key(roomId: string): string {
  return `${STORAGE_PREFIX}${roomId.trim()}`;
}

export function isChatRoomMessageSoundMuted(roomId: string): boolean {
  if (typeof window === "undefined" || !roomId.trim()) return false;
  try {
    return window.localStorage.getItem(key(roomId)) === "1";
  } catch {
    return false;
  }
}

/** true = 알림음 끔(🔕 상태) */
export function setChatRoomMessageSoundMuted(roomId: string, muted: boolean): void {
  if (typeof window === "undefined" || !roomId.trim()) return;
  try {
    const k = key(roomId);
    if (muted) window.localStorage.setItem(k, "1");
    else window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
