/**
 * 메인 하단 탭(거래·커뮤니티·배달·거래채팅·내정보) 단일 설정.
 * 순서·라벨·경로·아이콘·색·폰트는 여기만 수정하면 됩니다.
 */

/** 내장 탭 id */
export const BOTTOM_NAV_BUILTIN_IDS = [
  "home",
  "community",
  "stores",
  "chat",
  "my",
] as const;
export type BottomNavBuiltinTabId = (typeof BOTTOM_NAV_BUILTIN_IDS)[number];

/** 탭 id — 내장 + `custom_*` (운영 DB) */
export type BottomNavTabId = string;

/**
 * 아이콘 variant — BottomNav.tsx 레지스트리와 키 일치 (커스텀 탭도 이 중 선택)
 * `orders`는 예전 저장 데이터 호환용으로만 남겨 둡니다.
 */
export const BOTTOM_NAV_ICON_KEYS = [
  ...BOTTOM_NAV_BUILTIN_IDS,
  "orders",
  /** 거래 탭 전용 (집 아이콘 `home` 과 구분) */
  "trade",
  /** 배달 하단 탭 장바구니 */
  "cart",
  /** 거래 하단 탭 찜 */
  "favorites",
  /** 승인 매장주 운영센터(매장 어드민) */
  "owner_hub",
] as const;
export type BottomNavIconKey = (typeof BOTTOM_NAV_ICON_KEYS)[number];

import type { MessageKey } from "@/lib/i18n/messages";
import type { MainBottomNavFabStoredConfig } from "@/lib/main-menu/main-bottom-nav-fab-types";

export type BottomNavItemConfig = {
  id: BottomNavTabId;
  href: string;
  label: string;
  labelKey?: MessageKey;
  icon: BottomNavIconKey;
  /** 아이콘 SVG 래퍼 (기본 theme.iconSizeClass) */
  iconSizeClass?: string;
  /** 비활성 라벨에 추가 (예: tracking-tight) */
  labelInactiveExtraClass?: string;
  /** 활성 라벨에 추가 (예: font-semibold) */
  labelActiveExtraClass?: string;
  /** 비활성 아이콘 색 — 미입력 시 theme.iconInactiveClass */
  iconInactiveClass?: string;
  /** 활성 아이콘 색 — 미입력 시 theme.iconActiveClass */
  iconActiveClass?: string;
  /** 비활성 라벨 색·굵기 — 미입력 시 theme.labelInactiveClass */
  labelInactiveClass?: string;
  /** 활성 라벨 색·굵기 — 미입력 시 theme.labelActiveClass */
  labelActiveClass?: string;
  /** 라벨 글자 크기 등 — 미입력 시 theme.labelSizeClass */
  labelSizeClass?: string;
  /** 라벨 폰트 패밀리 (예: font-sans, font-serif) */
  labelFontFamilyClass?: string;
  /** 활성 탭 플로팅 원 배지 — 배경·그림자·링만 (기본은 `BottomNav` 기본 오브) */
  activeShellClass?: string;
  /** true 이면 탭 탭 시 새 창(탭)으로 연다 — 기본은 같은 창 SPA 이동 */
  openInNewTab?: boolean;
  /** Lucide(https://lucide.dev) 아이콘명 — 있으면 `icon` 대신 사용 */
  lucideIcon?: string;
  /** 하단 탭 보조 FAB 설정 */
  fab?: MainBottomNavFabStoredConfig;
};

const BOTTOM_NAV_ITEM_CMP_KEYS: (keyof BottomNavItemConfig)[] = [
  "id",
  "href",
  "label",
  "labelKey",
  "icon",
  "iconSizeClass",
  "labelInactiveExtraClass",
  "labelActiveExtraClass",
  "iconInactiveClass",
  "iconActiveClass",
  "labelInactiveClass",
  "labelActiveClass",
  "labelSizeClass",
  "labelFontFamilyClass",
  "activeShellClass",
  "openInNewTab",
  "lucideIcon",
  "fab",
];

function fabConfigsEqual(
  a: MainBottomNavFabStoredConfig | undefined,
  b: MainBottomNavFabStoredConfig | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.enabled !== b.enabled) return false;
  if (a.items.length !== b.items.length) return false;
  for (let i = 0; i < a.items.length; i++) {
    const x = a.items[i];
    const y = b.items[i];
    if (
      x.id !== y.id ||
      x.visible !== y.visible ||
      x.label !== y.label ||
      x.href !== y.href ||
      x.icon !== y.icon ||
      x.openInNewTab !== y.openInNewTab ||
      x.lucideIcon !== y.lucideIcon
    ) {
      return false;
    }
  }
  return true;
}

/** 서버/캐시 재조회 후에도 탭 구성이 동일하면 `setState` 를 생략해 프리페치·레이아웃 effect 재실행을 막는다. */
export function areBottomNavItemConfigsEqual(
  a: readonly BottomNavItemConfig[],
  b: readonly BottomNavItemConfig[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    for (const k of BOTTOM_NAV_ITEM_CMP_KEYS) {
      if (k === "fab") {
        if (!fabConfigsEqual(x.fab, y.fab)) return false;
        continue;
      }
      if (x[k] !== y[k]) return false;
    }
  }
  return true;
}

/**
 * 바 전체 — 바깥 래퍼(고정·safe-area) + 내부 flex container.
 *
 * 단일 소스: `app/app-shell.css` 의 `--app-bottom-nav-height: 60px`.
 * shell CSS 가 `height: calc(60px + safe-area)` 를 담당 — `heightClass` 는 container(60px) 용.
 */
export const BOTTOM_NAV_SHELL = {
  outerClassName: "app-bottom-nav-shell",
  innerBarClassName: "app-bottom-nav-plane",
  containerClassName: "app-bottom-nav-container",
  /** 탭 한 줄 높이 — `--app-bottom-nav-height` (60px) 와 동기 */
  heightClass: "h-[60px]",
} as const;

/** 필라이프·거래·매장 오너 하단 탭 `translate-y` 전환 — `ConditionalAppShell`·`OwnerMobileBottomNav` 공통 */
export const BOTTOM_NAV_OUTER_MOTION =
  "transition-transform duration-150 will-change-transform [transition-timing-function:cubic-bezier(0.25,0.1,0.2,1)]";

/**
 * 스크롤 다운 시 탭 숨김 — `translate-y-full` 만으로는 배달·오너 홈 원(상단 돌출)이 남는다.
 * `app-bottom-nav.css` `.app-bottom-nav-shell--scroll-hidden` 과 쌍.
 */
export const BOTTOM_NAV_SCROLL_HIDDEN_CLASS = "app-bottom-nav-shell--scroll-hidden";
export const BOTTOM_NAV_SCROLL_VISIBLE_CLASS = "app-bottom-nav-shell--scroll-visible";

export function resolveBottomNavScrollHideOuterClass(hidden: boolean): string {
  return hidden ? BOTTOM_NAV_SCROLL_HIDDEN_CLASS : BOTTOM_NAV_SCROLL_VISIBLE_CLASS;
}

/** 하단 탭바 기준색 — `app-bottom-nav.css` `--app-bottom-nav-surface` 와 동기 */
export const BOTTOM_NAV_DARK_BAR_HEX = "#fffcfc";
/** `OWNER_HUB_BADGE_DOT_CLASS` 와 조합 */
export const BOTTOM_NAV_BADGE_RING_CLASS = "ring-sam-surface";

/**
 * 탭바가 차지하는 뷰포트 하단 높이와 동일한 `bottom` 오프셋(본체 높이 + safe-area).
 * 탭 셸(`BOTTOM_NAV_SHELL`)과 반드시 같은 식을 쓴다.
 */
export const BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS =
  "bottom-[calc(60px+var(--safe-bottom))]";

/**
 * 메인 하단 탭(z-index 1200) 위 바텀시트 — 주소 선택 등 하단이 탭에 가리지 않게.
 */
export const MAIN_BOTTOM_NAV_SHEET_Z_CLASS = "z-[1300]";
/** 내정보 시트(1300) 위 · Auth gate(1310) 아래 — 주소 상세 등 nested dialog */
export const MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS = "z-[1305]";
export const MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS =
  "bottom-[calc(var(--app-bottom-nav-height,60px)+var(--safe-bottom))]";
export const MAIN_BOTTOM_NAV_SHEET_MAX_H_CLASS =
  "max-h-[min(calc(78dvh-var(--app-bottom-nav-height,60px)-var(--safe-bottom)),520px)]";

/** 메신저 홈 오버레이 패널 — `app/messenger-home-bottom-sheet.css` (배달 overhang `:has` 반영) */
export const MESSENGER_HOME_BOTTOM_SHEET_PANEL_CLASS = "messenger-home-bottom-sheet-panel";

/** 메신저 설정 시트 — 기기 뷰포트 높이 대비 비율(0.7 = 70%) */
export const MESSENGER_SETTINGS_SHEET_DEVICE_HEIGHT_RATIO = 0.7;

/** `messenger-home-bottom-sheet.css` `.messenger-home-bottom-sheet-panel--device-bottom` */
export const MESSENGER_HOME_BOTTOM_SHEET_DEVICE_BOTTOM_CLASS =
  "messenger-home-bottom-sheet-panel--device-bottom";

/**
 * 메인 하단 탭 바로 위에 고정 띠를 둘 때 사용 (`BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS` 와 동일).
 */
export const BOTTOM_NAV_STACK_ABOVE_CLASS = BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS;

/** ConditionalAppShell 등: 탭이 있을 때 본문 하단 패딩(76px + 홈 원 돌출 + safe-bottom) */
export const MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS =
  "pb-[calc(76px+var(--delivery-home-overhang,0px)+var(--safe-bottom))]";

/** 거래 플로팅 다이얼(`/market/*` 등) — 탭 위 추가 여유 */
export const MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS =
  "pb-[calc(82px+var(--delivery-home-overhang,0px)+var(--safe-bottom))]";

/**
 * 고정 하단 탭(`BOTTOM_NAV_SHELL.heightClass`) 위까지 쓰는 전체 화면 높이.
 * 채팅방 등 `pb-0` 본문 + `100dvh` 직접 쓰면 탭에 가려지므로 이 값으로 줄인다.
 */
export const VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS =
  "h-[calc(100dvh-60px-var(--safe-bottom))] max-h-[calc(100dvh-60px-var(--safe-bottom))]";

/**
 * 하단 탭이 없는 전체 화면(채팅 상세·통화 등)용 뷰포트 높이.
 * `VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS` 와 혼용하면 이중 차감이 생길 수 있다.
 */
export const VIEWPORT_HEIGHT_FULL_CLASS = "h-[100dvh] max-h-[100dvh]";

export {
  STORE_DETAIL_ROOT_BOTTOM_PADDING_CLASS,
  STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS,
  STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS,
} from "@/lib/stores/store-commerce-bottom-action-bar";

/**
 * 기본 테마 — 탭별 override 없을 때 사용.
 * Tailwind 임의 값(bg-[#…])도 가능.
 */
export const BOTTOM_NAV_THEME = {
  iconSizeClass: "app-bottom-nav-icon-svg",
  iconActiveClass: "",
  iconInactiveClass: "",
  labelActiveClass: "",
  labelInactiveClass: "",
  labelSizeClass: "",
} as const;

/** FAB 섹터 — 하단 탭(z~1200) 위·모달(z110+) 아래 */
export const MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS = "z-[1255]";

/** FAB — 하단 탭(60px+safe) 바로 위 + 10px */
export const MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS =
  "bottom-[calc(60px+var(--safe-bottom)+10px)]";

/** 플로팅 + 버튼이 탭바 위에 오도록 여백 (BottomNav 높이와 맞출 것) */
export const BOTTOM_NAV_FAB_LAYOUT = {
  bottomOffsetClass: MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS,
  /** 퀵메뉴는 좌측(본문 컬럼 기준) */
  leftOffsetClass: "left-4",
  /** 우측 플로팅 퀵 레일에서 글쓰기 퀵메뉴 열 때 */
  rightOffsetClass: "right-4",
} as const;

/**
 * `/market` 거래 플로팅 다이얼(`HomeTradeHubFloatingBar`) — 틸 메인 FAB 기준 bottom.
 * `WriteLauncher` 를 같은 위치에 맞출 때 사용.
 */
export const HOME_TRADE_HUB_FLOAT_BOTTOM_CLASS =
  "bottom-[calc(60px+var(--safe-bottom)+10px)]";

/** 다이얼 보조 버튼(로열 블루 원) — 글쓰기 행·런처 닫기 버튼 공통 */
export const HOME_TRADE_HUB_SUB_FAB_BUTTON_CLASS =
  "pointer-events-auto relative flex h-12 w-12 shrink-0 items-center justify-center rounded-sam-md border border-sam-border bg-sam-surface text-sam-primary shadow-sam-elevated transition active:scale-95 [&_svg]:h-[22px] [&_svg]:w-[22px]";

/** 다이얼 메인 토글 — 시그니처 블루 */
export const HOME_TRADE_HUB_PRIMARY_FAB_BUTTON_CLASS =
  "pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-sam-md border border-sam-primary bg-sam-primary text-white shadow-sam-elevated transition active:scale-95 [&_svg]:h-7 [&_svg]:w-7";

/** 내장 탭 id → 하단 네비 전용 짧은 dot i18n key (home id 는 거래 탭) */
export const BUILTIN_BOTTOM_NAV_LABEL_KEYS: Partial<Record<BottomNavBuiltinTabId, MessageKey>> = {
  community: "nav.community",
  home: "nav.trade",
  stores: "nav.delivery",
  chat: "nav.chat",
  my: "nav.my",
};

/** dot i18n — 허브·도메인 5탭 등에서 재사용 */
export const NAV_DOT_LABEL_KEYS = {
  home: "nav.home",
  trade: "nav.trade",
  delivery: "nav.delivery",
  community: "nav.community",
  chat: "nav.chat",
  my: "nav.my",
} as const satisfies Record<string, MessageKey>;

export function resolveBuiltinBottomNavLabelKey(tabId: string): MessageKey | undefined {
  if (!isBuiltinBottomNavTabId(tabId)) return undefined;
  return BUILTIN_BOTTOM_NAV_LABEL_KEYS[tabId];
}

/** 배달·거래·필라이프 홈 허브 원형 탭 — overhang 셸 modifier 용 */
export const BOTTOM_NAV_DELIVERY_HUB_TAB_IDS = [
  "delivery-home-hub",
  "trade-home-hub",
  "philife-home-hub",
] as const;

export function bottomNavUsesDeliveryHubShell(tabs: readonly BottomNavItemConfig[]): boolean {
  return tabs.some((t) =>
    (BOTTOM_NAV_DELIVERY_HUB_TAB_IDS as readonly string[]).includes(t.id)
  );
}

function isBuiltinBottomNavTabId(id: string): id is BottomNavBuiltinTabId {
  return (BOTTOM_NAV_BUILTIN_IDS as readonly string[]).includes(id);
}

/**
 * 표시 순서 = 배열 순서. 항목을 빼거나 바꾸면 탭 구성이 바뀝니다.
 */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItemConfig[] = [
  { id: "community", href: "/philife", label: "Community", labelKey: "nav.community", icon: "community" },
  { id: "home", href: "/market", label: "Trade", labelKey: "nav.trade", icon: "trade" },
  { id: "stores", href: "/stores", label: "Food", labelKey: "nav.delivery", icon: "stores" },
  {
    id: "chat",
    href: "/community-messenger?section=chats",
    label: "Chat",
    labelKey: "nav.chat",
    icon: "chat",
  },
  { id: "my", href: "/mypage", label: "My", labelKey: "nav.my", icon: "my" },
];

/** `BOTTOM_NAV_ITEMS` 순 — 스와이프/인접 이동용 (해당 `id` 기준) */
export function getBottomNavAdjacentHref(tabId: BottomNavTabId, direction: "next" | "prev"): string | null {
  const i = BOTTOM_NAV_ITEMS.findIndex((t) => t.id === tabId);
  if (i < 0) return null;
  if (direction === "next") return i < BOTTOM_NAV_ITEMS.length - 1 ? BOTTOM_NAV_ITEMS[i + 1]!.href : null;
  if (direction === "prev") return i > 0 ? BOTTOM_NAV_ITEMS[i - 1]!.href : null;
  return null;
}

/** 거래 탐색(/market·/mypage/purchases 등) 메인 1단 제목 — `BOTTOM_NAV_ITEMS` 의 home 라벨과 동일 */
export const BOTTOM_NAV_TRADE_TAB_LABEL: string =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "home")?.label ?? "Trade";

export const BOTTOM_NAV_TRADE_TAB_LABEL_KEY: MessageKey = "nav_bottom_trade";

/** 커뮤니티 탭 라벨 — 1단 `Tier1ExplorationTitleRow` 등과 동기화 */
export const BOTTOM_NAV_PHILIFE_TAB_LABEL: string =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "community")?.label ?? "Community";

export const BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY: MessageKey = "nav_bottom_community";

/** 배달 탭(`/stores`) 1단 — 하단 탭 라벨과 동기화 */
export const BOTTOM_NAV_DELIVERY_TAB_LABEL_KEY: MessageKey = "nav_bottom_delivery";
