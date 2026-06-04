import { FALLBACK_STICKER_ITEMS, FALLBACK_STICKER_PACKS } from "@/lib/stickers/fallback-sticker-catalog";

/** fallback·DB 시드와 동일한 `/stickers/` 공개 경로 — verify·테스트 SSOT */
export function collectStickerAssetPublicPaths(): string[] {
  const paths = [
    ...FALLBACK_STICKER_PACKS.map((p) => p.iconUrl),
    ...FALLBACK_STICKER_ITEMS.map((i) => i.fileUrl),
  ];
  return [...new Set(paths.filter((p) => p.startsWith("/stickers/")))];
}
