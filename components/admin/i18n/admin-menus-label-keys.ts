import type { MessageKey } from "@/lib/i18n/messages";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import {
  MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS,
  type MainBottomNavPresetOption,
} from "@/lib/main-menu/main-bottom-nav-presets";

export const BOTTOM_NAV_ICON_LABEL_KEYS: Record<BottomNavIconKey, MessageKey> = {
  trade: "admin_menu_icon_trade",
  home: "admin_menu_icon_home",
  community: "admin_menu_icon_community",
  stores: "admin_menu_icon_stores",
  chat: "admin_menu_icon_chat",
  my: "admin_menu_icon_my",
  orders: "admin_menu_icon_orders",
  cart: "admin_menu_icon_cart",
  favorites: "admin_menu_icon_favorites",
  owner_hub: "admin_menu_icon_owner_hub",
};

export const BOTTOM_NAV_SAVE_ERROR_KEYS: Record<string, MessageKey> = {
  items_count: "admin_menu_bottom_err_items_count",
  min_one_visible: "admin_menu_bottom_err_min_visible",
  invalid_href: "admin_menu_bottom_err_invalid_href",
  invalid_label: "admin_menu_bottom_err_invalid_label",
  invalid_lucide_icon: "admin_menu_bottom_err_invalid_lucide_icon",
  fab_items_count: "admin_menu_bottom_err_fab_items_count",
  fab_min_one_visible: "admin_menu_bottom_err_fab_min_visible",
  invalid_fab_item: "admin_menu_bottom_err_invalid_fab_item",
  duplicate_fab_id: "admin_menu_bottom_err_invalid_fab_item",
  invalid_json: "admin_menu_bottom_err_save",
  table_missing: "admin_menu_bottom_err_table_missing",
  forbidden: "admin_menu_bottom_err_forbidden",
  supabase_unconfigured: "admin_menu_bottom_err_supabase",
};

export function resolveAdminBottomNavApiError(
  t: (key: MessageKey) => string,
  err: string | undefined,
  fallbackKey: MessageKey
): string {
  if (!err) return t(fallbackKey);
  const hint = BOTTOM_NAV_SAVE_ERROR_KEYS[err];
  return hint ? t(hint) : err;
}

/** MAIN_BOTTOM_NAV_FONT_FAMILY_PRESETS — keyed by preset value */
export const BOTTOM_NAV_FONT_PRESET_KEYS: Record<string, MessageKey> = {
  "": "admin_menu_preset_font_default",
  "font-sans": "admin_menu_preset_font_sans",
  "font-serif": "admin_menu_preset_font_serif",
  "font-mono": "admin_menu_preset_font_mono",
};

/** MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS */
export const BOTTOM_NAV_LABEL_SIZE_PRESET_KEYS: Record<string, MessageKey> = {
  "": "admin_menu_preset_size_default",
  "sam-text-xxs": "admin_menu_preset_size_xxs",
  "text-xs": "admin_menu_preset_size_xs",
  "text-sm": "admin_menu_preset_size_sm",
};

/**
 * 프리셋 값(저장되는 class 문자열)은 `lib/main-menu/main-bottom-nav-presets.ts` 단일 정의 — 여기서는 같은 순서로 라벨 키만 붙인다.
 * (값을 이 파일에 다시 적지 않는다: 프리셋 표와 라벨 표가 어긋나지 않게)
 */
function zipPresetKeys(
  presets: readonly MainBottomNavPresetOption[],
  keys: readonly MessageKey[]
): Record<string, MessageKey> {
  const out: Record<string, MessageKey> = {};
  presets.forEach((p, i) => {
    const key = keys[i];
    if (key) out[p.value] = key;
  });
  return out;
}

/** MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS */
export const BOTTOM_NAV_LABEL_ACTIVE_PRESET_KEYS: Record<string, MessageKey> = zipPresetKeys(
  MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS,
  [
    "admin_menu_preset_label_active_default",
    "admin_menu_preset_label_active_signature_medium",
    "admin_menu_preset_label_active_signature_bold",
    "admin_menu_preset_label_active_gray_medium",
    "admin_menu_preset_label_active_gray_bold",
    "admin_menu_preset_label_active_emerald",
    "admin_menu_preset_label_active_primary",
    "admin_menu_preset_label_active_rose",
  ]
);

/** MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS */
export const BOTTOM_NAV_LABEL_INACTIVE_PRESET_KEYS: Record<string, MessageKey> = zipPresetKeys(
  MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS,
  [
    "admin_menu_preset_label_inactive_default",
    "admin_menu_preset_label_inactive_carrot",
    "admin_menu_preset_label_inactive_400",
    "admin_menu_preset_label_inactive_500",
    "admin_menu_preset_label_inactive_600",
  ]
);

/** MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS */
export const BOTTOM_NAV_ICON_ACTIVE_PRESET_KEYS: Record<string, MessageKey> = zipPresetKeys(
  MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS,
  [
    "admin_menu_preset_icon_active_default",
    "admin_menu_preset_icon_active_signature",
    "admin_menu_preset_icon_active_gray",
    "admin_menu_preset_icon_active_emerald",
    "admin_menu_preset_icon_active_primary",
  ]
);

/** MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS */
export const BOTTOM_NAV_ICON_INACTIVE_PRESET_KEYS: Record<string, MessageKey> = zipPresetKeys(
  MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS,
  [
    "admin_menu_preset_icon_inactive_default",
    "admin_menu_preset_icon_inactive_300",
    "admin_menu_preset_icon_inactive_400",
    "admin_menu_preset_icon_inactive_500",
  ]
);

export function bottomNavPresetLabelKey(
  value: string,
  map: Record<string, MessageKey>,
  fallback: MessageKey = "admin_menu_bottom_preset_custom"
): MessageKey {
  return map[value] ?? fallback;
}
