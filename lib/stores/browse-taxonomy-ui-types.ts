/**
 * 업종 탐색 UI용 타입 — GET `/api/stores/taxonomy` canonical resolver.
 * CUT 1: seed catalog is not merged into HOME/BROWSE chrome.
 */

/** 1차 업종 (store_categories) */
export interface BrowsePrimaryIndustry {
  id: string;
  slug: string;
  nameKo: string;
  nameEn?: string | null;
  sortOrder: number;
  symbol: string;
}

/** 2차 하위 업종 (store_topics) */
export interface BrowseSubIndustry {
  id: string;
  slug: string;
  nameKo: string;
  nameEn?: string | null;
  primarySlug: string;
  sortOrder: number;
  imageUrl?: string | null;
  name_en?: string | null;
}
