/**
 * 스티커 메시지 content 검증 — 정적 `/stickers/` 자산만 허용 (임의 URL·경로 조작 차단).
 * Twemoji/OpenMoji 기반 자산은 빌드 스크립트로 이 경로에 둔다.
 */
export function normalizeCommunityMessengerStickerContent(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.includes("..") || t.includes("//")) return null;
  if (!t.startsWith("/stickers/")) return null;
  if (!/\.(webp|png)$/i.test(t)) return null;
  return t;
}

/** 프로필·별칭 아바타 등에 스티커 정적 경로가 들어가면 타임라인에서 말풍선 옆 썸네일로 잘려 보인다 — 아바타 후보에서 제외한다. */
export function isCommunityMessengerStickerPublicPath(raw: string | null | undefined): boolean {
  const t = (raw ?? "").trim();
  return t.startsWith("/stickers/");
}
