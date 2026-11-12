/**
 * lite bundle 방 객체의 방 사진 (`community_messenger_bootstrap_lite_my_rooms_bundle` · 20271114100000).
 * 구 DB(키 없음)·빈 값 → null. 그룹 행은 이 값만 목록 사진으로 쓴다(GROUP HARD LOCK) — group-chat-full-fix-design G3.
 */
export function readLiteBundleRoomAvatarUrl(row: { avatar_url?: unknown } | null | undefined): string | null {
  const v = row?.avatar_url;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
