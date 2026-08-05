import type {
  MypageHomeLinkMenuItem,
  MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-types";
import { MYPAGE_HOME_STORE_ORDERS_HREF } from "@/lib/mypage/mypage-home-hub-links";

export type {
  MypageHomeLinkMenuItem,
  MypageHomeAddressMenuItem,
  MypageHomeLanguageMenuItem,
  MypageHomeMenuIconId,
  MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-types";

export { MYPAGE_HOME_QUICK_ITEMS } from "@/lib/mypage/mypage-home-quick-config";

export const MYPAGE_HOME_STORE_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/stores/owner/apply",
    titleKey: "mypage_comp_menu_store_register_title",
    icon: "store",
  },
  {
    href: MYPAGE_HOME_STORE_ORDERS_HREF,
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
    href: "/mypage/account",
    titleKey: "mypage_settings_account",
    icon: "user-round",
  },
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

/**
 * 고객지원 섹션 — 당근형: 공지 → 고객센터(풀페이지 허브) → 문의 → 쪽지 → 약관.
 * DO NOT: sheet hub · FAQ/Event 가짜 행 · CS stub `/section/settings/support`.
 */
export const MYPAGE_HOME_SUPPORT_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/section/settings/notices",
    titleKey: "mypage_comp_menu_support_notices_title",
    icon: "book-open",
  },
  {
    href: "/mypage/customer-center",
    titleKey: "mypage_comp_menu_support_cs_title",
    icon: "help-circle",
  },
  {
    href: "/mypage/inquiries",
    titleKey: "mypage_comp_menu_support_inquiries_title",
    icon: "message-square",
  },
  {
    href: "/mypage/inbox",
    titleKey: "mypage_comp_menu_support_inbox_title",
    icon: "message-circle",
  },
  {
    href: "/mypage/section/settings/terms",
    titleKey: "mypage_comp_menu_support_terms_title",
    icon: "shield",
  },
];
