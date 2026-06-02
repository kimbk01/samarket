import type { MessageKey } from "@/lib/i18n/messages";

/** Lucide icon ids used on mypage home menu rows */
export type MypageHomeMenuIconId =
  | "package"
  | "heart"
  | "receipt-text"
  | "book-open"
  | "message-circle"
  | "store"
  | "shopping-bag"
  | "truck"
  | "address-pin"
  | "credit-card"
  | "shield"
  | "bell"
  | "globe"
  | "settings"
  | "help-circle"
  | "user-round"
  | "calendar-days"
  | "users"
  | "user-block"
  | "eye-off"
  | "play-circle"
  | "map-pin"
  | "message-square"
  | "ellipsis-vertical"
  | "trash-2"
  | "info"
  | "hand";

export type MypageHomeLinkMenuItem = {
  kind?: "link";
  href: string;
  titleKey: MessageKey;
  icon: MypageHomeMenuIconId;
  tone?: "default" | "danger";
};

export type MypageHomeAddressMenuItem = {
  kind: "addresses";
  titleKey: MessageKey;
  icon: "address-pin";
};

export type MypageHomeLanguageMenuItem = {
  kind: "language-toggle";
  icon: "languages";
};

export type MypageHomeMenuItemConfig =
  | MypageHomeLinkMenuItem
  | MypageHomeAddressMenuItem
  | MypageHomeLanguageMenuItem;

export const MYPAGE_HOME_QUICK_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/section/trade/sales",
    titleKey: "mypage_comp_menu_trade_active_title",
    icon: "package",
  },
  {
    href: "/mypage/section/trade/favorites",
    titleKey: "mypage_comp_menu_trade_favorites_title",
    icon: "heart",
  },
  {
    href: "/my/offers",
    titleKey: "mypage_comp_menu_trade_offers_title",
    icon: "receipt-text",
  },
  {
    href: "/mypage/section/community/posts",
    titleKey: "mypage_comp_menu_community_posts_title",
    icon: "book-open",
  },
  {
    href: "/mypage/section/community/comments",
    titleKey: "mypage_comp_menu_community_activity_title",
    icon: "message-circle",
  },
];

export const MYPAGE_HOME_STORE_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/stores/owner/apply",
    titleKey: "mypage_comp_menu_store_register_title",
    icon: "store",
  },
  {
    href: "/mypage/section/store/orders",
    titleKey: "mypage_comp_menu_store_order_history_title",
    icon: "shopping-bag",
  },
  {
    href: "/mypage/section/store/rider",
    titleKey: "mypage_comp_menu_store_rider_title",
    icon: "truck",
  },
];

export const MYPAGE_HOME_ACCOUNT_ITEMS: MypageHomeMenuItemConfig[] = [
  {
    kind: "addresses",
    titleKey: "mypage_comp_menu_account_address_title",
    icon: "address-pin",
  },
  {
    href: "/mypage/section/store/payment",
    titleKey: "mypage_comp_menu_account_payment_title",
    icon: "credit-card",
  },
  {
    href: "/mypage/section/settings/device-permissions",
    titleKey: "mypage_comp_menu_account_security_title",
    icon: "shield",
  },
  {
    href: "/mypage/section/settings/notifications",
    titleKey: "mypage_comp_menu_account_notifications_title",
    icon: "bell",
  },
  { kind: "language-toggle", icon: "languages" },
  {
    href: "/mypage/section/settings/country",
    titleKey: "mypage_comp_menu_account_region_title",
    icon: "globe",
  },
];

export const MYPAGE_HOME_SERVICE_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/section/account/favorite-users",
    titleKey: "settings_following_users",
    icon: "users",
  },
  {
    href: "/mypage/section/account/blocked-users",
    titleKey: "settings_blocked_users",
    icon: "user-block",
  },
  {
    href: "/mypage/section/account/hidden-users",
    titleKey: "settings_hidden_users",
    icon: "eye-off",
  },
  {
    href: "/mypage/section/settings/video-autoplay",
    titleKey: "settings_video_autoplay",
    icon: "play-circle",
  },
  {
    href: "/mypage/section/settings/region",
    titleKey: "settings_bulk_region_change",
    icon: "map-pin",
  },
  {
    href: "/mypage/section/settings/chat-settings",
    titleKey: "settings_chat",
    icon: "message-square",
  },
  {
    href: "/mypage/section/settings/personalization",
    titleKey: "settings_personalization",
    icon: "ellipsis-vertical",
  },
  {
    href: "/mypage/section/settings/cache",
    titleKey: "settings_cache_clear",
    icon: "trash-2",
  },
  {
    href: "/mypage/section/settings/version",
    titleKey: "settings_version",
    icon: "info",
  },
  {
    href: "/mypage/section/settings/leave",
    titleKey: "settings_leave",
    icon: "hand",
    tone: "danger",
  },
];

export const MYPAGE_HOME_SUPPORT_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/section/settings/support",
    titleKey: "mypage_comp_menu_support_cs_title",
    icon: "help-circle",
  },
  {
    href: "/mypage/section/settings/notices",
    titleKey: "mypage_comp_menu_support_notices_title",
    icon: "user-round",
  },
  {
    href: "/mypage/section/settings/events",
    titleKey: "mypage_comp_menu_support_events_title",
    icon: "calendar-days",
  },
  {
    href: "/mypage/section/settings/terms",
    titleKey: "mypage_comp_menu_support_terms_title",
    icon: "shield",
  },
];
