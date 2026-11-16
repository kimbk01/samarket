/**
 * D8(2026-11-16): 스티커 보내기 서버 검사 — 경로 형식(`/stickers/…webp`)만 보던 것을 실제 스티커 목록과 대조.
 * 목록 밖 경로(없는 파일 포함)는 거부한다. 운영 DB 에 스티커 표가 없어 코드 목록이 실제 목록이다.
 * 서버 전용(목록 전체를 들고 있어 화면 번들에 넣지 않는다).
 */
import { FALLBACK_STICKER_ITEMS, FALLBACK_STICKER_PACKS } from "@/lib/stickers/fallback-sticker-catalog";

let catalogPaths: Set<string> | null = null;

export function isCatalogStickerPath(path: string): boolean {
  if (!catalogPaths) {
    catalogPaths = new Set([...FALLBACK_STICKER_ITEMS.map((i) => i.fileUrl), ...FALLBACK_STICKER_PACKS.map((p) => p.iconUrl)]);
  }
  return catalogPaths.has(path.trim());
}
