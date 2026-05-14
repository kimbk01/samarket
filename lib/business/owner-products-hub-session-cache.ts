/** 상품 허브 클라이언트 — 동일 `storeId` 재진입 시 목록·카테고리를 잠깐 재사용해 첫 페인트를 줄임 */

export type OwnerProductsHubCachedSection = {
  id: string;
  name: string;
  sort_order?: number;
  is_hidden?: boolean;
};

export type OwnerProductsHubCachedProduct = {
  id: string;
  title: string;
  summary?: string | null;
  price: number;
  discount_price?: number | null;
  thumbnail_url?: string | null;
  product_status: string;
  menu_section_id?: string | null;
  store_menu_sections?: OwnerProductsHubCachedSection | OwnerProductsHubCachedSection[] | null;
};

const TTL_MS = 25_000;
const byStore = new Map<
  string,
  { sections: OwnerProductsHubCachedSection[]; products: OwnerProductsHubCachedProduct[]; ts: number }
>();

export function readOwnerProductsHubSessionCache(storeId: string): {
  sections: OwnerProductsHubCachedSection[];
  products: OwnerProductsHubCachedProduct[];
} | null {
  const id = storeId.trim();
  if (!id) return null;
  const row = byStore.get(id);
  if (!row) return null;
  if (Date.now() - row.ts > TTL_MS) {
    byStore.delete(id);
    return null;
  }
  return { sections: row.sections, products: row.products };
}

export function writeOwnerProductsHubSessionCache(
  storeId: string,
  sections: OwnerProductsHubCachedSection[],
  products: OwnerProductsHubCachedProduct[]
): void {
  const id = storeId.trim();
  if (!id) return;
  byStore.set(id, { sections, products, ts: Date.now() });
}

export function clearOwnerProductsHubSessionCache(storeId?: string): void {
  if (storeId?.trim()) byStore.delete(storeId.trim());
  else byStore.clear();
}
