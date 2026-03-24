/**
 * 설정관리 > 카테고리 관리: 상단 서비스 카테고리 / 하위 운영 카테고리
 * (DB: service_categories, service_subcategories 상정)
 */

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  icon_key: string;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceSubcategory {
  id: string;
  parent_id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export type ServiceCategoryUpdate = Partial<
  Pick<ServiceCategory, "name" | "icon_key" | "sort_order" | "is_active" | "description">
>;
export type ServiceSubcategoryUpdate = Partial<
  Pick<ServiceSubcategory, "name" | "slug" | "sort_order" | "is_active" | "admin_note">
>;
