/**
 * 앱 홈(`/`·`/home`) 구성 — 단일 정의 (Owner 「구현 시작」 2026-11-09, 설계안 v11 §7).
 *
 * - 어드민 「홈 구성」(`/admin/menus/home-layout`) 이 저장하는 값과 앱 홈이 읽는 값의 모양이 같다.
 * - 저장 위치: `admin_settings` 키 `home_layout` (`value_json` = {@link HomeLayoutConfig}).
 * - 메뉴는 아래 카탈로그 안에서만 고른다 — 어드민이 주소를 직접 입력하지 않는다(잘못된 링크 방지).
 *   모임은 기능이 없어 넣지 않는다(Owner 2026-11-09). 기능이 생기면 카탈로그에 한 줄 추가한다.
 * - 저장값이 없거나 깨졌으면 {@link DEFAULT_HOME_LAYOUT} 을 쓴다.
 */

import { CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import type { RequireAuthActionType } from "@/lib/auth/require-auth-action";
import type { MessageKey } from "@/lib/i18n/message-key";

export const HOME_LAYOUT_SETTINGS_KEY = "home_layout" as const;
export const HOME_LAYOUT_SERVER_CACHE_TAG = "home-layout" as const;

/** 홈 메뉴 카탈로그 키 */
export const HOME_MENU_KEYS = [
  "trade",
  "stores",
  "philife",
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
  href: string;
  /** 비로그인이 누르면 로그인 안내 — 기존 `requireAuthAction` 동작 이름(문구 있음)만 쓴다 */
  guestAuthAction: Extract<RequireAuthActionType, "messenger_open" | "delivery_order" | "trade_favorite"> | null;
};

export const HOME_MENU_CATALOG: Readonly<Record<HomeMenuKey, HomeMenuDef>> = {
  trade: { key: "trade", labelKey: "home_menu_trade", href: "/market", guestAuthAction: null },
  stores: { key: "stores", labelKey: "home_menu_stores", href: "/stores", guestAuthAction: null },
  philife: { key: "philife", labelKey: "home_menu_philife", href: "/philife", guestAuthAction: null },
  chat: {
    key: "chat",
    labelKey: "home_menu_chat",
    href: "/community-messenger?section=chats",
    guestAuthAction: "messenger_open",
  },
  events: { key: "events", labelKey: "home_menu_events", href: "/events", guestAuthAction: null },
  orders: { key: "orders", labelKey: "home_menu_orders", href: "/orders", guestAuthAction: "delivery_order" },
  points: { key: "points", labelKey: "home_menu_points", href: "/mypage/points", guestAuthAction: null },
  favorites: {
    key: "favorites",
    labelKey: "home_menu_favorites",
    href: MYPAGE_TRADE_FAVORITES_HREF,
    guestAuthAction: "trade_favorite",
  },
  support: { key: "support", labelKey: "home_menu_support", href: CUSTOMER_CENTER_HREF, guestAuthAction: null },
  all: { key: "all", labelKey: "home_menu_all", href: "/services", guestAuthAction: null },
};

/** 홈 칸 — 녹색 헤더(로고·알림·주소·검색)는 고정이라 목록에 없다 */
export const HOME_SECTION_KEYS = ["tiles", "shortcuts", "guestCta", "topBanner", "ongoing", "panels"] as const;
export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export const HOME_SECTION_LABEL_KEYS: Readonly<Record<HomeSectionKey, MessageKey>> = {
  tiles: "home_section_tiles",
  shortcuts: "home_section_shortcuts",
  guestCta: "home_section_guest_cta",
  topBanner: "home_section_top_banner",
  ongoing: "home_section_ongoing",
  panels: "home_section_panels",
};

/** 비로그인에게 절대 보이지 않는 칸 (개인 정보) */
export const HOME_SECTIONS_MEMBER_ONLY: ReadonlySet<HomeSectionKey> = new Set(["ongoing"]);

export const HOME_PANEL_KEYS = ["recommended", "neighborhood", "trade", "delivery"] as const;
export type HomePanelKey = (typeof HOME_PANEL_KEYS)[number];

export const HOME_PANEL_LABEL_KEYS: Readonly<Record<HomePanelKey, MessageKey>> = {
  recommended: "home_panel_recommended",
  neighborhood: "home_panel_neighborhood",
  trade: "home_panel_trade",
  delivery: "home_panel_delivery",
};

export type HomeSectionConfig = { key: HomeSectionKey; visible: boolean; guestVisible: boolean };
export type HomeMenuItemConfig = { key: HomeMenuKey; visible: boolean };
export type HomePanelConfig = { key: HomePanelKey; visible: boolean };

export type HomeLayoutConfig = {
  schemaVersion: 1;
  sections: HomeSectionConfig[];
  /** 앞 2개(보이는 것 기준) = 큰 카드 */
  tiles: HomeMenuItemConfig[];
  shortcuts: HomeMenuItemConfig[];
  panels: HomePanelConfig[];
};

export const HOME_TILES_MAX_VISIBLE = 6;
export const HOME_SHORTCUTS_MAX_VISIBLE = 5;

export const DEFAULT_HOME_LAYOUT: HomeLayoutConfig = {
  schemaVersion: 1,
  sections: [
    { key: "tiles", visible: true, guestVisible: true },
    { key: "shortcuts", visible: true, guestVisible: true },
    { key: "guestCta", visible: true, guestVisible: true },
    { key: "topBanner", visible: true, guestVisible: true },
    { key: "ongoing", visible: true, guestVisible: false },
    { key: "panels", visible: true, guestVisible: true },
  ],
  tiles: [
    { key: "trade", visible: true },
    { key: "stores", visible: true },
    { key: "philife", visible: true },
    { key: "chat", visible: true },
    { key: "events", visible: true },
    { key: "orders", visible: false },
    { key: "points", visible: false },
    { key: "favorites", visible: false },
    { key: "support", visible: false },
  ],
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
  panels: [
    { key: "recommended", visible: true },
    { key: "neighborhood", visible: true },
    { key: "trade", visible: true },
    { key: "delivery", visible: true },
  ],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeOrderedList<K extends string, T extends { key: K }>(
  raw: unknown,
  allowed: readonly K[],
  defaults: readonly T[],
  parse: (o: Record<string, unknown>, key: K) => T
): T[] {
  const out: T[] = [];
  const seen = new Set<K>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) continue;
      const key = item.key as K;
      if (!(allowed as readonly string[]).includes(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(parse(item, key));
    }
  }
  // 저장값에 없는 항목은 기본값 순서대로 뒤에 붙인다(카탈로그 확장 대비).
  for (const d of defaults) {
    if (!seen.has(d.key)) {
      seen.add(d.key);
      out.push({ ...d });
    }
  }
  return out;
}

/** 저장값(알 수 없는 모양 포함) → 항상 유효한 구성. 깨졌으면 기본값. */
export function normalizeHomeLayout(raw: unknown): HomeLayoutConfig {
  if (!isRecord(raw)) return cloneHomeLayout(DEFAULT_HOME_LAYOUT);
  const sections = normalizeOrderedList<HomeSectionKey, HomeSectionConfig>(
    raw.sections,
    HOME_SECTION_KEYS,
    DEFAULT_HOME_LAYOUT.sections,
    (o, key) => ({
      key,
      visible: o.visible !== false,
      guestVisible: HOME_SECTIONS_MEMBER_ONLY.has(key) ? false : o.guestVisible !== false,
    })
  );
  const tiles = normalizeOrderedList<HomeMenuKey, HomeMenuItemConfig>(
    raw.tiles,
    HOME_MENU_KEYS.filter((k) => k !== "all"),
    DEFAULT_HOME_LAYOUT.tiles,
    (o, key) => ({ key, visible: o.visible === true })
  );
  const shortcuts = normalizeOrderedList<HomeMenuKey, HomeMenuItemConfig>(
    raw.shortcuts,
    HOME_MENU_KEYS,
    DEFAULT_HOME_LAYOUT.shortcuts,
    (o, key) => ({ key, visible: o.visible === true })
  );
  const panels = normalizeOrderedList<HomePanelKey, HomePanelConfig>(
    raw.panels,
    HOME_PANEL_KEYS,
    DEFAULT_HOME_LAYOUT.panels,
    (o, key) => ({ key, visible: o.visible !== false })
  );
  return { schemaVersion: 1, sections, tiles, shortcuts, panels };
}

export type HomeLayoutValidation = { ok: true; config: HomeLayoutConfig } | { ok: false; error: string };

/** 어드민 저장 본문 검증 — 정규화 후 개수 제한만 추가로 본다 */
export function validateHomeLayoutPayload(raw: unknown): HomeLayoutValidation {
  if (!isRecord(raw)) return { ok: false, error: "invalid_body" };
  const config = normalizeHomeLayout(raw);
  if (config.tiles.filter((t) => t.visible).length > HOME_TILES_MAX_VISIBLE) {
    return { ok: false, error: "too_many_tiles" };
  }
  if (config.shortcuts.filter((t) => t.visible).length > HOME_SHORTCUTS_MAX_VISIBLE) {
    return { ok: false, error: "too_many_shortcuts" };
  }
  return { ok: true, config };
}

export function cloneHomeLayout(c: HomeLayoutConfig): HomeLayoutConfig {
  return {
    schemaVersion: 1,
    sections: c.sections.map((s) => ({ ...s })),
    tiles: c.tiles.map((t) => ({ ...t })),
    shortcuts: c.shortcuts.map((t) => ({ ...t })),
    panels: c.panels.map((p) => ({ ...p })),
  };
}

/** 화면에 그릴 칸 목록 — 로그인 여부 반영 */
export function resolveVisibleHomeSections(c: HomeLayoutConfig, isGuest: boolean): HomeSectionKey[] {
  return c.sections
    .filter((s) => s.visible && (!isGuest || s.guestVisible))
    .filter((s) => (s.key === "guestCta" ? isGuest : true))
    .filter((s) => (s.key === "ongoing" ? !isGuest : true))
    .map((s) => s.key);
}
