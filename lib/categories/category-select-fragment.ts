/**
 * categories + category_settings 조인 시 사용하는 명시 컬럼 목록.
 * `*` 를 쓰지 않아 페이로드·스키마 드리프트·불필요 노출을 줄임.
 */
export const CATEGORY_WITH_SETTINGS_SELECT =
  "id, name, slug, icon_key, type, parent_id, sort_order, is_active, description, quick_create_enabled, quick_create_group, quick_create_order, show_in_home_chips, created_at, updated_at, category_settings(can_write, has_price, has_chat, has_location, has_direct_deal, has_free_share, post_type)";
