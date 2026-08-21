/**
 * BUSINESS MANAGEMENT MATRIX — stores.id MASTER CTA map.
 * STATUS meaning:
 * READY = storeId deep-link + backend filter (or BCC-native write)
 * PARTIAL = domain exists but store context incomplete
 * NOT_READY = writer/filter missing for admin store scope
 * NOT_EXIST = no admin product surface
 */
export type BusinessMgmtStatus = "READY" | "PARTIAL" | "NOT_READY" | "NOT_EXIST";

export type BusinessMgmtRow = {
  domain: string;
  route: string;
  storeFilter: "URL+API" | "API" | "INLINE_BCC" | "NONE";
  filterParam: string | null;
  bccLinkableToday: boolean;
  status: BusinessMgmtStatus;
};

export const BUSINESS_MANAGEMENT_MATRIX: BusinessMgmtRow[] = [
  {
    domain: "기본정보",
    route: "/admin/business/[storeId]",
    storeFilter: "URL+API",
    filterParam: "id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "Owner",
    route: "/admin/users/[ownerUserId]",
    storeFilter: "URL+API",
    filterParam: "owner_user_id",
    bccLinkableToday: true,
    status: "PARTIAL",
  },
  {
    domain: "업종배정",
    route: "/admin/business/[storeId]",
    storeFilter: "URL+API",
    filterParam: "id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "업종마스터",
    route: "/admin/stores/application-settings?menu=stores",
    storeFilter: "NONE",
    filterParam: null,
    bccLinkableToday: false,
    status: "PARTIAL",
  },
  {
    domain: "입점심사",
    route: "/admin/business/[storeId]",
    storeFilter: "URL+API",
    filterParam: "id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "운영상태",
    route: "/admin/business/[storeId]",
    storeFilter: "URL+API",
    filterParam: "id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "영업시간",
    route: "/admin/business/[storeId] (read + set_business_hours / set_delivery_flags)",
    storeFilter: "URL+API",
    filterParam: "id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "메뉴",
    route: "/admin/store-products?store_id= (limited: sold_out/hidden/block/activate/review)",
    storeFilter: "URL+API",
    filterParam: "store_id",
    bccLinkableToday: true,
    status: "PARTIAL",
  },
  {
    domain: "상품",
    route: "/admin/store-products?store_id=",
    storeFilter: "URL+API",
    filterParam: "store_id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "옵션",
    route: "—",
    storeFilter: "NONE",
    filterParam: null,
    bccLinkableToday: false,
    status: "NOT_EXIST",
  },
  {
    domain: "재고",
    route: "—",
    storeFilter: "NONE",
    filterParam: null,
    bccLinkableToday: false,
    status: "NOT_EXIST",
  },
  {
    domain: "배달거리",
    route: "/admin/delivery-distance + BCC inline",
    storeFilter: "INLINE_BCC",
    filterParam: "stores[id] in settings",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "배달지역",
    route: "—",
    storeFilter: "NONE",
    filterParam: null,
    bccLinkableToday: false,
    status: "NOT_EXIST",
  },
  {
    domain: "주문",
    route: "/admin/stores/orders/by-store/[storeId]",
    storeFilter: "URL+API",
    filterParam: "storeId",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "주문(전체목록)",
    route: "/admin/store-orders?store_id=",
    storeFilter: "URL+API",
    filterParam: "store_id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "주문취소",
    route: "/admin/stores/orders/cancellations?store_id=",
    storeFilter: "URL+API",
    filterParam: "store_id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "환불",
    route: "/admin/stores/orders/refunds?store_id=",
    storeFilter: "URL+API",
    filterParam: "store_id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "수수료",
    route: "/admin/store-fee-policies + BCC inline override",
    storeFilter: "INLINE_BCC",
    filterParam: "store_id body",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "프로모션",
    route: "—",
    storeFilter: "NONE",
    filterParam: null,
    bccLinkableToday: false,
    status: "NOT_EXIST",
  },
  {
    domain: "리뷰",
    route: "/admin/store-reviews?store_id=",
    storeFilter: "URL+API",
    filterParam: "store_id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "신고",
    route: "/admin/store-reports?store_id=",
    storeFilter: "URL+API",
    filterParam: "store_id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "제재",
    route: "/admin/business/[storeId]",
    storeFilter: "URL+API",
    filterParam: "id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "알림",
    route: "/admin/notifications*",
    storeFilter: "NONE",
    filterParam: null,
    bccLinkableToday: false,
    status: "NOT_EXIST",
  },
  {
    domain: "정산",
    route: "/admin/store-settlements?store_id=",
    storeFilter: "URL+API",
    filterParam: "store_id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "Audit",
    route: "/admin/audit-logs?target_type=store&target_id=",
    storeFilter: "URL+API",
    filterParam: "target_id",
    bccLinkableToday: true,
    status: "READY",
  },
  {
    domain: "메모",
    route: "/admin/business/[storeId]",
    storeFilter: "URL+API",
    filterParam: "id",
    bccLinkableToday: true,
    status: "READY",
  },
];
