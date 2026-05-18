/**
 * 매장 관리 허브 고정 메뉴 — 실제 구현된 라우트만 연결, 나머지는 비활성 플레이스홀더.
 * 항목 추가·순서 변경은 `buildMyBusinessNavGroups`만 수정하면 됩니다.
 */
export type {
  MyBusinessNavIcon,
  MyBusinessNavItem,
  MyBusinessNavGroup,
  MyBusinessNavContext,
} from "@/lib/business/my-business-nav-types";

export { buildMyBusinessNavGroups } from "@/lib/business/my-business-nav-i18n";
