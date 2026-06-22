/**
 * 모바일 내정보 계층 네비 — `/mypage/section/[section]/[item]`
 * (데이터 도메인과 맞추기 쉽도록 섹션·항목 id 를 안정적으로 유지)
 */

import type { MessageKey } from "@/lib/i18n/messages";

export {
  MYPAGE_PROFILE_EDIT_HREF,
  MYPAGE_PROFILE_HREF,
  MYPAGE_REQUIRED_DIBAY_ID_HREF,
  MYPAGE_REQUIRED_PHONE_HREF,
  MYPAGE_SETTINGS_HREF,
  MYPAGE_ADDRESSES_HREF,
} from "@/lib/mypage/mypage-profile-routes";

const MYPAGE_PROFILE_SETUP_EDIT_HREF = "/mypage/section/account/profile/edit" as const;

export function isProfileEditPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === MYPAGE_PROFILE_SETUP_EDIT_HREF) return true;
  if (pathname === "/mypage/profile/edit") return true;
  if (pathname === "/mypage/profile") return true;
  return pathname === "/my/edit" || pathname === "/mypage/edit";
}

export const MYPAGE_MOBILE_SECTION_IDS = [
  "account",
  "trade",
  "community",
  "store",
  "messenger",
  "settings",
] as const;

export type MyPageMobileSectionId = (typeof MYPAGE_MOBILE_SECTION_IDS)[number];

export type MyPageMobileItemDef = {
  id: string;
  labelKey: MessageKey;
  descriptionKey?: MessageKey;
};

export type MyPageMobileSectionDef = {
  id: MyPageMobileSectionId;
  labelKey: MessageKey;
  items: MyPageMobileItemDef[];
};

function itemSlug(itemId: string): string {
  return itemId.replace(/-/g, "_");
}

function mypageItemLabelKey(sectionId: string, itemId: string): MessageKey {
  return `mypage_mnav_${sectionId}_${itemSlug(itemId)}` as MessageKey;
}

function mypageItemDescKey(sectionId: string, itemId: string): MessageKey {
  return `mypage_mnav_${sectionId}_${itemSlug(itemId)}_desc` as MessageKey;
}

function mypageSectionLabelKey(sectionId: MyPageMobileSectionId): MessageKey {
  return `mypage_mnav_sec_${sectionId}` as MessageKey;
}

function navItem(sectionId: string, itemId: string, withDesc = true): MyPageMobileItemDef {
  return {
    id: itemId,
    labelKey: mypageItemLabelKey(sectionId, itemId),
    ...(withDesc ? { descriptionKey: mypageItemDescKey(sectionId, itemId) } : {}),
  };
}

export const MYPAGE_MOBILE_NAV: MyPageMobileSectionDef[] = [
  {
    id: "account",
    labelKey: mypageSectionLabelKey("account"),
    items: [
      navItem("account", "profile"),
      navItem("account", "account-info"),
      navItem("account", "favorite-users"),
      navItem("account", "blocked-users"),
      navItem("account", "hidden-users"),
    ],
  },
  {
    id: "trade",
    labelKey: mypageSectionLabelKey("trade"),
    items: [
      navItem("trade", "sales"),
      navItem("trade", "purchases"),
      navItem("trade", "favorites"),
      navItem("trade", "recent"),
      navItem("trade", "trade-chat"),
      navItem("trade", "reviews"),
    ],
  },
  {
    id: "community",
    labelKey: mypageSectionLabelKey("community"),
    items: [
      navItem("community", "posts"),
      navItem("community", "comments"),
      navItem("community", "favorite-posts"),
      navItem("community", "community-friends"),
      navItem("community", "reports"),
    ],
  },
  {
    id: "store",
    labelKey: mypageSectionLabelKey("store"),
    items: [
      navItem("store", "orders"),
      navItem("store", "order-chat"),
      navItem("store", "payment"),
      navItem("store", "address"),
      navItem("store", "rider"),
    ],
  },
  {
    id: "messenger",
    labelKey: mypageSectionLabelKey("messenger"),
    items: [
      navItem("messenger", "dm"),
      navItem("messenger", "groups"),
      navItem("messenger", "friends"),
      navItem("messenger", "chat-alerts"),
    ],
  },
  {
    id: "settings",
    labelKey: mypageSectionLabelKey("settings"),
    items: [
      navItem("settings", "address"),
      navItem("settings", "device-permissions"),
      navItem("settings", "language"),
      navItem("settings", "country"),
      navItem("settings", "region"),
      navItem("settings", "manner"),
      navItem("settings", "chat-settings"),
      navItem("settings", "notifications"),
      navItem("settings", "personalization"),
      navItem("settings", "video-autoplay"),
      navItem("settings", "cache"),
      navItem("settings", "notices"),
      navItem("settings", "events"),
      navItem("settings", "support"),
      navItem("settings", "terms"),
      navItem("settings", "version"),
      navItem("settings", "leave"),
    ],
  },
];

const SECTION_MAP = new Map(MYPAGE_MOBILE_NAV.map((s) => [s.id, s]));

export function findMypageMobileSection(
  raw: string | null | undefined,
): MyPageMobileSectionDef | undefined {
  if (!raw) return undefined;
  return SECTION_MAP.get(raw as MyPageMobileSectionId);
}

export function findMypageMobileItem(
  sectionId: string | null | undefined,
  itemId: string | null | undefined,
): MyPageMobileItemDef | undefined {
  const sec = findMypageMobileSection(sectionId);
  if (!sec || !itemId) return undefined;
  return sec.items.find((i) => i.id === itemId);
}

export function buildMypageSectionHref(sectionId: string): string {
  return `/mypage/section/${encodeURIComponent(sectionId)}`;
}

export function buildMypageItemHref(sectionId: string, itemId: string): string {
  return `/mypage/section/${encodeURIComponent(sectionId)}/${encodeURIComponent(itemId)}`;
}

/** 예전 `?tab=&section=` 쿼리 → 신규 item slug */
export function mapLegacyMyPageItemSlug(tab: string, section: string): string {
  const key = `${tab}:${section}`;
  const map: Record<string, string> = {
    "account:basic": "account-info",
    "community:favorites": "favorite-posts",
    "community:users": "community-friends",
    "trade:chat": "trade-chat",
    "messenger:alerts": "chat-alerts",
    /** 예전 설정 탭(그룹) → 신규 항목 id */
    "settings:region-language": "language",
    "settings:device-permissions": "device-permissions",
    "settings:service": "chat-settings",
    "settings:system": "version",
    "settings:support": "notices",
  };
  return map[key] ?? section;
}
