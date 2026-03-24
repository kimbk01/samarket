/**
 * 카테고리 시스템 타입 (Supabase categories / category_settings)
 * - categories: type, sort_order, is_active 확장
 * - category_settings: 카테고리별 기능 설정
 */

export type CategoryType = "trade" | "service" | "community" | "feature";

/** Quick Create 런처 그룹: content(알바/부동산 등), trade(내 물건/여러 물건 팔기 등) */
export type QuickCreateGroup = "content" | "trade";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  icon_key: string;
  type: CategoryType;
  /** 상위 메뉴(홈 1행) 카테고리 id. 없으면 최상위 칩 */
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  /** 글쓰기 런처 노출 여부 */
  quick_create_enabled: boolean;
  /** content | trade */
  quick_create_group: QuickCreateGroup | null;
  /** 런처 내 정렬 순서 */
  quick_create_order: number;
  /** 홈 상단 카테고리 칩 노출 여부. false면 칩에는 안 보이고 Quick Create(런처)에만 노출 가능 */
  show_in_home_chips: boolean;
}

export interface CategorySettingsRow {
  id: string;
  category_id: string;
  can_write: boolean;
  has_price: boolean;
  has_chat: boolean;
  has_location: boolean;
  /** 직거래 선택 허용 (쓰기 폼) */
  has_direct_deal: boolean;
  /** 나눔 선택 허용 (쓰기 폼, 무료나눔) */
  has_free_share: boolean;
  post_type: string;
  created_at: string;
  updated_at: string;
}

/** 조회 결과: 카테고리 + 설정 한 번에 (settings는 조인 결과 또는 null) */
export interface CategoryWithSettings extends CategoryRow {
  settings: Pick<
    CategorySettingsRow,
    "can_write" | "has_price" | "has_chat" | "has_location" | "has_direct_deal" | "has_free_share" | "post_type"
  > | null;
}

export type CategoryUpdatePayload = Partial<
  Pick<
    CategoryRow,
    | "name"
    | "slug"
    | "icon_key"
    | "type"
    | "parent_id"
    | "sort_order"
    | "is_active"
    | "description"
    | "quick_create_enabled"
    | "quick_create_group"
    | "quick_create_order"
    | "show_in_home_chips"
  >
>;

export type CategorySettingsUpdatePayload = Partial<
  Pick<CategorySettingsRow, "can_write" | "has_price" | "has_chat" | "has_location" | "has_direct_deal" | "has_free_share" | "post_type">
>;
