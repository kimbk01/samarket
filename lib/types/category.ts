/**
 * 카테고리 시스템 타입 (re-export from lib/categories/types)
 * - categories: type, sort_order, is_active 확장
 * - category_settings: can_write, has_price, has_chat, has_location, post_type
 */
export type {
  CategoryType,
  QuickCreateGroup,
  CategoryRow,
  CategorySettingsRow,
  CategoryWithSettings,
  CategoryUpdatePayload,
  CategorySettingsUpdatePayload,
} from "@/lib/categories/types";

import type { CategoryType } from "@/lib/categories/types";
import { categoryTypeLabel, tradeSkinLabel } from "@/lib/types/category-label-i18n";

export {
  categoryTypeLabel,
  tradeSkinLabel,
  MENU_TYPE_OPTIONS,
  TRADE_SUBTYPE_OPTIONS,
  COMMUNITY_SKIN_OPTIONS,
  POST_TYPE_OPTIONS,
  categoryOptionLabel,
} from "@/lib/types/category-label-i18n";

/** @deprecated use `categoryTypeLabel` */
export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  trade: categoryTypeLabel("trade"),
  service: categoryTypeLabel("service"),
  community: categoryTypeLabel("community"),
  feature: categoryTypeLabel("feature"),
};

export const TRADE_SUBTYPE_PRESET_VALUES = [
  "general",
  "used-car",
  "real-estate",
  "jobs",
  "exchange",
  "rent-car",
];

/** @deprecated use `tradeSkinLabel` */
export const TRADE_SKIN_LABELS: Record<string, string> = {
  general: tradeSkinLabel("general"),
  "used-car": tradeSkinLabel("used-car"),
  "real-estate": tradeSkinLabel("real-estate"),
  jobs: tradeSkinLabel("jobs"),
  exchange: tradeSkinLabel("exchange"),
  "rent-car": tradeSkinLabel("rent-car"),
};

/** 타입 선택 시 폼에 자동 반영할 기능 기본값 (관리자가 수정 가능) */
export const CATEGORY_TYPE_DEFAULT_SETTINGS: Record<
  CategoryType,
  { can_write: boolean; has_price: boolean; has_chat: boolean; has_location: boolean; post_type: string }
> = {
  trade: { can_write: true, has_price: true, has_chat: true, has_location: true, post_type: "normal" },
  community: { can_write: true, has_price: false, has_chat: false, has_location: true, post_type: "community" },
  service: { can_write: true, has_price: false, has_chat: true, has_location: true, post_type: "service_request" },
  feature: { can_write: false, has_price: false, has_chat: false, has_location: false, post_type: "feature" },
};
