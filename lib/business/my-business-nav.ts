/**
 * 매장 관리 허브 고정 메뉴 — 실제 구현된 라우트만 연결, 나머지는 비활성 플레이스홀더.
 * 항목 추가·순서 변경은 이 파일의 `buildMyBusinessNavGroups`만 수정하면 됩니다.
 *
 * 모든 링크는 캐노니컬 `/stores/owner/*` 로 한 줄 통일한다(`OwnerRoutes`).
 */
import { OwnerRoutes } from "@/lib/business/owner-routes";

/** `MyBusinessNavList`에서 SVG로 매핑 */
export type MyBusinessNavIcon =
  | "identity"
  | "building"
  | "ops_status"
  | "external"
  | "orders"
  | "inquiry"
  | "settlement"
  | "product"
  | "category"
  | "menu_board"
  | "staff"
  | "review"
  | "promo"
  | "settings";

export type MyBusinessNavItem = {
  label: string;
  icon: MyBusinessNavIcon;
  /** 비우면 비활성 행 */
  href?: string;
  /** 같은 페이지 앵커 */
  hash?: string;
  badge?: number;
  disabled?: boolean;
  hint?: string;
};

export type MyBusinessNavGroup = {
  title: string;
  items: MyBusinessNavItem[];
};

export type MyBusinessNavContext = {
  storeId: string;
  slug: string;
  approvalStatus: string;
  isVisible: boolean;
  canSell: boolean;
  /** 접수 대기 + 환불 요청 등 주문 메뉴 배지 (처리 필요 건수 합) */
  orderAlertsBadge: number;
};

export function buildMyBusinessNavGroups(ctx: MyBusinessNavContext): MyBusinessNavGroup[] {
  const { storeId, slug, approvalStatus, isVisible, canSell, orderAlertsBadge } = ctx;
  const approved = approvalStatus === "approved";
  const showOps = approved && isVisible;

  const groups: MyBusinessNavGroup[] = [];

  const storeLinks: MyBusinessNavItem[] = [
    {
      label: "기본 정보",
      icon: "identity",
      href: OwnerRoutes.basicInfo(storeId),
    },
    {
      label: "매장 설정",
      icon: "building",
      href: OwnerRoutes.profile(storeId),
    },
    {
      label: "운영·심사 상태",
      icon: "ops_status",
      href: OwnerRoutes.opsStatus(storeId),
    },
  ];
  if (approved && isVisible && slug) {
    storeLinks.push({
      label: "공개 매장 페이지",
      icon: "external",
      href: `/stores/${encodeURIComponent(slug)}`,
      hint: "고객이 보는 창",
    });
  }
  groups.push({ title: "상점 관리", items: storeLinks });

  const orderItems: MyBusinessNavItem[] = [];
  if (showOps && canSell) {
    orderItems.push({
      label: "주문 관리",
      icon: "orders",
      href: OwnerRoutes.orders(storeId),
      badge: orderAlertsBadge > 0 ? orderAlertsBadge : undefined,
    });
  }
  if (showOps) {
    orderItems.push({
      label: "받은 문의",
      icon: "inquiry",
      href: OwnerRoutes.inquiries(storeId),
    });
    orderItems.push({
      label: "정산 내역",
      icon: "settlement",
      href: OwnerRoutes.settlements(storeId),
    });
  }
  if (orderItems.length > 0) {
    groups.push({ title: "주문·정산", items: orderItems });
  }

  const menuItems: MyBusinessNavItem[] = [];
  if (approved) {
    menuItems.push({
      label: "카테고리",
      icon: "category",
      href: OwnerRoutes.menuCategories(storeId),
    });
    menuItems.push({
      label: "상품 관리 , 등록",
      icon: "product",
      href: OwnerRoutes.products(storeId),
    });
  }
  if (menuItems.length > 0) {
    groups.push({ title: "상품 관리", items: menuItems });
  }

  const extra: MyBusinessNavItem[] = [
    { label: "직원 관리", icon: "staff", disabled: true, hint: "준비 중" },
    { label: "리뷰 관리", icon: "review", href: OwnerRoutes.reviews(storeId) },
    { label: "광고·프로모션", icon: "promo", href: "/my/ads", hint: "노출·신청" },
  ];
  if (approved) {
    extra.unshift({
      label: "알림·운영 설정",
      icon: "settings",
      href: OwnerRoutes.settings(storeId),
      hint: "배달 알림음(전역)",
    });
  }
  groups.push({
    title: "추가 기능",
    items: extra,
  });

  return groups.filter((g) => g.items.length > 0);
}
