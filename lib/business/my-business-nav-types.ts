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
  href?: string;
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
  orderAlertsBadge: number;
};
