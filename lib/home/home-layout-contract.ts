/**
 * 앱 홈(`/`·`/home`) 구성 — 단일 정의 (홈 시안 v4 · Owner 「이 시안으로 진행」 2026-11-14,
 * 시안 `docs/design/home-lounge-label-mockup-2026-11-14.html`. 이전 = 홈 시안 v22 2026-11-09).
 *
 * 홈이 있는 이유 3가지: ① 서비스 입구(핵심 telRING 을 맨 위 대표 칸) ② 운영자 소식(어드민 배너·공지 한 줄)
 * ③ 지금 동네에서 볼 거리(공개 거래·글·매장·모임을 섞은 한 줄기 피드). 검색창·개인 정보 칸은 두지 않는다
 * (지역이 같으면 모두 같은 화면 — 개인 조회를 기다리지 않음). 칸 순서는 코드 고정, 어드민은 보이기·피드 구성만 정한다.
 *
 * - 어드민 「홈 구성」(`/admin/menus/home-layout`) 이 저장하는 값과 앱 홈이 읽는 값의 모양이 같다.
 * - 저장 위치: `admin_settings` 키 `home_layout` (`value_json` = {@link HomeLayoutConfig}, schemaVersion 2).
 * - 칸의 내용·순서·개수·문구·그림은 코드에 박지 않고 여기 모양으로 어드민이 정한다.
 *   코드가 고정하는 것: 디자인 규칙(4px·색·글자), 바뀌는 때(새로고침·재접속), 배달 판정(배달 탭과 같은 판정), 비로그인 규정(S-07).
 * - 메뉴는 아래 카탈로그 안에서만 고른다. 모임(moim)은 2026-11-14 추가.
 * - 저장값이 없거나 깨졌으면 {@link DEFAULT_HOME_LAYOUT} 을 쓴다. 예전 schemaVersion 1 저장값은 운영에 없었다(2026-11-09 조회 0행).
 */

import { CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import type { RequireAuthActionType } from "@/lib/auth/require-auth-action";
import type { MessageKey } from "@/lib/i18n/message-key";
import { homeHubMessages } from "@/lib/i18n/catalog/home-hub";

export const HOME_LAYOUT_SETTINGS_KEY = "home_layout" as const;
export const HOME_LAYOUT_SERVER_CACHE_TAG = "home-layout" as const;
export const HOME_LAYOUT_SCHEMA_VERSION = 2 as const;

/* ───────────────────────── 문구 (한/영) ───────────────────────── */

/** 어드민이 쓰는 문구 — 영어가 비면 한국어를 보여 준다 */
export type HomeText = { ko: string; en: string };

const EMPTY = "";
export function emptyHomeText(): HomeText {
  return { ko: EMPTY, en: EMPTY };
}

type HomeHubKey = keyof typeof homeHubMessages.ko;

/** 카탈로그 문구로 기본값 만들기 (코드에 문구를 직접 쓰지 않음) */
function catalogText(key: HomeHubKey): HomeText {
  return { ko: homeHubMessages.ko[key], en: homeHubMessages.en[key] };
}

export function pickHomeText(text: HomeText | null | undefined, language: string): string {
  if (!text) return EMPTY;
  const en = text.en.trim();
  const ko = text.ko.trim();
  const v = language === "en" ? en : ko;
  return v || ko || en;
}

function normalizeText(raw: unknown, max: number): HomeText {
  if (!isRecord(raw)) return emptyHomeText();
  return {
    ko: String(raw.ko ?? EMPTY).trim().slice(0, max),
    en: String(raw.en ?? EMPTY).trim().slice(0, max),
  };
}

/* ───────────────────────── 메뉴 카탈로그 ───────────────────────── */

export const HOME_MENU_KEYS = [
  "trade",
  "stores",
  "philife",
  "moim",
  "chat",
  "events",
  "orders",
  "points",
  "favorites",
  "support",
  "all",
] as const;
export type HomeMenuKey = (typeof HOME_MENU_KEYS)[number];

export type HomeMenuDef = {
  key: HomeMenuKey;
  labelKey: MessageKey;
  /** 서비스 카드 설명 줄 기본값(자동 설명이 없는 메뉴) */
  descKey: MessageKey;
  href: string;
  /** 비로그인이 누르면 로그인 안내 — 기존 `requireAuthAction` 동작 이름만 */
  guestAuthAction: Extract<RequireAuthActionType, "messenger_open" | "delivery_order" | "trade_favorite"> | null;
};

export const HOME_MENU_CATALOG: Readonly<Record<HomeMenuKey, HomeMenuDef>> = {
  trade: { key: "trade", labelKey: "home_menu_trade", descKey: "home_menu_desc_trade", href: "/market", guestAuthAction: null },
  stores: { key: "stores", labelKey: "home_menu_stores", descKey: "home_menu_desc_stores", href: "/stores", guestAuthAction: null },
  philife: {
    key: "philife",
    labelKey: "home_menu_philife",
    descKey: "home_menu_desc_philife",
    href: "/philife",
    guestAuthAction: null,
  },
  moim: { key: "moim", labelKey: "moim_tab", descKey: "home_menu_desc_moim", href: "/moim", guestAuthAction: null },
  chat: {
    key: "chat",
    labelKey: "home_menu_chat",
    descKey: "home_menu_desc_chat",
    href: "/community-messenger?section=chats",
    guestAuthAction: "messenger_open",
  },
  events: { key: "events", labelKey: "home_menu_events", descKey: "home_menu_desc_events", href: "/events", guestAuthAction: null },
  orders: {
    key: "orders",
    labelKey: "home_menu_orders",
    descKey: "home_menu_desc_orders",
    href: "/orders",
    guestAuthAction: "delivery_order",
  },
  points: { key: "points", labelKey: "home_menu_points", descKey: "home_menu_desc_points", href: "/mypage/points", guestAuthAction: null },
  favorites: {
    key: "favorites",
    labelKey: "home_menu_favorites",
    descKey: "home_menu_desc_favorites",
    href: MYPAGE_TRADE_FAVORITES_HREF,
    guestAuthAction: "trade_favorite",
  },
  support: {
    key: "support",
    labelKey: "home_menu_support",
    descKey: "home_menu_desc_support",
    href: CUSTOMER_CENTER_HREF,
    guestAuthAction: null,
  },
  all: { key: "all", labelKey: "home_menu_all", descKey: "home_menu_desc_all", href: "/services", guestAuthAction: null },
};

/* ───────────────────────── 칸 ───────────────────────── */

/**
 * 칸 — 상단(로고·주소·종)은 늘 맨 위라 목록에 없다. 순서 = 이 배열 순서로 고정(홈 시안 v4).
 * services 서비스 입구(telRING 대표 칸 · 큰 칸 · 작은 아이콘) · banner 어드민 배너 · notice 공지 한 줄 ·
 * feed 지금 우리 동네(거래·정보 공유·DIPICK 매장·모임 섞은 피드 — 구성 = trades·posts·stores 설정)
 */
export const HOME_SECTION_KEYS = ["services", "banner", "notice", "feed"] as const;
export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export const HOME_SECTION_LABEL_KEYS: Readonly<Record<HomeSectionKey, MessageKey>> = {
  services: "home_section_services",
  banner: "home_section_banner",
  notice: "home_section_notice",
  feed: "home_section_feed",
};

/** 화면에 제목 줄이 있는 칸 — 어드민이 제목을 바꿀 수 있다(비우면 기본 제목) */
export const HOME_SECTIONS_WITH_TITLE: ReadonlySet<HomeSectionKey> = new Set(["feed"]);

/** 칸 제목 기본 문구 */
export const HOME_SECTION_DEFAULT_TITLE_KEYS: Readonly<Partial<Record<HomeSectionKey, MessageKey>>> = {
  feed: "home_title_feed",
};

/** 비로그인에게 절대 보이지 않는 칸 (개인 정보) — v4 홈은 개인 정보 칸이 없다 */
export const HOME_SECTIONS_MEMBER_ONLY: ReadonlySet<HomeSectionKey> = new Set<HomeSectionKey>();

export type HomeSectionConfig = {
  key: HomeSectionKey;
  visible: boolean;
  guestVisible: boolean;
  /** 칸 제목 — 비우면 기본 제목 ({@link HOME_SECTION_DEFAULT_TITLE_KEYS}) */
  title: HomeText;
};

export const HOME_SECTION_TITLE_MAX = 24;

/* ───────────────────────── 상단 (주소·검색) ───────────────────────── */

export type HomeHeaderConfig = {
  showAddress: boolean;
  /** 옛 검색창 안내 문구 — v4 홈은 검색창이 없어 쓰지 않는다(저장값 호환용으로만 유지) */
  searchPlaceholder: HomeText;
};
export const HOME_SEARCH_PLACEHOLDER_MAX = 30;

/* ───────────────────────── 배너 ───────────────────────── */

export const HOME_BANNER_RATIOS = ["1:1", "4:3", "3:4", "16:9"] as const;
export type HomeBannerRatio = (typeof HOME_BANNER_RATIOS)[number];

/** CSS aspect-ratio 값 */
export const HOME_BANNER_RATIO_CSS: Readonly<Record<HomeBannerRatio, string>> = {
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
};

/** 비율별 이미지 규격 — 권장·최소 px (올리기 검사·어드민 안내에 같은 값) */
export const HOME_BANNER_IMAGE_PX: Readonly<
  Record<HomeBannerRatio, { w: number; h: number; minW: number; minH: number }>
> = {
  "1:1": { w: 720, h: 720, minW: 480, minH: 480 },
  "4:3": { w: 960, h: 720, minW: 640, minH: 480 },
  "3:4": { w: 720, h: 960, minW: 480, minH: 640 },
  "16:9": { w: 1280, h: 720, minW: 854, minH: 480 },
};

/** 올린 이미지 비율 허용 오차 (±2%) */
export const HOME_IMAGE_RATIO_TOLERANCE = 0.02;
export const HOME_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const HOME_BANNER_SIZES = ["s", "m", "l"] as const;
export type HomeBannerSize = (typeof HOME_BANNER_SIZES)[number];
/** 이미지 폭 = 화면 폭 × % (네이버 실측 30% = 보통). 최소·최대 px 고정 */
export const HOME_BANNER_SIZE_PERCENT: Readonly<Record<HomeBannerSize, number>> = { s: 24, m: 30, l: 38 };
export const HOME_BANNER_IMAGE_MIN_PX = 96;
export const HOME_BANNER_IMAGE_MAX_PX = 220;

export const HOME_BANNER_TITLE_SIZES = ["s", "m", "l"] as const;
export type HomeBannerTitleSize = (typeof HOME_BANNER_TITLE_SIZES)[number];
/** 제목 글자 px — 보통 16.5 = 네이버 홈 배너 제목 실측 */
export const HOME_BANNER_TITLE_PX: Readonly<Record<HomeBannerTitleSize, number>> = { s: 15, m: 16.5, l: 19 };

export const HOME_AUDIENCES = ["all", "member", "guest"] as const;
export type HomeAudience = (typeof HOME_AUDIENCES)[number];

export type HomeBannerConfig = {
  id: string;
  imageUrl: string;
  ratio: HomeBannerRatio;
  size: HomeBannerSize;
  side: "left" | "right";
  titleSize: HomeBannerTitleSize;
  title: HomeText;
  body: HomeText;
  /** 앱 안 경로(`/…`)만. 비우면 누르지 않음 */
  href: string;
  audience: HomeAudience;
  visible: boolean;
  /** 유료 광고면 「광고」 표기 (광고 표면 SSOT §3) — 운영자 자체 안내는 끔 */
  adLabel: boolean;
};

export const HOME_BANNER_TITLE_MAX = 30;
export const HOME_BANNER_BODY_MAX = 40;
export const HOME_BANNERS_MAX = 10;

/* ───────────────────────── 서비스 카드 ───────────────────────── */

export type HomeServiceKey = Exclude<HomeMenuKey, "all">;
/** 서비스 카드로 쓸 수 있는 메뉴 (전체 메뉴는 카드 아님) */
export const HOME_SERVICE_KEYS: readonly HomeServiceKey[] = HOME_MENU_KEYS.filter(
  (k): k is HomeServiceKey => k !== "all"
);

export type HomeServiceCardConfig = {
  key: HomeServiceKey;
  size: "large" | "small";
  /** 비우면 메뉴 이름 */
  title: HomeText;
  /** auto = 거래는 거래 카테고리, 배달은 매장 업종에서 자동 · 그 밖은 기본 설명 / custom = 아래 desc */
  descMode: "auto" | "custom";
  desc: HomeText;
  /** 큰 카드 그림 (정사각 투명 PNG 권장). 비우면 자동(배달 = 첫 업종 그림, 그 밖 = 선 아이콘) */
  imageUrl: string;
  visible: boolean;
  /** 채팅 카드 안 읽음 숫자 */
  showBadge: boolean;
};

/** 저장값이 생긴 뒤 카탈로그에 추가된 서비스 — 저장값에 없으면 기본 보이기로 붙인다 */
export const HOME_SERVICE_KEYS_ADDED_LATER: ReadonlySet<HomeServiceKey> = new Set<HomeServiceKey>(["moim"]);

export const HOME_SERVICE_TITLE_MAX = 10;
export const HOME_SERVICE_DESC_MAX = 30;
export const HOME_SERVICE_LARGE_MAX = 4;
export const HOME_SERVICE_SMALL_MAX = 6;
export const HOME_SERVICE_IMAGE_PX = { w: 330, h: 330, minW: 160, minH: 160 } as const;

/* ───────────────────────── 배달 업종 줄 ───────────────────────── */

export type HomeCategoriesConfig = {
  /** row = 한 줄 가로 넘김(기본) · grid = 두 줄 */
  layout: "row" | "grid";
  /** 보일 업종 slug 순서. 비우면 운영 업종 전체(업종 관리 순서) */
  slugs: string[];
};

/* ───────────────────────── 지금 주문할 수 있는 매장 ───────────────────────── */

export type HomeStorePick = {
  storeId: string;
  /** auto = 대표·추천 메뉴 순 · manual = productIds */
  menuMode: "auto" | "manual";
  productIds: string[];
  /** 매장이 돈 내고 올린 경우만 「광고」 */
  adLabel: boolean;
};

export const HOME_STORE_AUTO_FILTERS = ["all", "recent_orders", "newest"] as const;
export type HomeStoreAutoFilter = (typeof HOME_STORE_AUTO_FILTERS)[number];

export type HomeStoresConfig = {
  /** manual = 운영자가 고른 후보 · auto = 조건으로 후보 */
  mode: "manual" | "auto";
  picks: HomeStorePick[];
  /** auto: 업종 slug (비우면 전체) */
  autoCategorySlugs: string[];
  /** auto: all 전체 · recent_orders 최근 30일 주문 있는 매장 · newest 새로 연 순 */
  autoFilter: HomeStoreAutoFilter;
  /** 한 번에 보일 매장 수 */
  showCount: number;
  /** 매장당 메뉴 수 */
  menusPerStore: number;
};

export const HOME_STORE_PICKS_MAX = 20;
export const HOME_STORE_MANUAL_MENUS_MAX = 6;
export const HOME_STORE_SHOW_MIN = 2;
export const HOME_STORE_SHOW_MAX = 5;
export const HOME_STORE_MENUS_MIN = 3;
export const HOME_STORE_MENUS_MAX = 6;

/* ───────────────────────── 방금 올라온 거래 ───────────────────────── */

export type HomeTradesConfig = {
  count: number;
  /** 거래 1차 카테고리 id (비우면 전체) */
  tradeCategoryId: string;
  sort: "latest" | "popular";
};
export const HOME_TRADES_MIN = 4;
export const HOME_TRADES_MAX = 10;
/** 최근 7일 글을 먼저 (모자라면 오래된 글로 채움) */
export const HOME_TRADES_RECENT_DAYS = 7;

/* ───────────────────────── 교민 이야기 ───────────────────────── */

export const HOME_POST_SORTS = ["latest", "popular", "recommended"] as const;
export type HomePostSortKey = (typeof HOME_POST_SORTS)[number];

export type HomePostsConfig = {
  count: number;
  /** 정보교환 주제 slug (비우면 전체) */
  topicSlug: string;
  sort: HomePostSortKey;
};
export const HOME_POSTS_MIN = 3;
export const HOME_POSTS_MAX = 10;

/* ───────────────────────── 작은 바로가기 ───────────────────────── */

export type HomeShortcutConfig = { key: HomeMenuKey; visible: boolean };
export const HOME_SHORTCUTS_MAX_VISIBLE = 5;

/* ───────────────────────── 전체 ───────────────────────── */

export type HomeLayoutConfig = {
  schemaVersion: typeof HOME_LAYOUT_SCHEMA_VERSION;
  sections: HomeSectionConfig[];
  header: HomeHeaderConfig;
  banners: HomeBannerConfig[];
  services: HomeServiceCardConfig[];
  categories: HomeCategoriesConfig;
  stores: HomeStoresConfig;
  trades: HomeTradesConfig;
  posts: HomePostsConfig;
  shortcuts: HomeShortcutConfig[];
};

function section(key: HomeSectionKey, visible = true): HomeSectionConfig {
  return { key, visible, guestVisible: !HOME_SECTIONS_MEMBER_ONLY.has(key), title: emptyHomeText() };
}

function sampleBanner(
  id: string,
  image: string,
  side: "left" | "right",
  titleKey: HomeHubKey,
  bodyKey: HomeHubKey,
  href: string
): HomeBannerConfig {
  return {
    id,
    imageUrl: image,
    ratio: "1:1",
    size: "m",
    side,
    titleSize: "m",
    title: catalogText(titleKey),
    body: catalogText(bodyKey),
    href,
    audience: "all",
    visible: true,
    adLabel: false,
  };
}

function serviceCard(key: HomeServiceKey, size: "large" | "small", visible = true): HomeServiceCardConfig {
  return {
    key,
    size,
    title: emptyHomeText(),
    descMode: "auto",
    desc: emptyHomeText(),
    imageUrl: EMPTY,
    visible,
    showBadge: key === "chat",
  };
}

export const DEFAULT_HOME_LAYOUT: HomeLayoutConfig = {
  schemaVersion: HOME_LAYOUT_SCHEMA_VERSION,
  sections: HOME_SECTION_KEYS.map((k) => section(k)),
  header: { showAddress: true, searchPlaceholder: emptyHomeText() },
  /** 기본 배너 3개 — Owner 제공 이미지(메신저·거래·배달, 2026-11-09). 어드민에서 바꾸거나 끈다 */
  banners: [
    sampleBanner(
      "dibay-messenger",
      "/images/home-banners/messenger.webp",
      "left",
      "home_banner_messenger_title",
      "home_banner_messenger_body",
      "/community-messenger?section=chats"
    ),
    sampleBanner(
      "dibay-trade",
      "/images/home-banners/trade.webp",
      "right",
      "home_banner_trade_title",
      "home_banner_trade_body",
      "/market"
    ),
    sampleBanner(
      "dibay-delivery",
      "/images/home-banners/delivery.webp",
      "left",
      "home_banner_delivery_title",
      "home_banner_delivery_body",
      "/stores"
    ),
  ],
  services: [
    serviceCard("trade", "large"),
    serviceCard("stores", "large"),
    serviceCard("philife", "small"),
    serviceCard("moim", "small"),
    serviceCard("chat", "small"),
    serviceCard("events", "small"),
    serviceCard("orders", "small", false),
    serviceCard("points", "small", false),
    serviceCard("favorites", "small", false),
    serviceCard("support", "small", false),
  ],
  categories: { layout: "row", slugs: [] },
  stores: {
    mode: "auto",
    picks: [],
    autoCategorySlugs: [],
    autoFilter: "all",
    showCount: 3,
    menusPerStore: 4,
  },
  trades: { count: 10, tradeCategoryId: EMPTY, sort: "latest" },
  /** 피드의 정보 공유 글 — 라운지 최신순과 겹치지 않게 인기순 (홈 시안 v4) */
  posts: { count: 4, topicSlug: EMPTY, sort: "popular" },
  shortcuts: [
    { key: "orders", visible: true },
    { key: "points", visible: true },
    { key: "favorites", visible: true },
    { key: "support", visible: true },
    { key: "all", visible: true },
    { key: "trade", visible: false },
    { key: "stores", visible: false },
    { key: "philife", visible: false },
    { key: "chat", visible: false },
    { key: "events", visible: false },
  ],
};

/* ───────────────────────── 정규화 ───────────────────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(String(raw)) ? (raw as T) : fallback;
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  if (raw == null || raw === EMPTY || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanIdList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const s = String(v ?? EMPTY).trim();
    if (!s || s.length > 80 || out.includes(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const SAME_ORIGIN_PROBE = "https://home-href.invalid";
/** 경로를 흐리는 글자 — 역슬래시(`/\\host` 는 브라우저가 `//host` 로 읽음)·제어문자·공백 */
const AMBIGUOUS_PATH_CHARS = /[\\\s\u0000-\u001f\u007f]/;

/**
 * 앱 안 경로만 (`/…`) — 바깥 사이트 주소는 받지 않는다 (Owner 시안 v22).
 * `//host`·`/\\host`·제어문자는 거절하고, 최종으로 같은 사이트로 풀리는지 확인한다 (감사 E7 2026-11-09).
 */
export function isSafeHomeHref(href: string): boolean {
  const h = href.trim();
  if (!h) return true;
  if (!h.startsWith("/") || h.startsWith("//") || AMBIGUOUS_PATH_CHARS.test(h)) return false;
  try {
    return new URL(h, SAME_ORIGIN_PROBE).origin === SAME_ORIGIN_PROBE;
  } catch {
    return false;
  }
}

/** 어드민 올리기 저장소(공개 버킷) 경로 — 올리기 API 와 같은 값 */
export const HOME_UPLOAD_BUCKET = "admin-notification-campaign-images" as const;

function supabaseOrigin(): string | null {
  const raw = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined)?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * 배너·카드 이미지 — 앱 정적 경로(`/images/…`) 또는 어드민이 올린 공개 버킷 주소만 (감사 2026-11-09: 아무 https 허용 금지).
 */
export function isSafeHomeImageUrl(url: string): boolean {
  const u = url.trim();
  if (!u || AMBIGUOUS_PATH_CHARS.test(u)) return false;
  if (u.startsWith("/images/")) return !u.includes("..");
  const origin = supabaseOrigin();
  if (!origin) return false;
  try {
    const parsed = new URL(u);
    return (
      parsed.protocol === "https:" &&
      parsed.origin === origin &&
      parsed.pathname.startsWith(`/storage/v1/object/public/${HOME_UPLOAD_BUCKET}/`) &&
      !parsed.pathname.includes("..")
    );
  } catch {
    return false;
  }
}

function normalizeSections(raw: unknown): HomeSectionConfig[] {
  const stored = new Map<HomeSectionKey, Record<string, unknown>>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) continue;
      const key = item.key as HomeSectionKey;
      if (!(HOME_SECTION_KEYS as readonly string[]).includes(key) || stored.has(key)) continue;
      stored.set(key, item);
    }
  }
  // 순서는 코드 고정(홈 시안 v4) — 저장 순서·옛 칸(ongoing·categories·stores·trades·posts·shortcuts)은 쓰지 않는다.
  return DEFAULT_HOME_LAYOUT.sections.map((d) => {
    const item = stored.get(d.key);
    if (!item) return { ...d, title: { ...d.title } };
    return {
      key: d.key,
      visible: item.visible !== false,
      guestVisible: HOME_SECTIONS_MEMBER_ONLY.has(d.key) ? false : item.guestVisible !== false,
      title: normalizeText(item.title, HOME_SECTION_TITLE_MAX),
    };
  });
}

function normalizeBanner(item: Record<string, unknown>): HomeBannerConfig | null {
  const id = String(item.id ?? EMPTY).trim().slice(0, 60);
  const imageUrl = String(item.imageUrl ?? EMPTY).trim();
  if (!id || !isSafeHomeImageUrl(imageUrl)) return null;
  const href = String(item.href ?? EMPTY).trim();
  return {
    id,
    imageUrl,
    ratio: pickEnum(item.ratio, HOME_BANNER_RATIOS, "1:1"),
    size: pickEnum(item.size, HOME_BANNER_SIZES, "m"),
    side: item.side === "right" ? "right" : "left",
    titleSize: pickEnum(item.titleSize, HOME_BANNER_TITLE_SIZES, "m"),
    title: normalizeText(item.title, HOME_BANNER_TITLE_MAX),
    body: normalizeText(item.body, HOME_BANNER_BODY_MAX),
    href: isSafeHomeHref(href) ? href : EMPTY,
    audience: pickEnum(item.audience, HOME_AUDIENCES, "all"),
    visible: item.visible !== false,
    adLabel: item.adLabel === true,
  };
}

function normalizeBanners(raw: unknown): HomeBannerConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_HOME_LAYOUT.banners.map(cloneBanner);
  const out: HomeBannerConfig[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const b = normalizeBanner(item);
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
    if (out.length >= HOME_BANNERS_MAX) break;
  }
  return out;
}

function normalizeServices(raw: unknown): HomeServiceCardConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_HOME_LAYOUT.services.map(cloneService);
  const out: HomeServiceCardConfig[] = [];
  const seen = new Set<HomeServiceKey>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const key = item.key as HomeServiceKey;
    if (!(HOME_SERVICE_KEYS as readonly string[]).includes(key) || seen.has(key)) continue;
    seen.add(key);
    const imageUrl = String(item.imageUrl ?? EMPTY).trim();
    out.push({
      key,
      size: item.size === "large" ? "large" : "small",
      title: normalizeText(item.title, HOME_SERVICE_TITLE_MAX),
      descMode: item.descMode === "custom" ? "custom" : "auto",
      desc: normalizeText(item.desc, HOME_SERVICE_DESC_MAX),
      imageUrl: imageUrl && isSafeHomeImageUrl(imageUrl) ? imageUrl : EMPTY,
      visible: item.visible === true,
      showBadge: item.showBadge === true,
    });
  }
  // 저장값에 없는 메뉴는 꺼진 채로 뒤에 붙인다(카탈로그 확장 대비). 나중에 추가된 서비스(모임 2026-11-14)는 기본 보이기 그대로.
  for (const d of DEFAULT_HOME_LAYOUT.services) {
    if (seen.has(d.key)) continue;
    if (HOME_SERVICE_KEYS_ADDED_LATER.has(d.key)) {
      // 기본 순서에서 바로 앞 메뉴 뒤에 끼운다 (모임 = 정보 공유 뒤)
      const defaults = DEFAULT_HOME_LAYOUT.services.map((x) => x.key);
      const prev = defaults[defaults.indexOf(d.key) - 1];
      const at = prev ? out.findIndex((x) => x.key === prev) : -1;
      out.splice(at >= 0 ? at + 1 : out.length, 0, cloneService(d));
    } else {
      out.push({ ...cloneService(d), visible: false });
    }
  }
  return out;
}

function normalizeStores(raw: unknown): HomeStoresConfig {
  const d = DEFAULT_HOME_LAYOUT.stores;
  if (!isRecord(raw)) return cloneStores(d);
  const picks: HomeStorePick[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.picks)) {
    for (const item of raw.picks) {
      if (!isRecord(item)) continue;
      const storeId = String(item.storeId ?? EMPTY).trim();
      if (!storeId || seen.has(storeId)) continue;
      seen.add(storeId);
      picks.push({
        storeId,
        menuMode: item.menuMode === "manual" ? "manual" : "auto",
        productIds: cleanIdList(item.productIds, HOME_STORE_MANUAL_MENUS_MAX),
        adLabel: item.adLabel === true,
      });
      if (picks.length >= HOME_STORE_PICKS_MAX) break;
    }
  }
  return {
    mode: raw.mode === "manual" ? "manual" : "auto",
    picks,
    autoCategorySlugs: cleanIdList(raw.autoCategorySlugs, 20),
    autoFilter: pickEnum(raw.autoFilter, HOME_STORE_AUTO_FILTERS, d.autoFilter),
    showCount: clampInt(raw.showCount, HOME_STORE_SHOW_MIN, HOME_STORE_SHOW_MAX, d.showCount),
    menusPerStore: clampInt(raw.menusPerStore, HOME_STORE_MENUS_MIN, HOME_STORE_MENUS_MAX, d.menusPerStore),
  };
}

function normalizeShortcuts(raw: unknown): HomeShortcutConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_HOME_LAYOUT.shortcuts.map((s) => ({ ...s }));
  const out: HomeShortcutConfig[] = [];
  const seen = new Set<HomeMenuKey>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const key = item.key as HomeMenuKey;
    if (!(HOME_MENU_KEYS as readonly string[]).includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, visible: item.visible === true });
  }
  for (const k of HOME_MENU_KEYS) {
    if (!seen.has(k)) out.push({ key: k, visible: false });
  }
  return out;
}

/** 저장값(알 수 없는 모양 포함) → 항상 유효한 구성. schemaVersion 이 2가 아니거나 깨졌으면 기본값. */
export function normalizeHomeLayout(raw: unknown): HomeLayoutConfig {
  if (!isRecord(raw) || raw.schemaVersion !== HOME_LAYOUT_SCHEMA_VERSION) return cloneHomeLayout(DEFAULT_HOME_LAYOUT);
  const header = isRecord(raw.header) ? raw.header : {};
  const categories = isRecord(raw.categories) ? raw.categories : {};
  const trades = isRecord(raw.trades) ? raw.trades : {};
  const posts = isRecord(raw.posts) ? raw.posts : {};
  const dT = DEFAULT_HOME_LAYOUT.trades;
  const dP = DEFAULT_HOME_LAYOUT.posts;
  return {
    schemaVersion: HOME_LAYOUT_SCHEMA_VERSION,
    sections: normalizeSections(raw.sections),
    header: {
      showAddress: header.showAddress !== false,
      searchPlaceholder: normalizeText(header.searchPlaceholder, HOME_SEARCH_PLACEHOLDER_MAX),
    },
    banners: normalizeBanners(raw.banners),
    services: normalizeServices(raw.services),
    categories: {
      layout: categories.layout === "grid" ? "grid" : "row",
      slugs: cleanIdList(categories.slugs, 30),
    },
    stores: normalizeStores(raw.stores),
    trades: {
      count: clampInt(trades.count, HOME_TRADES_MIN, HOME_TRADES_MAX, dT.count),
      tradeCategoryId: String(trades.tradeCategoryId ?? EMPTY).trim().slice(0, 60),
      sort: trades.sort === "popular" ? "popular" : "latest",
    },
    posts: {
      count: clampInt(posts.count, HOME_POSTS_MIN, HOME_POSTS_MAX, dP.count),
      topicSlug: String(posts.topicSlug ?? EMPTY).trim().slice(0, 60),
      sort: pickEnum(posts.sort, HOME_POST_SORTS, dP.sort),
    },
    shortcuts: normalizeShortcuts(raw.shortcuts),
  };
}

/* ───────────────────────── 저장 검증 ───────────────────────── */

export type HomeLayoutValidation = { ok: true; config: HomeLayoutConfig } | { ok: false; error: string };

/** 어드민 저장 본문 검증 — 정규화 전에 잘못된 값을 오류로 알린다(조용히 버리지 않음) */
export function validateHomeLayoutPayload(raw: unknown): HomeLayoutValidation {
  if (!isRecord(raw)) return { ok: false, error: "invalid_body" };
  if (raw.schemaVersion !== HOME_LAYOUT_SCHEMA_VERSION) return { ok: false, error: "invalid_schema_version" };
  if (Array.isArray(raw.banners)) {
    if (raw.banners.length > HOME_BANNERS_MAX) return { ok: false, error: "too_many_banners" };
    for (const b of raw.banners) {
      if (!isRecord(b)) return { ok: false, error: "invalid_banner" };
      const title = isRecord(b.title) ? String(b.title.ko ?? EMPTY).trim() : EMPTY;
      if (!title) return { ok: false, error: "banner_title_required" };
      if (!isSafeHomeImageUrl(String(b.imageUrl ?? EMPTY))) return { ok: false, error: "banner_image_required" };
      if (!isSafeHomeHref(String(b.href ?? EMPTY))) return { ok: false, error: "invalid_banner_href" };
    }
  }
  if (isRecord(raw.stores) && Array.isArray(raw.stores.picks) && raw.stores.picks.length > HOME_STORE_PICKS_MAX) {
    return { ok: false, error: "too_many_store_picks" };
  }
  const config = normalizeHomeLayout(raw);
  const visibleServices = config.services.filter((s) => s.visible);
  if (visibleServices.filter((s) => s.size === "large").length > HOME_SERVICE_LARGE_MAX) {
    return { ok: false, error: "too_many_large_cards" };
  }
  if (visibleServices.filter((s) => s.size === "small").length > HOME_SERVICE_SMALL_MAX) {
    return { ok: false, error: "too_many_small_cards" };
  }
  if (config.shortcuts.filter((t) => t.visible).length > HOME_SHORTCUTS_MAX_VISIBLE) {
    return { ok: false, error: "too_many_shortcuts" };
  }
  return { ok: true, config };
}

/* ───────────────────────── 복사 ───────────────────────── */

function cloneBanner(b: HomeBannerConfig): HomeBannerConfig {
  return { ...b, title: { ...b.title }, body: { ...b.body } };
}
function cloneService(s: HomeServiceCardConfig): HomeServiceCardConfig {
  return { ...s, title: { ...s.title }, desc: { ...s.desc } };
}
function cloneStores(s: HomeStoresConfig): HomeStoresConfig {
  return {
    ...s,
    picks: s.picks.map((p) => ({ ...p, productIds: [...p.productIds] })),
    autoCategorySlugs: [...s.autoCategorySlugs],
  };
}

export function cloneHomeLayout(c: HomeLayoutConfig): HomeLayoutConfig {
  return {
    schemaVersion: HOME_LAYOUT_SCHEMA_VERSION,
    sections: c.sections.map((s) => ({ ...s, title: { ...s.title } })),
    header: { showAddress: c.header.showAddress, searchPlaceholder: { ...c.header.searchPlaceholder } },
    banners: c.banners.map(cloneBanner),
    services: c.services.map(cloneService),
    categories: { layout: c.categories.layout, slugs: [...c.categories.slugs] },
    stores: cloneStores(c.stores),
    trades: { ...c.trades },
    posts: { ...c.posts },
    shortcuts: c.shortcuts.map((s) => ({ ...s })),
  };
}

/* ───────────────────────── 화면용 ───────────────────────── */

/** 화면에 그릴 칸 목록 — 로그인 여부 반영 */
export function resolveVisibleHomeSections(c: HomeLayoutConfig, isGuest: boolean): HomeSectionKey[] {
  return c.sections
    .filter((s) => s.visible && (!isGuest || s.guestVisible))
    .filter((s) => (HOME_SECTIONS_MEMBER_ONLY.has(s.key) ? !isGuest : true))
    .map((s) => s.key);
}

/** 이 사람에게 보일 배너 (보이기 켬 + 대상) */
export function resolveAudienceBanners(c: HomeLayoutConfig, isGuest: boolean): HomeBannerConfig[] {
  return c.banners.filter(
    (b) => b.visible && (b.audience === "all" || (isGuest ? b.audience === "guest" : b.audience === "member"))
  );
}
