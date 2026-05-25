import type { MessageKey } from "@/lib/i18n/messages";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";

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
};

export const BOTTOM_NAV_SAVE_ERROR_KEYS: Record<string, MessageKey> = {
  items_count: "admin_menu_bottom_err_items_count",
  min_one_visible: "admin_menu_bottom_err_min_visible",
  invalid_href: "admin_menu_bottom_err_invalid_href",
  invalid_label: "admin_menu_bottom_err_invalid_label",
  invalid_lucide_icon: "admin_menu_bottom_err_invalid_lucide_icon",
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

/** MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS */
export const BOTTOM_NAV_LABEL_ACTIVE_PRESET_KEYS: Record<string, MessageKey> = {
  "": "admin_menu_preset_label_active_default",
  "font-medium text-signature": "admin_menu_preset_label_active_signature_medium",
  "font-semibold text-signature": "admin_menu_preset_label_active_signature_bold",
  "font-medium text-gray-900": "admin_menu_preset_label_active_gray_medium",
  "font-semibold text-gray-900": "admin_menu_preset_label_active_gray_bold",
  "font-medium text-emerald-600": "admin_menu_preset_label_active_emerald",
  "font-medium text-sam-primary": "admin_menu_preset_label_active_primary",
  "font-medium text-rose-600": "admin_menu_preset_label_active_rose",
};

/** MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS */
export const BOTTOM_NAV_LABEL_INACTIVE_PRESET_KEYS: Record<string, MessageKey> = {
  "": "admin_menu_preset_label_inactive_default",
  "text-[#999999]": "admin_menu_preset_label_inactive_carrot",
  "text-gray-400": "admin_menu_preset_label_inactive_400",
  "text-gray-500": "admin_menu_preset_label_inactive_500",
  "text-gray-600": "admin_menu_preset_label_inactive_600",
};

/** MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS */
export const BOTTOM_NAV_ICON_ACTIVE_PRESET_KEYS: Record<string, MessageKey> = {
  "": "admin_menu_preset_icon_active_default",
  "text-signature": "admin_menu_preset_icon_active_signature",
  "text-gray-900": "admin_menu_preset_icon_active_gray",
  "text-emerald-600": "admin_menu_preset_icon_active_emerald",
  "text-sam-primary": "admin_menu_preset_icon_active_primary",
};

/** MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS */
export const BOTTOM_NAV_ICON_INACTIVE_PRESET_KEYS: Record<string, MessageKey> = {
  "": "admin_menu_preset_icon_inactive_default",
  "text-gray-300": "admin_menu_preset_icon_inactive_300",
  "text-gray-400": "admin_menu_preset_icon_inactive_400",
  "text-gray-500": "admin_menu_preset_icon_inactive_500",
};

export function bottomNavPresetLabelKey(
  value: string,
  map: Record<string, MessageKey>,
  fallback: MessageKey = "admin_menu_bottom_preset_custom"
): MessageKey {
  return map[value] ?? fallback;
}
