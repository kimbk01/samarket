export type StickerPackDto = {
  id: string;
  slug: string;
  name: string;
  iconUrl: string;
  sortOrder: number;
};

export type StickerItemDto = {
  id: string;
  packId: string;
  fileUrl: string;
  keyword: string;
  sortOrder: number;
};
