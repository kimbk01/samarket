/**
 * 업종 탐색 UI용 타입 (시드 + 어드민/로컬 병합).
 * 매장 목록은 `/api/stores/browse`·홈 피드 등 DB 연동만 사용.
 */

/** 1차 업종 (예: store_categories parent_id null) */
export interface BrowsePrimaryIndustry {
  id: string;
  slug: string;
  nameKo: string;
  sortOrder: number;
  /** 카드용 짧은 표시 (이모지 또는 아이콘 키) */
  symbol: string;
}

/** 2차 하위 업종 */
export interface BrowseSubIndustry {
  id: string;
  slug: string;
  nameKo: string;
  primarySlug: string;
  sortOrder: number;
}
