import type {
  MypageHomeLinkMenuItem,
  MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-types";
import {
  MYPAGE_HOME_ACCOUNT_HREF,
  MYPAGE_HOME_ACCOUNT_LEAVE_HREF,
  MYPAGE_HOME_RECENT_VIEWED_HREF,
  MYPAGE_HOME_STORE_ORDERS_HREF,
  MYPAGE_HOME_TRADE_FAVORITES_HREF,
  MYPAGE_HOME_TRADE_OFFERS_HREF,
  MYPAGE_HOME_TRADE_REVIEWS_HREF,
  MYPAGE_HOME_TRADE_SALES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";

export type {
  MypageHomeLinkMenuItem,
  MypageHomeAddressMenuItem,
  MypageHomeLanguageMenuItem,
  MypageHomeMenuIconId,
  MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-types";

export { MYPAGE_HOME_QUICK_ITEMS } from "@/lib/mypage/mypage-home-quick-config";

/**
 * Slice 3 IA — 거래 활동 MERGE onto home (Karrot-style activity block).
 * KEEP existing routes; no delete.
 */
export const MYPAGE_HOME_TRADE_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: MYPAGE_HOME_TRADE_SALES_HREF,
    titleKey: "mypage_comp_menu_trade_active_title",
    icon: "package",
  },
  {
    href: TRADE_CHAT_MESSENGER_LIST_HREF,
    titleKey: "nav_trade_hub_chat",
    icon: "shopping-bag",
  },
  {
    href: MYPAGE_HOME_TRADE_FAVORITES_HREF,
    titleKey: "mypage_comp_menu_trade_favorites_title",
    icon: "heart",
  },
  {
    href: MYPAGE_HOME_TRADE_OFFERS_HREF,
    titleKey: "mypage_comp_menu_trade_offers_title",
    icon: "receipt-text",
  },
  {
    href: MYPAGE_HOME_RECENT_VIEWED_HREF,
    titleKey: "mypage_hub_recent_viewed",
    icon: "eye-off",
  },
  {
    href: MYPAGE_HOME_TRADE_REVIEWS_HREF,
    titleKey: "mypage_comp_nav_sec_trade_reviews_label",
    icon: "message-square",
  },
];

/** Store section rows after the owner-entry row (orders / rider) — unchanged by gate. */
export const MYPAGE_HOME_STORE_TAIL_ITEMS: MypageHomeLinkMenuItem[] = [
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

/**
 * Presentation only — does NOT re-implement `getOwnerStoreGateState`.
 * `null` gate (unknown / guest) → apply entry (same as empty).
 */
export type MypageHomeStoreOwnerEntry = MypageHomeLinkMenuItem & {
  /** pending 계열만 — `formatStoreApprovalStatusI18n` 에 넘길 DB status */
  approvalStatusForBadge?: string | null;
};

export function resolveMypageHomeStoreOwnerEntry(
  gate: OwnerStoreGateState | null,
  firstStoreId?: string | null,
): MypageHomeStoreOwnerEntry {
  if (!gate || gate.kind === "empty") {
    return {
      href: OwnerRoutes.apply(),
      titleKey: "mypage_hub_store_apply",
      icon: "store",
    };
  }
  if (gate.kind === "approved") {
    return {
      href: OwnerRoutes.hub(firstStoreId),
      titleKey: "mypage_comp_menu_store_enter_title",
      icon: "store",
    };
  }
  return {
    href: OwnerRoutes.hub(),
    titleKey: "mypage_comp_menu_store_approval_progress_title",
    icon: "store",
    approvalStatusForBadge: gate.approval_status || null,
  };
}

/** @deprecated Prefer `resolveMypageHomeStoreOwnerEntry` + `MYPAGE_HOME_STORE_TAIL_ITEMS`. */
export const MYPAGE_HOME_STORE_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: OwnerRoutes.apply(),
    titleKey: "mypage_hub_store_apply",
    icon: "store",
  },
  ...MYPAGE_HOME_STORE_TAIL_ITEMS,
];

/**
 * Account — security / address / payment / notifications (no leave/logout).
 * Leave + logout live in the danger flow group (see DANGER items export below).
 */
export const MYPAGE_HOME_ACCOUNT_ITEMS: MypageHomeMenuItemConfig[] = [
  {
    href: MYPAGE_HOME_ACCOUNT_HREF,
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

/** Danger — leave (logout is LogoutActionTrigger in UI, not a link row). */
export const MYPAGE_HOME_DANGER_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: MYPAGE_HOME_ACCOUNT_LEAVE_HREF,
    titleKey: "settings_leave",
    icon: "hand",
    tone: "danger",
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
];

/**
 * Support — Customer Center hub only (boards + shortcuts live inside hub).
 * Legacy notices / inquiries / inbox flat rows removed after CS cutover.
 */
export const MYPAGE_HOME_SUPPORT_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/customer-center",
    titleKey: "mypage_comp_menu_support_cs_title",
    icon: "help-circle",
  },
];

/**
 * Policy — terms → privacy → business (scroll foot after support).
 */
export const MYPAGE_HOME_POLICY_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/section/settings/terms",
    titleKey: "mypage_comp_menu_support_terms_title",
    icon: "shield",
  },
  {
    href: "/privacy",
    titleKey: "mypage_comp_settings_privacy_link",
    icon: "shield",
  },
  {
    href: "/business-info",
    titleKey: "mypage_comp_menu_support_business_title",
    icon: "store",
  },
];

/** Flow group ids — menu config / dashboard composer SSOT. */
export type MyPageFlowGroup =
  | "identity"
  | "activity"
  | "store_order"
  | "assets"
  | "account"
  | "service"
  | "support"
  | "policy"
  | "danger";
