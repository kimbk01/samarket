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
};

/** 바 전체(배경·테두리·높이·safe area) */
export const BOTTOM_NAV_SHELL = {
  /** 페이스북형: 흰 탭바 + 상단 경계선(토큰) */
  navClassName:
    "fixed bottom-0 left-0 right-0 z-20 box-border flex border-t border-ig-border bg-[var(--sub-bg)]",
  /** 아이콘 줄 최소 4rem + 홈 인디케이터(safe-area) — `h-16`만 쓰면 iOS 등에서 CTA·탭 간 어긋남 */
  heightClass:
    "min-h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)]",
} as const;

/**
 * 탭바가 차지하는 뷰포트 하단 높이와 동일한 `bottom` 오프셋(4rem + safe-area).
 * 탭 셸(`BOTTOM_NAV_SHELL`)과 반드시 같은 식을 쓴다.
 */
export const BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS =
  "bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]";

/**
 * 메인 하단 탭 바로 위에 고정 띠를 둘 때 사용 (`BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS` 와 동일).
 */
export const BOTTOM_NAV_STACK_ABOVE_CLASS = BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS;

/** ConditionalAppShell 등: 탭이 있을 때 본문 하단 패딩(기존 pb-20 + safe-area) */
export const MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS =
  "pb-[calc(5rem+env(safe-area-inset-bottom,0px))]";

/** 거래 플로팅 다이얼(`/home`·`/market/*` 등) — 탭 위 추가 여유 */
export const MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS =
  "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]";

/**
 * 고정 하단 탭(`BOTTOM_NAV_SHELL.heightClass`) 위까지 쓰는 전체 화면 높이.
 * 채팅방 등 `pb-0` 본문 + `100dvh` 직접 쓰면 탭에 가려지므로 이 값으로 줄인다.
 */
export const VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS =
  "h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))] max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))]";

/**
 * 배달(스토어) 상세: 장바구니 띠 + 하단 탭 위까지 스크롤 여유
 * (4rem 탭 + safe-area + ~4.5rem 띠 — 기존 pb-[72px]에 탭 높이 반영)
 */
export const STORE_DETAIL_ROOT_BOTTOM_PADDING_CLASS =
  "pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]";

/**
 * 기본 테마 — 탭별 override 없을 때 사용.
 * Tailwind 임의 값(bg-[#…])도 가능.
 */
export const BOTTOM_NAV_THEME = {
  iconSizeClass: "h-6 w-6",
  iconActiveClass: "text-signature",
  iconInactiveClass: "text-muted",
  labelActiveClass: "font-semibold text-signature",
  labelInactiveClass: "text-muted",
  labelSizeClass: "text-[11px]",
} as const;

/** 플로팅 + 버튼이 탭바 위에 오도록 여백 (BottomNav 높이와 맞출 것) */
export const BOTTOM_NAV_FAB_LAYOUT = {
  /** 탭(4rem+safe) + 여유 — 원형·그림자가 탭과 겹치지 않게 약간 더 띄움 */
  bottomOffsetClass: "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",
  /** 퀵메뉴는 좌측(본문 컬럼 기준) */
  leftOffsetClass: "left-4",
  /** 우측 플로팅 퀵 레일에서 글쓰기 퀵메뉴 열 때 */
  rightOffsetClass: "right-4",
} as const;

/**
 * `/home` 거래 플로팅 다이얼(`HomeTradeHubFloatingBar`) — 틸 메인 FAB 기준 bottom.
 * `WriteLauncher` 를 같은 위치에 맞출 때 사용.
 */
export const HOME_TRADE_HUB_FLOAT_BOTTOM_CLASS =
  "bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+10px)]";

/** 다이얼 보조 버튼(로열 블루 원) — 글쓰기 행·런처 닫기 버튼 공통 */
export const HOME_TRADE_HUB_SUB_FAB_BUTTON_CLASS =
  "pointer-events-auto relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#166FE5] text-white shadow-[0_4px_14px_rgba(24,119,242,0.42)] transition active:scale-95 [&_svg]:h-[22px] [&_svg]:w-[22px]";

/** 다이얼 메인 토글 — 시그니처 블루 */
export const HOME_TRADE_HUB_PRIMARY_FAB_BUTTON_CLASS =
  "pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-signature text-white shadow-[0_6px_22px_rgba(24,119,242,0.45)] transition active:scale-95 [&_svg]:h-7 [&_svg]:w-7";

/**
 * 표시 순서 = 배열 순서. 항목을 빼거나 바꾸면 탭 구성이 바뀝니다.
 * (`as const` 튜플은 선택 스타일 필드가 타입에 안 잡혀 BottomNavItemConfig[] 로 둡니다.)
 */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItemConfig[] = [
  { id: "home", href: "/home", label: "거래", labelKey: "nav_bottom_trade", icon: "trade" },
  { id: "community", href: "/philife", label: "커뮤니티", labelKey: "nav_bottom_community", icon: "community" },
  { id: "stores", href: "/stores", label: "배달", labelKey: "nav_bottom_delivery", icon: "stores" },
  { id: "chat", href: "/community-messenger", label: "메신저", labelKey: "nav_bottom_messenger", icon: "chat" },
  { id: "my", href: "/mypage", label: "내정보", labelKey: "nav_bottom_my", icon: "my" },
  // 예: 탭별 색·폰트만 바꿀 때
  // { id: "home", href: "/home", label: "홈", icon: "home", iconActiveClass: "text-emerald-600", labelActiveExtraClass: "font-semibold" },
];

/** 거래 탐색(/home·/market·/home/purchases 등) 메인 1단 제목 — `BOTTOM_NAV_ITEMS` 의 home 라벨과 동일 */
export const BOTTOM_NAV_TRADE_TAB_LABEL: string =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "home")?.label ?? "거래";

export const BOTTOM_NAV_TRADE_TAB_LABEL_KEY: MessageKey =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "home")?.labelKey ?? "nav_bottom_trade";

/** 커뮤니티 탭 라벨 — 1단 `Tier1ExplorationTitleRow` 등과 동기화 */
export const BOTTOM_NAV_PHILIFE_TAB_LABEL: string =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "community")?.label ?? "커뮤니티";

export const BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY: MessageKey =
  BOTTOM_NAV_ITEMS.find((i) => i.id === "community")?.labelKey ?? "nav_bottom_community";
