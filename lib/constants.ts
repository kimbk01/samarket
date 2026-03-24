/**
 * 1단계: 탭·지역 mock 설정
 * 하단 탭 기본값은 `lib/main-menu/bottom-nav-config.ts` — 운영 반영은 `admin_settings.main_bottom_nav`.
 * SAMarket 표면(거래·커뮤니티·매장·채팅·계정) ↔ 주요 경로: `lib/app/samarket-route-map.ts`.
 */

export { BOTTOM_NAV_ITEMS as TAB_LIST, type BottomNavTabId as TabId } from "./main-menu/bottom-nav-config";

export const MOCK_REGIONS = [
  { id: "1", name: "Manila", sub: "Malate" },
  { id: "2", name: "Quezon City", sub: "Diliman" },
  { id: "3", name: "Cebu", sub: "Lahug" },
  { id: "4", name: "Angeles", sub: "Balibago" },
] as const;
