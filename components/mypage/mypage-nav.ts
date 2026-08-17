import type { MessageKey } from "@/lib/i18n/messages";
import type { MyPageTabId } from "./types";
import {
  buildMypageItemHref,
  buildMypageSectionHref,
  mapLegacyMyPageItemSlug,
} from "@/lib/mypage/mypage-mobile-nav-registry";

export type MyPageSectionItem = {
  id: string;
  labelKey: MessageKey;
  descriptionKey?: MessageKey;
};

export type MyPageTabNav = {
  id: MyPageTabId;
  labelKey: MessageKey;
  sections: MyPageSectionItem[];
};

export const MYPAGE_NAV: MyPageTabNav[] = [
  {
    id: "account",
    labelKey: "mypage_comp_nav_tab_account_label",
    sections: [
      { id: "home", labelKey: "mypage_comp_nav_sec_account_home_label", descriptionKey: "mypage_comp_nav_sec_account_home_desc" },
      { id: "profile", labelKey: "mypage_comp_nav_sec_account_profile_label", descriptionKey: "mypage_comp_nav_sec_account_profile_desc" },
      { id: "basic", labelKey: "mypage_comp_nav_sec_account_basic_label", descriptionKey: "mypage_comp_nav_sec_account_basic_desc" },
      { id: "favorite-users", labelKey: "mypage_comp_nav_sec_account_favorite_users_label", descriptionKey: "mypage_comp_nav_sec_account_favorite_users_desc" },
      { id: "blocked-users", labelKey: "mypage_comp_nav_sec_account_blocked_users_label", descriptionKey: "mypage_comp_nav_sec_account_blocked_users_desc" },
      { id: "hidden-users", labelKey: "mypage_comp_nav_sec_account_hidden_users_label", descriptionKey: "mypage_comp_nav_sec_account_hidden_users_desc" },
    ],
  },
  {
    id: "trade",
    labelKey: "mypage_comp_nav_tab_trade_label",
    sections: [
      { id: "sales", labelKey: "mypage_comp_nav_sec_trade_sales_label", descriptionKey: "mypage_comp_nav_sec_trade_sales_desc" },
      { id: "favorites", labelKey: "mypage_comp_nav_sec_trade_favorites_label", descriptionKey: "mypage_comp_nav_sec_trade_favorites_desc" },
      { id: "recent", labelKey: "mypage_comp_nav_sec_trade_recent_label", descriptionKey: "mypage_comp_nav_sec_trade_recent_desc" },
      { id: "chat", labelKey: "mypage_comp_nav_sec_trade_chat_label", descriptionKey: "mypage_comp_nav_sec_trade_chat_desc" },
      { id: "reviews", labelKey: "mypage_comp_nav_sec_trade_reviews_label", descriptionKey: "mypage_comp_nav_sec_trade_reviews_desc" },
    ],
  },
  {
    id: "community",
    labelKey: "mypage_comp_nav_tab_community_label",
    sections: [
      { id: "posts", labelKey: "mypage_comp_nav_sec_community_posts_label", descriptionKey: "mypage_comp_nav_sec_community_posts_desc" },
      { id: "comments", labelKey: "mypage_comp_nav_sec_community_comments_label", descriptionKey: "mypage_comp_nav_sec_community_comments_desc" },
      { id: "favorites", labelKey: "mypage_comp_nav_sec_community_favorites_label", descriptionKey: "mypage_comp_nav_sec_community_favorites_desc" },
      { id: "users", labelKey: "mypage_comp_nav_sec_community_users_label", descriptionKey: "mypage_comp_nav_sec_community_users_desc" },
      { id: "reports", labelKey: "mypage_comp_nav_sec_community_reports_label", descriptionKey: "mypage_comp_nav_sec_community_reports_desc" },
    ],
  },
  {
    id: "store",
    labelKey: "mypage_comp_nav_tab_store_label",
    sections: [
      { id: "orders", labelKey: "mypage_comp_nav_sec_store_orders_label", descriptionKey: "mypage_comp_nav_sec_store_orders_desc" },
      { id: "order-chat", labelKey: "mypage_comp_nav_sec_store_order_chat_label", descriptionKey: "mypage_comp_nav_sec_store_order_chat_desc" },
      { id: "payment", labelKey: "mypage_comp_nav_sec_store_payment_label", descriptionKey: "mypage_comp_nav_sec_store_payment_desc" },
      { id: "address", labelKey: "mypage_comp_nav_sec_store_address_label", descriptionKey: "mypage_comp_nav_sec_store_address_desc" },
      { id: "member", labelKey: "mypage_comp_nav_sec_store_member_label", descriptionKey: "mypage_comp_nav_sec_store_member_desc" },
      { id: "rider", labelKey: "mypage_comp_nav_sec_store_rider_label", descriptionKey: "mypage_comp_nav_sec_store_rider_desc" },
    ],
  },
  {
    id: "messenger",
    labelKey: "mypage_comp_nav_tab_messenger_label",
    sections: [
      { id: "dm", labelKey: "mypage_comp_nav_sec_messenger_dm_label", descriptionKey: "mypage_comp_nav_sec_messenger_dm_desc" },
      { id: "groups", labelKey: "mypage_comp_nav_sec_messenger_groups_label", descriptionKey: "mypage_comp_nav_sec_messenger_groups_desc" },
      { id: "chat-settings", labelKey: "mypage_comp_nav_sec_messenger_chat_settings_label", descriptionKey: "mypage_comp_nav_sec_messenger_chat_settings_desc" },
      { id: "alerts", labelKey: "mypage_comp_nav_sec_messenger_alerts_label", descriptionKey: "mypage_comp_nav_sec_messenger_alerts_desc" },
    ],
  },
  {
    id: "settings",
    labelKey: "mypage_comp_nav_tab_settings_label",
    sections: [
      { id: "address", labelKey: "mypage_comp_nav_sec_settings_address_label", descriptionKey: "mypage_comp_nav_sec_settings_address_desc" },
      { id: "device-permissions", labelKey: "mypage_comp_nav_sec_settings_device_permissions_label", descriptionKey: "mypage_comp_nav_sec_settings_device_permissions_desc" },
      { id: "service", labelKey: "mypage_comp_nav_sec_settings_service_label", descriptionKey: "mypage_comp_nav_sec_settings_service_desc" },
      { id: "users", labelKey: "mypage_comp_nav_sec_settings_users_label", descriptionKey: "mypage_comp_nav_sec_settings_users_desc" },
      { id: "region-language", labelKey: "mypage_comp_nav_sec_settings_region_language_label", descriptionKey: "mypage_comp_nav_sec_settings_region_language_desc" },
      { id: "system", labelKey: "mypage_comp_nav_sec_settings_system_label", descriptionKey: "mypage_comp_nav_sec_settings_system_desc" },
      { id: "support", labelKey: "mypage_comp_nav_sec_settings_support_label", descriptionKey: "mypage_comp_nav_sec_settings_support_desc" },
    ],
  },
];

export function getDefaultMyPageLocation(): { tab: MyPageTabId; section: string } {
  return { tab: "account", section: "home" };
}

export function getMyPageTabNav(tab: MyPageTabId): MyPageTabNav {
  return MYPAGE_NAV.find((item) => item.id === tab) ?? MYPAGE_NAV[0];
}

export function normalizeMyPageTab(raw: string | null | undefined): MyPageTabId {
  const matched = MYPAGE_NAV.find((item) => item.id === raw);
  return matched?.id ?? getDefaultMyPageLocation().tab;
}

export function normalizeMyPageSection(
  tab: MyPageTabId,
  raw: string | null | undefined
): string {
  const matched = getMyPageTabNav(tab).sections.find((item) => item.id === raw);
  return matched?.id ?? getMyPageTabNav(tab).sections[0]?.id ?? "";
}

/** 모바일에서 전체 메뉴 목록만 표시할 때 `1` */
export const MYPAGE_MOBILE_NAV_QUERY = "nav";

/** @deprecated 과거 `?tab=&section=` 대신 `/mypage/section/...` 경로로 연결 */
export function buildMyPageHref(tab: MyPageTabId, section?: string): string {
  if (!section || section === "home") {
    return tab === "account" ? "/mypage" : buildMypageSectionHref(tab);
  }
  const normalizedSection = normalizeMyPageSection(tab, section);
  const item = mapLegacyMyPageItemSlug(tab, normalizedSection);
  return buildMypageItemHref(tab, item);
}

/** 모바일 메뉴 목록 전용 URL — 현재는 상위 섹션 목록으로 연결 */
export function buildMyPageMobileMenuHref(
  tab: MyPageTabId,
  section?: string,
): string {
  if (section && section !== "home") {
    const item = mapLegacyMyPageItemSlug(tab, section);
    return buildMypageItemHref(tab, item);
  }
  return buildMypageSectionHref(tab);
}

/** 내정보 콘솔 상단 헤더(제목·부제) — 선택된 하위 메뉴 기준 */
export function resolveMyPageConsoleHeader(
  tab: MyPageTabId,
  section: string,
): { titleKey: MessageKey; subtitleKey?: MessageKey } {
  const tabNav = getMyPageTabNav(tab);
  const sec =
    tabNav.sections.find((item) => item.id === section) ?? tabNav.sections[0];
  if (!sec) {
    return { titleKey: tabNav.labelKey };
  }
  return {
    titleKey: sec.labelKey,
    subtitleKey: sec.descriptionKey,
  };
}
