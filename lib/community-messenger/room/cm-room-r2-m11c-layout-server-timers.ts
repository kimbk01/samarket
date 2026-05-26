import { getHomeTradeChipCategoriesForServer } from "@/lib/categories/get-home-trade-chip-categories-server";
import { loadMainBottomNavItemsServerCached } from "@/lib/main-menu/load-main-bottom-nav-items-server";
import type { MainBottomNavServerPayload } from "@/lib/main-menu/load-main-bottom-nav-items-server";
import type { CategoryWithSettings } from "@/lib/categories/types";

/** R2-M11C — layout 함수 진입 기준 누적 ms (`performance.now()`). */
export type R2M11CLayoutServerPayload = {
  /** 1. layout 함수 진입 */
  layout_entry_ms: 0;
  /** 2. headers/cookies — layout 경로에서 미호출 시 0 */
  headers_cookies_ms: number;
  headers_cookies_invoked: boolean;
  /** 3. auth/profile await — layout 경로에서 미호출 시 0 (proxy 단일) */
  auth_profile_await_ms: number;
  auth_profile_invoked: boolean;
  /** 4. bottom nav 서버 로드 */
  bottom_nav_load_start_ms: number;
  bottom_nav_load_done_ms: number;
  bottom_nav_load_ms: number;
  /** 5. menu/category 서버 로드 */
  menu_load_start_ms: number;
  menu_load_done_ms: number;
  menu_load_ms: number;
  /** 6. children render 직전 */
  children_render_before_ms: number;
  main_layout_server_done_ms: number;
  main_layout_total_ms: number;
  parallel_bottleneck_ms: number;
};

export type R2M11CRoomSegmentServerPayload = {
  /** 7. room page server */
  room_segment_server_start_ms: 0;
  room_segment_server_done_ms: number;
  room_segment_server_wall_ms: number;
};

function elapsedSince(layoutT0: number): number {
  return Math.max(0, Math.round(performance.now() - layoutT0));
}

/**
 * R2-M11C — `(main) layout.tsx` 분해 계측(동작·캐시·페이로드 변경 없음).
 * headers/cookies·auth/profile 은 layout 에서 호출하지 않으면 0·invoked=false 만 기록.
 */
export async function measureMainLayoutServerLoads(opts?: {
  probeHeadersCookies?: () => Promise<void>;
  probeAuthProfile?: () => Promise<void>;
}): Promise<{
  initialMainBottomNavItems: MainBottomNavServerPayload["items"];
  initialTradeTabCategories: CategoryWithSettings[];
  timing: R2M11CLayoutServerPayload;
}> {
  const layoutT0 = performance.now();
  let headersCookiesMs = 0;
  let headersCookiesInvoked = false;
  let authProfileMs = 0;
  let authProfileInvoked = false;
  let bottomNavMs = 0;
  let bottomNavStartMs = 0;
  let bottomNavDoneMs = 0;
  let menuMs = 0;
  let menuStartMs = 0;
  let menuDoneMs = 0;

  if (opts?.probeHeadersCookies) {
    headersCookiesInvoked = true;
    const s = performance.now();
    await opts.probeHeadersCookies();
    headersCookiesMs = Math.max(0, Math.round(performance.now() - s));
  }

  if (opts?.probeAuthProfile) {
    authProfileInvoked = true;
    const s = performance.now();
    await opts.probeAuthProfile();
    authProfileMs = Math.max(0, Math.round(performance.now() - s));
  }

  bottomNavStartMs = elapsedSince(layoutT0);
  const bottomNavP = (async () => {
    const s = performance.now();
    const payload = await loadMainBottomNavItemsServerCached();
    bottomNavMs = Math.max(0, Math.round(performance.now() - s));
    return payload;
  })();

  menuStartMs = elapsedSince(layoutT0);
  const menuP = (async () => {
    const s = performance.now();
    const categories = await getHomeTradeChipCategoriesForServer();
    menuMs = Math.max(0, Math.round(performance.now() - s));
    return categories;
  })();

  const [navPayload, initialTradeTabCategories] = await Promise.all([bottomNavP, menuP]);
  bottomNavDoneMs = elapsedSince(layoutT0);
  menuDoneMs = elapsedSince(layoutT0);

  const childrenRenderBeforeMs = elapsedSince(layoutT0);
  const layoutDoneMs = childrenRenderBeforeMs;

  const timing: R2M11CLayoutServerPayload = {
    layout_entry_ms: 0,
    headers_cookies_ms: headersCookiesMs,
    headers_cookies_invoked: headersCookiesInvoked,
    auth_profile_await_ms: authProfileMs,
    auth_profile_invoked: authProfileInvoked,
    bottom_nav_load_start_ms: bottomNavStartMs,
    bottom_nav_load_done_ms: bottomNavDoneMs,
    bottom_nav_load_ms: bottomNavMs,
    menu_load_start_ms: menuStartMs,
    menu_load_done_ms: menuDoneMs,
    menu_load_ms: menuMs,
    children_render_before_ms: childrenRenderBeforeMs,
    main_layout_server_done_ms: layoutDoneMs,
    main_layout_total_ms: layoutDoneMs,
    parallel_bottleneck_ms: Math.max(bottomNavMs, menuMs),
  };

  return { initialMainBottomNavItems: navPayload.items, initialTradeTabCategories, timing };
}

/**
 * `(stores)` 허브 전용 — bottom nav만 프라임하고 TRADE 칩 DB(`getHomeTradeChipCategoriesForServer`)는 생략.
 * `/stores` UI는 trade 탭을 쓰지 않으므로 `(main)` 과 동일한 menu await 병목을 제거한다.
 */
export async function measureStoresHubLayoutServerLoads(): Promise<{
  initialMainBottomNavItems: MainBottomNavServerPayload["items"];
  timing: R2M11CLayoutServerPayload;
}> {
  const layoutT0 = performance.now();
  let bottomNavMs = 0;
  const bottomNavStartMs = elapsedSince(layoutT0);
  const s = performance.now();
  const navPayload = await loadMainBottomNavItemsServerCached();
  bottomNavMs = Math.max(0, Math.round(performance.now() - s));
  const bottomNavDoneMs = elapsedSince(layoutT0);
  const childrenRenderBeforeMs = elapsedSince(layoutT0);

  const timing: R2M11CLayoutServerPayload = {
    layout_entry_ms: 0,
    headers_cookies_ms: 0,
    headers_cookies_invoked: false,
    auth_profile_await_ms: 0,
    auth_profile_invoked: false,
    bottom_nav_load_start_ms: bottomNavStartMs,
    bottom_nav_load_done_ms: bottomNavDoneMs,
    bottom_nav_load_ms: bottomNavMs,
    menu_load_start_ms: 0,
    menu_load_done_ms: 0,
    menu_load_ms: 0,
    children_render_before_ms: childrenRenderBeforeMs,
    main_layout_server_done_ms: childrenRenderBeforeMs,
    main_layout_total_ms: childrenRenderBeforeMs,
    parallel_bottleneck_ms: bottomNavMs,
  };

  return { initialMainBottomNavItems: navPayload.items, timing };
}

export function measureRoomSegmentServerWall(): R2M11CRoomSegmentServerPayload {
  const serverT0 = performance.now();
  const wallMs = Math.max(0, Math.round(performance.now() - serverT0));
  return {
    room_segment_server_start_ms: 0,
    room_segment_server_done_ms: wallMs,
    room_segment_server_wall_ms: wallMs,
  };
}

export type R2M11CVerdictCategory =
  | "layout_server_work"
  | "bottom_nav_menu"
  | "auth_profile"
  | "next_rsc_flight";

const LAYOUT_TOTAL_THRESHOLD_MS = 150;
const SUB_AWAIT_THRESHOLD_MS = 100;

/** 측정 수치만으로 4분류 중 1개 판정(계측 라운드 전용). */
export function judgeR2M11CVerdictCategory(input: {
  main_layout_total_ms: number;
  bottom_nav_load_ms: number;
  menu_load_ms: number;
  auth_profile_await_ms: number;
  auth_profile_invoked: boolean;
  remaining_flight_gap_ms: number;
  rsc_flight_ms: number;
}): R2M11CVerdictCategory {
  const { bottom_nav_load_ms, menu_load_ms, auth_profile_await_ms, auth_profile_invoked } = input;

  if (auth_profile_invoked && auth_profile_await_ms >= SUB_AWAIT_THRESHOLD_MS) {
    return "auth_profile";
  }

  const navMenuMax = Math.max(bottom_nav_load_ms, menu_load_ms);
  if (navMenuMax >= SUB_AWAIT_THRESHOLD_MS) {
    return "bottom_nav_menu";
  }

  if (input.main_layout_total_ms >= LAYOUT_TOTAL_THRESHOLD_MS) {
    return "layout_server_work";
  }

  return "next_rsc_flight";
}
