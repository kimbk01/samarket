export type StoreTaxonomyCategory = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  /** 관리자 화면에서는 전체(숨김 포함) 조회 시 포함될 수 있음 */
  is_active?: boolean;
};

export type StoreTaxonomyTopic = {
  id: string;
  store_category_id: string;
  name: string;
  slug: string;
  sort_order: number;
  /** 관리자 화면에서는 전체(숨김 포함) 조회 시 포함될 수 있음 */
  is_active?: boolean;
};
