import type { MyServiceRow, MyPageSectionRow } from "./types";

/** `getMyPageData`·서버 선로딩에서 동일 기본값 사용 */
export const DEFAULT_MY_SERVICES: MyServiceRow[] = [
  { code: "products", label: "내상품", icon_key: "box", href: "/my/products", is_active: true, sort_order: 0, admin_only: false, country_code: null },
  { code: "business", label: "내 상점", icon_key: "store", href: "/my/business", is_active: true, sort_order: 1, admin_only: false, country_code: null },
  { code: "ads", label: "광고 신청", icon_key: "megaphone", href: "/my/ads", is_active: true, sort_order: 2, admin_only: false, country_code: null },
  { code: "points", label: "포인트", icon_key: "coin", href: "/my/points", is_active: true, sort_order: 3, admin_only: false, country_code: null },
  { code: "benefits", label: "회원 혜택", icon_key: "gift", href: "/my/benefits", is_active: true, sort_order: 4, admin_only: false, country_code: null },
  { code: "reviews", label: "받은 후기", icon_key: "star", href: "/my/reviews", is_active: true, sort_order: 5, admin_only: false, country_code: null },
  { code: "regions", label: "동네 설정", icon_key: "map", href: "/my/regions", is_active: true, sort_order: 6, admin_only: false, country_code: null },
  { code: "blocked", label: "차단 목록", icon_key: "block", href: "/my/settings/blocked-users", is_active: true, sort_order: 7, admin_only: false, country_code: null },
];

export const DEFAULT_MY_SECTIONS: MyPageSectionRow[] = [
  { section_key: "deals", title: "나의 거래", is_active: true, sort_order: 0 },
  { section_key: "interests", title: "나의 관심", is_active: true, sort_order: 1 },
  { section_key: "activity", title: "나의 활동", is_active: true, sort_order: 2 },
  { section_key: "business", title: "나의 비즈니스", is_active: true, sort_order: 3 },
];
