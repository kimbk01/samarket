/**
 * Phase2 등에서 오버레이가 열려 있을 때 `mark_read` 를 막는다.
 * 방 전환 시 이전 방 cleanup 이 나중에 실행돼도 다른 방 키를 건드리지 않도록 **키 단위 Set** 으로 관리한다.
 */

const blockedKeys = new Set<string>();

export function setMessengerRoomReadBlock(key: string, blocked: boolean): void {
  const k = key.trim();
  if (!k) return;
  if (blocked) blockedKeys.add(k);
  else blockedKeys.delete(k);
}

/**
 * @param roomId — 주면 **해당 방** 오버레이만 차단. 생략 시(레거시) 아무 키나 있으면 true.
 * DO NOT: 다른 방 lightbox/call 키로 현재 방 mark_read 를 막지 말 것 (1차 진입 읽음 누락 원인).
 */
export function isMessengerRoomReadGateExtraBlocked(roomId?: string | null): boolean {
  const rid = typeof roomId === "string" ? roomId.trim() : "";
  if (!rid) return blockedKeys.size > 0;
  const prefix = `cm-read:${rid}:`;
  for (const k of blockedKeys) {
    if (k.startsWith(prefix)) return true;
  }
  return false;
}

export function messengerRoomReadBlockKeyImageLightbox(streamRoomId: string): string {
  return `cm-read:${streamRoomId.trim()}:image-lightbox`;
}

export function messengerRoomReadBlockKeyCallPanel(streamRoomId: string): string {
  return `cm-read:${streamRoomId.trim()}:call-panel`;
}

/** @internal vitest */
export function clearMessengerRoomReadBlocksForTests(): void {
  blockedKeys.clear();
}
