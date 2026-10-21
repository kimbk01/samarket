/**
 * 매장 오너(배달) 도메인 캐노니컬 URL — `/stores/owner/*` 한 줄로 통일.
 *
 * 배경: 과거 `/my/business/*` 와 `/mypage/business/*` 가 공존하면서 같은 화면이 두 URL 로 노출되어
 * 사용자·운영팀에 혼선을 일으켰다. **사용자 노출 URL 은 모두 `/stores/owner/*` 하나** 로 모은다.
 *
 * - 새로 만드는 링크/리다이렉트/네비는 반드시 이 헬퍼를 사용한다.
 * - 옛 경로(`/my/business/*`, `/mypage/business/*`) 는 라우트 레벨에서 `/stores/owner/*` 로
 *   서버 리다이렉트한다(이 파일이 옛 경로를 알 필요 없음).
 *
 * `storeId` 쿼리는 BusinessAdminShell·`buildStoreOrdersHref` 등에서 운영중인 매장 컨텍스트를
 * 바꾸기 위해 사용한다(서버는 `storeId` 없으면 owner 의 대표 매장으로 자동 해석).
 */

export const OWNER_ROUTES_BASE = "/stores/owner";

/** `?storeId=` 부착 (이미 쿼리가 있으면 `&`). 빈 값이면 원본 그대로. */
export function withStoreId(path: string, storeId?: string | null): string {
  const sid = (storeId ?? "").trim();
  if (!sid) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}storeId=${encodeURIComponent(sid)}`;
}

export const OwnerRoutes = {
  hub: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}`, storeId),
  apply: () => `${OWNER_ROUTES_BASE}/apply`,
  profile: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/profile`, storeId),
  basicInfo: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/basic-info`, storeId),
  opsStatus: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/ops-status`, storeId),
  edit: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/edit`, storeId),
  settings: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/settings`, storeId),
  orders: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/orders`, storeId),
  /** 이 매장(`storeId`) 주문에 붙은 메신저 방만 — 타 매장 주문 혼합 없음 */
  orderChats: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/order-chats`, storeId),
  orderChat: (orderId: string) => `${OWNER_ROUTES_BASE}/order-chat/${encodeURIComponent(orderId)}`,
  inquiries: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/inquiries`, storeId),
  /** Owner Care Hub — order chat / store inquiry / customer center */
  customerCare: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/customer-care`, storeId),
  /**
   * Owner Customer Center — Support Modal entry + history/archive tabs (A2-1).
   * `tab`: messages|inquiries (legacy aliases → archive) or omit for history default.
   */
  customerCareCenter: (storeId?: string | null, tab?: "messages" | "inquiries" | null) => {
    const base = withStoreId(`${OWNER_ROUTES_BASE}/customer-care/customer-center`, storeId);
    if (tab !== "messages" && tab !== "inquiries") return base;
    return `${base}${base.includes("?") ? "&" : "?"}tab=${tab}`;
  },
  customerCareMessages: (storeId?: string | null) =>
    withStoreId(`${OWNER_ROUTES_BASE}/customer-care/messages`, storeId),
  /** Platform 1:1 CS under Owner Care (distinct from store inquiries) — IA-12 단일 헬퍼 */
  customerCareCsInquiries: (storeId?: string | null) =>
    withStoreId(`${OWNER_ROUTES_BASE}/customer-care/inquiries`, storeId),
  customerCareMessageThread: (threadId: string, storeId?: string | null) =>
    withStoreId(
      `${OWNER_ROUTES_BASE}/customer-care/messages/${encodeURIComponent(threadId.trim())}`,
      storeId
    ),
  customerCareInquiryThread: (threadId: string, storeId?: string | null) =>
    withStoreId(
      `${OWNER_ROUTES_BASE}/customer-care/inquiries/${encodeURIComponent(threadId.trim())}`,
      storeId
    ),
  giftCertificatesMoney: (storeId?: string | null) => {
    const base = withStoreId(`${OWNER_ROUTES_BASE}/gift-certificates`, storeId);
    return `${base}${base.includes("?") ? "&" : "?"}view=money`;
  },
  giftCertificatesRedemptions: (storeId?: string | null) => {
    const base = withStoreId(`${OWNER_ROUTES_BASE}/gift-certificates`, storeId);
    return `${base}${base.includes("?") ? "&" : "?"}view=redemptions`;
  },
  settlements: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/settlements`, storeId),
  products: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/products`, storeId),
  productNew: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/products/new`, storeId),
  productEdit: (productId: string, storeId?: string | null) =>
    withStoreId(`${OWNER_ROUTES_BASE}/products/${encodeURIComponent(productId)}/edit`, storeId),
  /**
   * 하단 「메뉴」탭 canonical — 상품 허브와 동일 (`/menu` redirect hop 금지).
   * 레거시 `/stores/owner/menu` inbound만 redirect 유지.
   */
  menu: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/products`, storeId),
  menuCategories: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/menu-categories`, storeId),
  banners: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/banners`, storeId),
  coupons: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/coupons`, storeId),
  couponsCreate: (storeId?: string | null) => {
    const base = withStoreId(`${OWNER_ROUTES_BASE}/coupons`, storeId);
    return `${base}${base.includes("?") ? "&" : "?"}create=1`;
  },
  couponsDetail: (campaignId: string, storeId?: string | null) => {
    const id = campaignId.trim();
    const base = withStoreId(`${OWNER_ROUTES_BASE}/coupons`, storeId);
    if (!id) return base;
    return `${base}${base.includes("?") ? "&" : "?"}campaign=${encodeURIComponent(id)}`;
  },
  /** Paid Gift Certificate — separate from free coupons and archived store-credit schema */
  giftCertificates: (storeId?: string | null) =>
    withStoreId(`${OWNER_ROUTES_BASE}/gift-certificates`, storeId),
  giftCertificatesApply: (storeId?: string | null) => {
    const base = withStoreId(`${OWNER_ROUTES_BASE}/gift-certificates`, storeId);
    return `${base}${base.includes("?") ? "&" : "?"}view=apply`;
  },
  giftCertificatesHistory: (storeId?: string | null) => {
    const base = withStoreId(`${OWNER_ROUTES_BASE}/gift-certificates`, storeId);
    return `${base}${base.includes("?") ? "&" : "?"}view=history`;
  },
  notices: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/notices`, storeId),
  reviews: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/reviews`, storeId),
  finance: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/finance`, storeId),
  /** @deprecated Owner 자산은 Finance의 Coin/Cash만 사용한다. */
  points: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/finance`, storeId),
  /** Delivery Ads Owner hub — canonical entry (not /my/ads /mypage feed ads). */
  ads: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/ads`, storeId),
  /** 광고 그룹(08) 하위 — 이벤트 프로모션 신청 목록 (IA-18 진입점). */
  adsEventPromotions: (storeId?: string | null) =>
    withStoreId(`${OWNER_ROUTES_BASE}/ads/event-promotions`, storeId),
  /** Owner store notification inbox (canonical; slug path remains compatibility). */
  notifications: (storeId?: string | null) =>
    withStoreId(`${OWNER_ROUTES_BASE}/notifications`, storeId),
  /** Owner order/store sound · vibration preferences. */
  notificationSettings: (storeId?: string | null) =>
    withStoreId(`${OWNER_ROUTES_BASE}/notification-settings`, storeId),
} as const;

/**
 * 레거시 오너 URL → 캐노니컬 1홉 매핑표 (IA-07). 2홉(`/menu`→`/products`, `/edit`→`/profile`) 금지.
 * 동적 세그먼트(`products/[productId]/edit`, `store-order-chat/[orderId]`)는 `mapLegacyOwnerPath` 접두 규칙.
 */
export const LEGACY_OWNER_PATH_MAP: Readonly<Record<string, string>> = {
  "/my/business": OWNER_ROUTES_BASE,
  "/my/business/apply": `${OWNER_ROUTES_BASE}/apply`,
  "/my/business/banners": `${OWNER_ROUTES_BASE}/banners`,
  "/my/business/basic-info": `${OWNER_ROUTES_BASE}/basic-info`,
  "/my/business/edit": `${OWNER_ROUTES_BASE}/profile`,
  "/my/business/inquiries": `${OWNER_ROUTES_BASE}/inquiries`,
  "/my/business/menu": `${OWNER_ROUTES_BASE}/products`,
  "/my/business/menu-categories": `${OWNER_ROUTES_BASE}/menu-categories`,
  "/my/business/notices": `${OWNER_ROUTES_BASE}/notices`,
  "/my/business/ops-status": `${OWNER_ROUTES_BASE}/ops-status`,
  "/my/business/products": `${OWNER_ROUTES_BASE}/products`,
  "/my/business/products/new": `${OWNER_ROUTES_BASE}/products/new`,
  "/my/business/profile": `${OWNER_ROUTES_BASE}/profile`,
  "/my/business/reviews": `${OWNER_ROUTES_BASE}/reviews`,
  "/my/business/settings": `${OWNER_ROUTES_BASE}/settings`,
  "/my/business/settlements": `${OWNER_ROUTES_BASE}/settlements`,
  /** 주문 id 없는 진입 — 주문 채팅 목록 (`/order-chat` 단독 페이지는 없음) */
  "/my/business/store-order-chat": `${OWNER_ROUTES_BASE}/order-chats`,
  "/my/business/store-orders": `${OWNER_ROUTES_BASE}/orders`,
  "/mypage/business": OWNER_ROUTES_BASE,
  "/mypage/business/apply": `${OWNER_ROUTES_BASE}/apply`,
  "/mypage/business/orders": `${OWNER_ROUTES_BASE}/orders`,
  "/mypage/business/profile": `${OWNER_ROUTES_BASE}/profile`,
};

function safeDecodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/**
 * 옛 `/my/business[/...]` · `/mypage/business[/...]` 경로 → `/stores/owner[/...]` 로 매핑.
 * 라우트 레벨 서버 리다이렉트(`app/(main)/my/business/.../page.tsx` 등) 에서 사용한다.
 */
export function mapLegacyOwnerPath(legacy: string): string {
  const trimmed = legacy.replace(/\/+$/, "") || "/";
  const mapped = LEGACY_OWNER_PATH_MAP[trimmed];
  if (mapped) return mapped;
  const chat = /^\/my\/business\/store-order-chat\/([^/]+)$/.exec(trimmed);
  if (chat?.[1]) return OwnerRoutes.orderChat(safeDecodeSegment(chat[1]));
  const productEdit = /^\/my\/business\/products\/([^/]+)\/edit$/.exec(trimmed);
  if (productEdit?.[1]) return OwnerRoutes.productEdit(safeDecodeSegment(productEdit[1]));
  if (trimmed.startsWith("/my/business/")) {
    return trimmed.replace(/^\/my\/business\//, `${OWNER_ROUTES_BASE}/`);
  }
  if (trimmed.startsWith("/mypage/business/")) {
    return trimmed.replace(/^\/mypage\/business\//, `${OWNER_ROUTES_BASE}/`);
  }
  return OWNER_ROUTES_BASE;
}

export type OwnerRouteSearchParams = Record<string, string | string[] | undefined>;

/** 전체 searchParams 를 순서대로 직렬화 (`omit` 키 제외, 빈 값 제외, 배열은 반복 키). */
export function appendOwnerSearchParams(
  path: string,
  searchParams?: OwnerRouteSearchParams | null,
  omit: readonly string[] = []
): string {
  if (!searchParams) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (omit.includes(k) || v == null) continue;
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) {
      const raw = String(item ?? "");
      const value = k === "storeId" ? raw.trim() : raw;
      if (value) qs.append(k, value);
    }
  }
  const tail = qs.toString();
  if (!tail) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${tail}`;
}

function firstParam(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/**
 * legacy owner URL → canonical `/stores/owner/*` (전체 searchParams 보존 — IA-07).
 * `/my/business/store-order-chat?orderId=` 는 경로 파라미터 `/stores/owner/order-chat/[orderId]` 로 매핑.
 * page.tsx 서버 리다이렉트 전용 — Owner View/Shell import 금지.
 */
export function buildLegacyOwnerRedirectHref(
  legacyPath: string,
  searchParams?: OwnerRouteSearchParams | null
): string {
  const trimmed = legacyPath.replace(/\/+$/, "") || "/";
  if (trimmed === "/my/business/store-order-chat") {
    const orderId = firstParam(searchParams?.orderId) || firstParam(searchParams?.order_id);
    if (orderId) {
      return appendOwnerSearchParams(OwnerRoutes.orderChat(orderId), searchParams, [
        "orderId",
        "order_id",
      ]);
    }
  }
  return appendOwnerSearchParams(mapLegacyOwnerPath(trimmed), searchParams);
}

/**
 * `/stores/owner/customer-care/{messages,inquiries}` 목록 URL → 고객센터 탭 (IA-12 서버 redirect, 1홉).
 * storeId·기타 쿼리 보존, `from` 이 없으면 `owner-care` 부여(기존 클라 redirect 와 동일 결과).
 */
export function buildOwnerCareCenterRedirectHref(
  tab: "messages" | "inquiries",
  searchParams?: OwnerRouteSearchParams | null
): string {
  const storeId = firstParam(searchParams?.storeId);
  const base = OwnerRoutes.customerCareCenter(storeId, tab);
  const rest: OwnerRouteSearchParams = { ...(searchParams ?? {}) };
  delete rest.storeId;
  delete rest.tab;
  if (!firstParam(rest.from)) rest.from = "owner-care";
  return appendOwnerSearchParams(base, rest);
}

/** `/stores/[slug]/owner/*` 호환 경로 3종 — 캐노니컬 `/stores/owner/*` (IA-07·IA-18). */
export const SLUG_OWNER_SECTIONS = ["orders", "notifications", "notification-settings"] as const;
export type SlugOwnerSection = (typeof SLUG_OWNER_SECTIONS)[number];

/**
 * 슬러그 오너 경로 → `?storeId=` 캐노니컬 (전체 쿼리 보존). 슬러그 미해석이면 storeId 없이 이동하고
 * 셸이 활성 매장으로 정규화한다(IA-08).
 */
export function buildSlugOwnerRedirectHref(
  section: SlugOwnerSection,
  storeId: string | null | undefined,
  searchParams?: OwnerRouteSearchParams | null
): string {
  const base = withStoreId(`${OWNER_ROUTES_BASE}/${section}`, storeId);
  return appendOwnerSearchParams(base, searchParams, ["storeId"]);
}

/** 매장 슬러그 충돌 방지를 위한 예약어. `/stores/owner` 와 정적 라우트들을 가린다. */
export const RESERVED_STORE_SLUGS = new Set<string>([
  "owner",
  "browse",
  "cart",
  "checkout",
  "search",
]);
