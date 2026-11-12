/**
 * 그룹 방 사진·제목 — 이 기기에서 방금 저장한 값 기록 (group-chat-full-fix-design G4).
 *
 * 열린 방은 silent_delta 의 사진·제목을 따라가야 다른 멤버가 바꾼 값이 보인다. 그러나 저장한 본인은
 * 저장 직후 `refresh(true)` 가 **캐시된 옛 응답**을 받을 수 있다 — 서버 메모리 캐시
 * (`ROOM_BOOTSTRAP_SILENT_DELTA_CACHE_TTL_MS` 8초) + CDN(`s-maxage=5`, `stale-while-revalidate=30`).
 * 그 시간 동안은 저장한 값과 다른 delta 값으로 덮지 않는다(`group-settings-save-snapshot` 계약).
 */
/** 서버 메모리 캐시 8초 + CDN s-maxage 5초 + stale-while-revalidate 30초 */
export const GROUP_IDENTITY_LOCAL_SAVE_GUARD_MS = 8_000 + 5_000 + 30_000;

type SavedIdentity = { title?: string; avatarUrl?: string | null; at: number };

const savedByRoom = new Map<string, SavedIdentity>();

function key(roomId: string): string {
  return String(roomId ?? "").trim().toLowerCase();
}

export function noteGroupRoomIdentitySavedLocally(
  roomId: string,
  patch: { title?: string; avatarUrl?: string | null },
  now: number = Date.now()
): void {
  const k = key(roomId);
  if (!k) return;
  const hasTitle = typeof patch.title === "string";
  const hasAvatar = Object.prototype.hasOwnProperty.call(patch, "avatarUrl");
  if (!hasTitle && !hasAvatar) return;
  const prev = savedByRoom.get(k);
  savedByRoom.set(k, {
    ...(prev && now - prev.at < GROUP_IDENTITY_LOCAL_SAVE_GUARD_MS ? prev : {}),
    ...(hasTitle ? { title: patch.title } : {}),
    ...(hasAvatar ? { avatarUrl: patch.avatarUrl ?? null } : {}),
    at: now,
  });
}

/** 저장 직후 보호 시간 안이면 저장값, 아니면 null */
export function peekGroupRoomIdentitySavedLocally(roomId: string, now: number = Date.now()): SavedIdentity | null {
  const k = key(roomId);
  const v = k ? savedByRoom.get(k) : undefined;
  if (!v) return null;
  if (now - v.at >= GROUP_IDENTITY_LOCAL_SAVE_GUARD_MS) {
    savedByRoom.delete(k);
    return null;
  }
  return v;
}

export function resetGroupRoomIdentitySavedLocallyForTests(): void {
  savedByRoom.clear();
}
