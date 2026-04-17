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

export function isMessengerRoomReadGateExtraBlocked(): boolean {
  return blockedKeys.size > 0;
}

export function messengerRoomReadBlockKeyImageLightbox(streamRoomId: string): string {
  return `cm-read:${streamRoomId.trim()}:image-lightbox`;
}

export function messengerRoomReadBlockKeyCallPanel(streamRoomId: string): string {
  return `cm-read:${streamRoomId.trim()}:call-panel`;
}
