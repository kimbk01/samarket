export type StickerPackDto = {
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

export type StickerItemDto = {
  id: string;
  packId: string;
  fileUrl: string;
  keyword: string;
  sortOrder: number;
};
