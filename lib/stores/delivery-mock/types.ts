/**
 * 배달 주문 시뮬레이션 타입 (Supabase 대응: store_products, option_groups, options, cart_items, store_orders …)
 */

export type DeliveryFulfillmentMode = "delivery" | "pickup";

/** 옵션 1개 (store_menu_options) */
export interface DeliveryMenuOption {
  id: string;
  name: string;
  priceDelta: number;
}

/** 옵션 그룹 (store_menu_option_groups) */
export interface DeliveryMenuOptionGroup {
  id: string;
  nameKo: string;
  minSelect: number;
  maxSelect: number;
  options: DeliveryMenuOption[];
}

/** 메뉴 1줄 (store_menus / store_products) */
export interface DeliveryMenuItem {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  description?: string;
  image?: string | null;
  price: number;
  isSoldOut: boolean;
  isPopular: boolean;
  isRecommended: boolean;
  displayOrder: number;
  optionGroups: DeliveryMenuOptionGroup[];
}

/** 메뉴 카테고리(섹션) */
export interface DeliveryMenuCategory {
  id: string;
  nameKo: string;
  sortOrder: number;
  items: DeliveryMenuItem[];
}

/** 업체 배달 정책 (stores 확장 필드 성격) */
export interface RestaurantDeliveryProfile {
  minOrderAmount: number;
  deliveryFee: number;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  estPrepTimeLabel: string;
}

export interface RestaurantDeliveryCatalog {
  storeId: string;
  storeSlug: string;
  profile: RestaurantDeliveryProfile;
  categories: DeliveryMenuCategory[];
}

/** 장바구니에 담긴 옵션 선택 */
export interface CartSelectedOption {
  groupId: string;
  groupNameKo: string;
  options: { optionId: string; name: string; priceDelta: number }[];
}

export interface DeliveryCartLine {
  lineId: string;
  menuItemId: string;
  menuName: string;
  basePrice: number;
  selections: CartSelectedOption[];
  quantity: number;
}

export type DeliveryOrderStatusDelivery =
  | "received"
  | "approved"
  | "cooking"
  | "cooked"
  | "delivering"
  | "delivered"
  | "cancelled";

export type DeliveryOrderStatusPickup =
  | "received"
  | "approved"
  | "cooking"
  | "pickup_ready"
  | "picked_up"
  | "cancelled";

export interface SimulatedDeliveryOrderLine {
  menuName: string;
  quantity: number;
  optionSummary: string;
  lineTotal: number;
}

export interface SimulatedDeliveryOrder {
  id: string;
  orderNo: string;
  storeSlug: string;
  storeNameKo: string;
  mode: DeliveryFulfillmentMode;
  status: DeliveryOrderStatusDelivery | DeliveryOrderStatusPickup;
  lines: SimulatedDeliveryOrderLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** 배달 */
  addressLine?: string;
  addressDetail?: string;
  contactPhone?: string;
  requestNote?: string;
  handoffNote?: string;
  /** 포장 */
  pickupTimeNote?: string;
  createdAt: string;
  etaLabel: string;
  /** 시뮬: 타임라인에서 완료 처리할 마지막 인덱스 (0부터) */
  timelineIndex?: number;
}
