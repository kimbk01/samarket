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
] as const;
export type BottomNavIconKey = (typeof BOTTOM_NAV_ICON_KEYS)[number];

import type { MessageKey } from "@/lib/i18n/messages";

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
];

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
      if (x[k] !== y[k]) return false;
    }
  }
  return true;
}

/**
 * 바 전체 — 바깥 래퍼(고정·safe-area) + 흰색 floating card plane.
 *
 * 단일 소스: `app/app-shell.css` 의 `--app-bottom-nav-height: 3.5rem`.
 * `heightClass` 의 `h-[3.5rem]` 과 반드시 같은 값을 유지한다 — 바뀔 때 두 곳을 같이 수정.
 * outer 의 `pb-[env(safe-area-inset-bottom,0px)]` 는 홈 인디케이터(iOS) 회피용. 제거 금지.
 */
export const BOTTOM_NAV_SHELL = {
  /** 기기 좌우 끝까지 — 하단 safe-area 는 외곽에서만 책임, active floating icon 때문에 overflow visible */
  outerClassName: "app-bottom-nav-shell",
  /** 첨부 이미지형 흰색 floating card plane */
  innerBarClassName: "app-bottom-nav-plane",
  /** 탭 한 줄 높이 — `--app-bottom-nav-height` (3.5rem) 와 동기 */
  heightClass: "h-[3.5rem]",
} as const;

/** 필라이프·거래·매장 오너 하단 탭 `translate-y` 전환 — `ConditionalAppShell`·`OwnerMobileBottomNav` 공통 */
export const BOTTOM_NAV_OUTER_MOTION =
  "transition-transform duration-150 will-change-transform [transition-timing-function:cubic-bezier(0.25,0.1,0.2,1)]";

/** 하단 탭바 기준색 — `app-bottom-nav.css` `--app-bottom-nav-surface` 와 동기 */
export const BOTTOM_NAV_DARK_BAR_HEX = "#f6f6f6";
/** `OWNER_HUB_BADGE_DOT_CLASS` 와 조합 */
export const BOTTOM_NAV_BADGE_RING_CLASS = "ring-sam-surface";

/**
 * 탭바가 차지하는 뷰포트 하단 높이와 동일한 `bottom` 오프셋(본체 높이 + safe-area).
 * 탭 셸(`BOTTOM_NAV_SHELL`)과 반드시 같은 식을 쓴다.
 */
export const BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS =
  "bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))]";

/**
 * 메인 하단 탭 바로 위에 고정 띠를 둘 때 사용 (`BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS` 와 동일).
 */
export const BOTTOM_NAV_STACK_ABOVE_CLASS = BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS;

/** ConditionalAppShell 등: 탭이 있을 때 본문 하단 패딩(탭 본체 + 1rem + safe-area) */
export const MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS =
  "pb-[calc(5rem+env(safe-area-inset-bottom,0px))]";

/** 거래 플로팅 다이얼(`/market/*` 등) — 탭 위 추가 여유 */
export const MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS =
  "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]";

/**
 * 고정 하단 탭(`BOTTOM_NAV_SHELL.heightClass`) 위까지 쓰는 전체 화면 높이.
 * 채팅방 등 `pb-0` 본문 + `100dvh` 직접 쓰면 탭에 가려지므로 이 값으로 줄인다.
 */
export const VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS =
  "h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))]";

/**
 * 하단 탭이 없는 전체 화면(채팅 상세·통화 등)용 뷰포트 높이.
 * `VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS` 와 혼용하면 이중 차감이 생길 수 있다.
 */
export const VIEWPORT_HEIGHT_FULL_CLASS = "h-[100dvh] max-h-[100dvh]";

/**
 * 배달(스토어) 상세: 장바구니 띠 + 하단 탭 위까지 스크롤 여유
 * (3.5rem 탭 + safe-area + ~4.5rem 띠)
 */
export const STORE_DETAIL_ROOT_BOTTOM_PADDING_CLASS =
  "pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]";

/** 매장 상세 메뉴: 활성 카트 띠(~92px)+safe 하단 여유 */
export const STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS =
  "pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))]";

/** 매장 상세 메뉴: 빈 카트 띠(~76px)+safe 하단 여유 */
export const STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS =
  "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]";

/**
 * 기본 테마 — 탭별 override 없을 때 사용.
 * Tailwind 임의 값(bg-[#…])도 가능.
 */
export const BOTTOM_NAV_THEME = {
  iconSizeClass: "app-bottom-nav-icon-svg",
  iconActiveClass: "text-[#1C8DB8]",
  iconInactiveClass: "text-[#b8bec8]",
  labelActiveClass: "font-semibold tracking-[-0.01em] text-[#1C8DB8]",
  labelInactiveClass: "font-medium tracking-[-0.01em] text-[#b8bec8]",
  labelSizeClass: "text-[11px] leading-none",
} as const;

/** 플로팅 + 버튼이 탭바 위에 오도록 여백 (BottomNav 높이와 맞출 것) */
export const BOTTOM_NAV_FAB_LAYOUT = {
  /** 탭 본체 + safe + 여유 — 플로팅 원과 겹침 완화 */
  bottomOffsetClass: "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]",
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
  "bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+10px)]";

/** 다이얼 보조 버튼(로열 블루 원) — 글쓰기 행·런처 닫기 버튼 공통 */
export const HOME_TRADE_HUB_SUB_FAB_BUTTON_CLASS =
  "pointer-events-auto relative flex h-12 w-12 shrink-0 items-center justify-center rounded-sam-md border border-sam-border bg-sam-surface text-sam-primary shadow-sam-elevated transition active:scale-95 [&_svg]:h-[22px] [&_svg]:w-[22px]";

/** 다이얼 메인 토글 — 시그니처 블루 */
export const HOME_TRADE_HUB_PRIMARY_FAB_BUTTON_CLASS =
  "pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-sam-md border border-sam-primary bg-sam-primary text-white shadow-sam-elevated transition active:scale-95 [&_svg]:h-7 [&_svg]:w-7";

/**
 * 표시 순서 = 배열 순서. 항목을 빼거나 바꾸면 탭 구성이 바뀝니다.
 * (`as const` 튜플은 선택 스타일 필드가 타입에 안 잡혀 BottomNavItemConfig[] 로 둡니다.)
 */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItemConfig[] = [
  { id: "community", href: "/philife", label: "Community", labelKey: "nav_bottom_community", icon: "community" },
  { id: "home", href: "/market", label: "Trade", labelKey: "nav_bottom_trade", icon: "trade" },
  { id: "stores", href: "/stores", label: "Delivery", labelKey: "nav_bottom_delivery", icon: "stores" },
  {
    id: "chat",
    href: "/community-messenger?section=chats",
    label: "Messenger",
    labelKey: "nav_bottom_messenger",
    icon: "chat",
    activeShellClass: "bg-sam-primary-soft",
    iconActiveClass: "text-sam-primary",
    labelActiveClass: "font-semibold tracking-normal text-sam-fg",
  },
  { id: "my", href: "/mypage", label: "My Page", labelKey: "nav_bottom_my", icon: "my" },
  // 예: 탭별 색·폰트만 바꿀 때
  // { id: "home", href: "/market", label: "홈", icon: "home", iconActiveClass: "text-emerald-600", labelActiveExtraClass: "font-semibold" },
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

export const BOTTOM_NAV_TRADE_TAB_LABEL_KEY: MessageKey =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "home")?.labelKey ?? "nav_bottom_trade";

/** 커뮤니티 탭 라벨 — 1단 `Tier1ExplorationTitleRow` 등과 동기화 */
export const BOTTOM_NAV_PHILIFE_TAB_LABEL: string =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "community")?.label ?? "Community";

export const BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY: MessageKey =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "community")?.labelKey ?? "nav_bottom_community";

/** 배달 탭(`/stores`) 1단 — 하단 탭 라벨과 동기화 */
export const BOTTOM_NAV_DELIVERY_TAB_LABEL_KEY: MessageKey =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "stores")?.labelKey ?? "nav_bottom_delivery";
