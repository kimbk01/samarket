/** 홈이 쓰는 분류 목록 — 앱 홈·어드민 「홈 구성」 공용 (서버 `load-home-catalog-server.ts`) */
export type HomeStoreCategory = { slug: string; nameKo: string; nameEn: string; imageUrl: string | null };
export type HomeTradeCategory = { id: string; slug: string; nameKo: string; nameEn: string };
export type HomeCommunityTopic = { slug: string; nameKo: string; nameEn: string };

/** 홈 공지 한 줄 — 어드민 공지(고객센터 「공지사항」) 최신 1건. 제목만(읽음 여부 없음 = 개인 정보 아님) */
export type HomeLatestNotice = { id: string; title: string };

export type HomeCatalog = {
  storeCategories: HomeStoreCategory[];
  tradeCategories: HomeTradeCategory[];
  communityTopics: HomeCommunityTopic[];
  latestNotice: HomeLatestNotice | null;
};

export function homeCatalogName(row: { nameKo: string; nameEn: string }, language: string): string {
  const en = row.nameEn.trim();
  return language === "en" && en ? en : row.nameKo;
}

/** 메뉴 한 개 — 홈 매장 칸 (`GET /api/home/store-menus`) */
export type HomeStoreMenuItem = {
  id: string;
  title: string;
  price: number;
  /** 할인가 (있을 때만) */
  discountPrice: number | null;
  imageUrl: string | null;
};
