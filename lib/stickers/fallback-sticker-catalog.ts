/** DB 비어 있거나 로컬 개발 시 1회 응답용(추가 네트워크 없음). Twemoji 코드포인트 파일명 — MIT */
export type FallbackStickerPack = {
  id: string;
  slug: string;
  name: string;
  iconUrl: string;
  sortOrder: number;
};

export type FallbackStickerItem = {
  id: string;
  packId: string;
  fileUrl: string;
  keyword: string;
  sortOrder: number;
};

export const FALLBACK_STICKER_PACKS: FallbackStickerPack[] = [
  { id: "fallback-basic", slug: "basic", name: "기본", iconUrl: "/stickers/packs/basic/1f600.webp", sortOrder: 0 },
  { id: "fallback-reaction", slug: "reaction", name: "리액션", iconUrl: "/stickers/packs/reaction/1f44d.webp", sortOrder: 1 },
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
];
