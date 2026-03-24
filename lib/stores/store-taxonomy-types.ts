export type StoreTaxonomyCategory = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

export type StoreTaxonomyTopic = {
  id: string;
  store_category_id: string;
  name: string;
  slug: string;
  sort_order: number;
};
