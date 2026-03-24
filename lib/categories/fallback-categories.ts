/**
 * Supabase 미연동 시 카테고리 fallback (확장 가능 구조)
 */
import type {
  CategoryWithSettings,
  CategoryRow,
  CategorySettingsRow,
  QuickCreateGroup,
} from "@/lib/types/category";

const now = () => new Date().toISOString();

type FallbackSettings = NonNullable<CategoryWithSettings["settings"]>;

function settings(_categoryId: string, overrides: Partial<FallbackSettings> = {}): FallbackSettings {
  return {
    can_write: true,
    has_price: false,
    has_chat: false,
    has_location: false,
    has_direct_deal: false,
    has_free_share: false,
    post_type: "post",
    ...overrides,
  };
}

const FALLBACK_QUICK = {
  quick_create_enabled: true,
  quick_create_group: null as QuickCreateGroup | null,
  quick_create_order: 0,
  show_in_home_chips: true,
};

const FALLBACK_LIST: CategoryWithSettings[] = [
  {
    id: "cat-trade-1",
    name: "중고거래",
    slug: "market",
    icon_key: "market",
    type: "trade",
    parent_id: null,
    sort_order: 0,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
    ...FALLBACK_QUICK,
    settings: settings("cat-trade-1", { has_price: true, has_chat: true, has_location: true, post_type: "post" }),
  },
  {
    id: "cat-community-1",
    name: "커뮤니티",
    slug: "community",
    icon_key: "community",
    type: "community",
    parent_id: null,
    sort_order: 1,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
    ...FALLBACK_QUICK,
    settings: settings("cat-community-1", { has_price: false, has_chat: true, has_location: false }),
  },
  {
    id: "cat-service-1",
    name: "서비스",
    slug: "service",
    icon_key: "service",
    type: "service",
    parent_id: null,
    sort_order: 2,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
    ...FALLBACK_QUICK,
    settings: settings("cat-service-1", { has_price: false, has_chat: true, has_location: true, post_type: "request" }),
  },
  {
    id: "cat-feature-1",
    name: "알바",
    slug: "job",
    icon_key: "job",
    type: "feature",
    parent_id: null,
    sort_order: 3,
    is_active: true,
    description: null,
    created_at: now(),
    updated_at: now(),
    ...FALLBACK_QUICK,
    settings: settings("cat-feature-1", { can_write: false, post_type: "link" }),
  },
];

let _categories: CategoryWithSettings[] = FALLBACK_LIST.map((c) => ({ ...c, settings: c.settings ? { ...c.settings } : null }));

export function getCategoriesFallback(): CategoryWithSettings[] {
  return _categories.slice().sort((a, b) => a.sort_order - b.sort_order);
}

export function setCategoriesFallback(list: CategoryWithSettings[]): void {
  _categories = list.slice();
}

export function getCategoryByIdFallback(id: string): CategoryWithSettings | null {
  return _categories.find((c) => c.id === id) ?? null;
}

export function updateCategoryFallback(id: string, update: Partial<CategoryRow>): CategoryWithSettings | null {
  const idx = _categories.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  _categories[idx] = { ..._categories[idx], ...update, updated_at: now() };
  return _categories[idx];
}

export function updateCategorySettingsFallback(categoryId: string, update: Partial<FallbackSettings>): void {
  const c = _categories.find((x) => x.id === categoryId);
  if (!c) return;
  c.settings = { ...(c.settings ?? settings(categoryId)), ...update };
}

export function reorderCategoriesFallback(orderedIds: string[]): void {
  orderedIds.forEach((id, i) => {
    const cat = _categories.find((x) => x.id === id);
    if (cat) cat.sort_order = i;
  });
  _categories = _categories.slice().sort((a, b) => a.sort_order - b.sort_order);
}

export function addCategoryFallback(row: Omit<CategoryRow, "id" | "created_at" | "updated_at">, settingsRow: Omit<CategorySettingsRow, "category_id">): CategoryWithSettings {
  const id = `cat-${Date.now()}`;
  const ts = now();
  const newCat: CategoryWithSettings = {
    ...FALLBACK_QUICK,
    ...row,
    id,
    created_at: ts,
    updated_at: ts,
    settings: {
      can_write: settingsRow.can_write,
      has_price: settingsRow.has_price,
      has_chat: settingsRow.has_chat,
      has_location: settingsRow.has_location,
      has_direct_deal: settingsRow.has_direct_deal,
      has_free_share: settingsRow.has_free_share,
      post_type: settingsRow.post_type,
    },
  };
  _categories.push(newCat);
  _categories.sort((a, b) => a.sort_order - b.sort_order);
  return newCat;
}

export function deleteCategoryFallback(id: string): boolean {
  const idx = _categories.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  _categories.splice(idx, 1);
  return true;
}
