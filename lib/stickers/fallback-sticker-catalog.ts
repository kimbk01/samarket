/**
 * 스티커 목록 — 운영 DB 에 스티커 표가 없어(2026-11-16 확인) 이 목록이 실제 목록이다(추가 네트워크 없음).
 * 기본·리액션: Twemoji 그림(CC BY 4.0). OpenMoji 7묶음: 생성 파일(CC BY-SA 4.0). 출처는 시트에 `creditKey` 로 표시.
 */
import { OPENMOJI_STICKER_ITEMS, OPENMOJI_STICKER_PACKS } from "@/lib/stickers/openmoji-sticker-packs.generated";

export type FallbackStickerPack = {
  id: string;
  slug: string;
  name: string;
  iconUrl: string;
  sortOrder: number;
  /** 묶음 이름 i18n 키(있으면 name 대신) */
  nameKey?: string;
  /** 그림 출처·라이선스 표시 i18n 키 */
  creditKey?: string;
};

export type FallbackStickerItem = {
  id: string;
  packId: string;
  fileUrl: string;
  keyword: string;
  sortOrder: number;
};

export const FALLBACK_STICKER_PACKS: FallbackStickerPack[] = [
  { id: "fallback-basic", slug: "basic", name: "기본", iconUrl: "/stickers/packs/basic/1f600.webp", sortOrder: 0, creditKey: "cm_ui_sticker_credit_twemoji" },
  { id: "fallback-reaction", slug: "reaction", name: "리액션", iconUrl: "/stickers/packs/reaction/1f44d.webp", sortOrder: 1, creditKey: "cm_ui_sticker_credit_twemoji" },
  ...OPENMOJI_STICKER_PACKS,
];

export const FALLBACK_STICKER_ITEMS: FallbackStickerItem[] = [
  { id: "fb-b-0", packId: "fallback-basic", fileUrl: "/stickers/packs/basic/1f600.webp", keyword: "happy", sortOrder: 0 },
  { id: "fb-b-1", packId: "fallback-basic", fileUrl: "/stickers/packs/basic/1f622.webp", keyword: "sad", sortOrder: 1 },
  { id: "fb-b-2", packId: "fallback-basic", fileUrl: "/stickers/packs/basic/1f620.webp", keyword: "angry", sortOrder: 2 },
  { id: "fb-b-3", packId: "fallback-basic", fileUrl: "/stickers/packs/basic/2764.webp", keyword: "love", sortOrder: 3 },
  { id: "fb-b-4", packId: "fallback-basic", fileUrl: "/stickers/packs/basic/1f923.webp", keyword: "laugh", sortOrder: 4 },
  { id: "fb-b-5", packId: "fallback-basic", fileUrl: "/stickers/packs/basic/1f632.webp", keyword: "surprise", sortOrder: 5 },
  { id: "fb-r-0", packId: "fallback-reaction", fileUrl: "/stickers/packs/reaction/1f44d.webp", keyword: "thumbs_up", sortOrder: 0 },
  { id: "fb-r-1", packId: "fallback-reaction", fileUrl: "/stickers/packs/reaction/1f44f.webp", keyword: "clap", sortOrder: 1 },
  { id: "fb-r-2", packId: "fallback-reaction", fileUrl: "/stickers/packs/reaction/1f525.webp", keyword: "fire", sortOrder: 2 },
  { id: "fb-r-3", packId: "fallback-reaction", fileUrl: "/stickers/packs/reaction/2b50.webp", keyword: "star", sortOrder: 3 },
  { id: "fb-r-4", packId: "fallback-reaction", fileUrl: "/stickers/packs/reaction/1f389.webp", keyword: "party", sortOrder: 4 },
  ...OPENMOJI_STICKER_ITEMS,
];
