/**
 * 메인 하단 탭(홈·동네생활·매장·주문·채팅·내정보) 단일 설정.
 * 순서·라벨·경로·아이콘·색·폰트는 여기만 수정하면 됩니다.
 */

/** 내장 탭 id */
export const BOTTOM_NAV_BUILTIN_IDS = [
  "home",
  "community",
  "stores",
  "orders",
  "chat",
  "my",
] as const;
export type BottomNavBuiltinTabId = (typeof BOTTOM_NAV_BUILTIN_IDS)[number];

/** 탭 id — 내장 + `custom_*` (운영 DB) */
export type BottomNavTabId = string;

/** 아이콘 variant — BottomNav.tsx 레지스트리와 키 일치 (커스텀 탭도 이 중 선택) */
export type BottomNavIconKey = BottomNavBuiltinTabId;

export type BottomNavItemConfig = {
  id: BottomNavTabId;
  href: string;
  label: string;
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
  /** 본문·주문 띠와 톤 구분: 중립 스톤 배경 */
  navClassName:
    "fixed bottom-0 left-0 right-0 z-20 box-border flex border-t border-stone-400 bg-stone-100 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]",
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

/**
 * 고정 하단 탭(`BOTTOM_NAV_SHELL.heightClass`) 위까지 쓰는 전체 화면 높이.
 * 채팅방 등 `pb-0` 본문 + `100dvh` 직접 쓰면 탭에 가려지므로 이 값으로 줄인다.
 */
export const VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS =
  "h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))] max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))]";

/**
 * 매장 상세: 장바구니 띠 + 하단 탭 위까지 스크롤 여유
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
  iconInactiveClass: "text-gray-400",
  labelActiveClass: "font-medium text-signature",
  labelInactiveClass: "text-[#999999]",
  labelSizeClass: "text-[11px]",
} as const;

/** 플로팅 + 버튼이 탭바 위에 오도록 여백 (BottomNav 높이와 맞출 것) */
export const BOTTOM_NAV_FAB_LAYOUT = {
  /** FloatingAddButton — 탭(4rem+safe) + 1rem */
  bottomOffsetClass: "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]",
  rightOffsetClass: "right-4",
} as const;

/**
 * 표시 순서 = 배열 순서. 항목을 빼거나 바꾸면 탭 구성이 바뀝니다.
 * (`as const` 튜플은 선택 스타일 필드가 타입에 안 잡혀 BottomNavItemConfig[] 로 둡니다.)
 */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItemConfig[] = [
  { id: "home", href: "/home", label: "홈", icon: "home" },
  { id: "community", href: "/community", label: "동네생활", icon: "community" },
  { id: "stores", href: "/stores", label: "매장", icon: "stores" },
  { id: "orders", href: "/orders", label: "주문", icon: "orders" },
  { id: "chat", href: "/chats", label: "채팅", icon: "chat" },
  { id: "my", href: "/mypage", label: "내정보", icon: "my" },
  // 예: 탭별 색·폰트만 바꿀 때
  // { id: "home", href: "/home", label: "홈", icon: "home", iconActiveClass: "text-emerald-600", labelActiveExtraClass: "font-semibold" },
];
