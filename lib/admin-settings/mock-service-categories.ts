/**
 * 설정관리 > 카테고리 관리 mock (Supabase 연동 시 교체)
 * service_categories / service_subcategories
 */

import type {
  ServiceCategory,
  ServiceSubcategory,
  ServiceCategoryUpdate,
  ServiceSubcategoryUpdate,
} from "@/lib/types/admin-category";

const now = () => new Date().toISOString();

export const MOCK_SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: "sc-all",
    name: "전체",
    slug: "all",
    icon_key: "all",
    sort_order: 0,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "sc-market",
    name: "중고거래",
    slug: "market",
    icon_key: "market",
    sort_order: 1,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "sc-community",
    name: "커뮤니티",
    slug: "community",
    icon_key: "community",
    sort_order: 2,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "sc-car",
    name: "중고차",
    slug: "car",
    icon_key: "car",
    sort_order: 3,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "sc-realty",
    name: "부동산",
    slug: "realty",
    icon_key: "realty",
    sort_order: 4,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "sc-job",
    name: "알바",
    slug: "job",
    icon_key: "job",
    sort_order: 5,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
  },
];

export const MOCK_SERVICE_SUBCATEGORIES: ServiceSubcategory[] = [
  { id: "ss-1", parent_id: "sc-market", name: "디지털기기", slug: "digital", sort_order: 1, is_active: true, admin_note: null, created_at: now(), updated_at: now() },
  { id: "ss-2", parent_id: "sc-market", name: "가구/인테리어", slug: "furniture", sort_order: 2, is_active: true, admin_note: null, created_at: now(), updated_at: now() },
  { id: "ss-3", parent_id: "sc-market", name: "생활가전", slug: "appliances", sort_order: 3, is_active: true, admin_note: null, created_at: now(), updated_at: now() },
  { id: "ss-4", parent_id: "sc-market", name: "남성의류", slug: "men-clothing", sort_order: 4, is_active: true, admin_note: null, created_at: now(), updated_at: now() },
  { id: "ss-5", parent_id: "sc-market", name: "여성의류", slug: "women-clothing", sort_order: 5, is_active: true, admin_note: null, created_at: now(), updated_at: now() },
  { id: "ss-6", parent_id: "sc-job", name: "구인구직", slug: "hiring", sort_order: 1, is_active: true, admin_note: null, created_at: now(), updated_at: now() },
];

let _categories = [...MOCK_SERVICE_CATEGORIES];
let _subcategories = [...MOCK_SERVICE_SUBCATEGORIES];

export function getServiceCategories(): ServiceCategory[] {
  return _categories.slice().sort((a, b) => a.sort_order - b.sort_order);
}

export function getServiceSubcategories(parentId?: string): ServiceSubcategory[] {
  let list = _subcategories.slice();
  if (parentId) list = list.filter((s) => s.parent_id === parentId);
  return list.sort((a, b) => a.sort_order - b.sort_order);
}

export function updateServiceCategory(id: string, update: ServiceCategoryUpdate): ServiceCategory | null {
  const idx = _categories.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  _categories[idx] = { ..._categories[idx], ...update, updated_at: now() };
  return _categories[idx];
}

export function updateServiceSubcategory(id: string, update: ServiceSubcategoryUpdate): ServiceSubcategory | null {
  const idx = _subcategories.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  _subcategories[idx] = { ..._subcategories[idx], ...update, updated_at: now() };
  return _subcategories[idx];
}

export function reorderServiceCategories(orderedIds: string[]): void {
  orderedIds.forEach((id, i) => {
    const c = _categories.find((x) => x.id === id);
    if (c) c.sort_order = i;
  });
  _categories = _categories.slice().sort((a, b) => a.sort_order - b.sort_order);
}

export function reorderServiceSubcategories(parentId: string, orderedIds: string[]): void {
  orderedIds.forEach((id, i) => {
    const s = _subcategories.find((x) => x.id === id && x.parent_id === parentId);
    if (s) s.sort_order = i;
  });
  _subcategories = _subcategories.slice();
}

export function toggleServiceCategoryActive(id: string): ServiceCategory | null {
  const c = _categories.find((x) => x.id === id);
  if (!c) return null;
  c.is_active = !c.is_active;
  c.updated_at = now();
  return c;
}

export function toggleServiceSubcategoryActive(id: string): ServiceSubcategory | null {
  const s = _subcategories.find((x) => x.id === id);
  if (!s) return null;
  s.is_active = !s.is_active;
  s.updated_at = now();
  return s;
}

/** 초기 상태로 되돌림 */
export function resetServiceCategories(): void {
  _categories = [...MOCK_SERVICE_CATEGORIES];
  _subcategories = [...MOCK_SERVICE_SUBCATEGORIES];
}
