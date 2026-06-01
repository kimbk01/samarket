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

function withStoreId(path: string, storeId?: string | null): string {
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
  settlements: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/settlements`, storeId),
  products: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/products`, storeId),
  productNew: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/products/new`, storeId),
  productEdit: (productId: string, storeId?: string | null) =>
    withStoreId(`${OWNER_ROUTES_BASE}/products/${encodeURIComponent(productId)}/edit`, storeId),
  menu: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/menu`, storeId),
  menuCategories: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/menu-categories`, storeId),
  banners: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/banners`, storeId),
  notices: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/notices`, storeId),
  reviews: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/reviews`, storeId),
  points: (storeId?: string | null) => withStoreId(`${OWNER_ROUTES_BASE}/points`, storeId),
} as const;

/**
 * 옛 `/my/business[/...]` · `/mypage/business[/...]` 경로 → `/stores/owner[/...]` 로 매핑.
 * 라우트 레벨 서버 리다이렉트(`app/(main)/my/business/.../page.tsx` 등) 에서 사용한다.
 */
export function mapLegacyOwnerPath(legacy: string): string {
  const trimmed = legacy.replace(/\/+$/, "") || "/";
  if (trimmed === "/my/business" || trimmed === "/mypage/business") return OWNER_ROUTES_BASE;
  if (trimmed === "/my/business/store-orders") return `${OWNER_ROUTES_BASE}/orders`;
  if (trimmed === "/mypage/business/orders") return `${OWNER_ROUTES_BASE}/orders`;
  if (trimmed === "/my/business/store-order-chat") return `${OWNER_ROUTES_BASE}/order-chat`;
  if (trimmed.startsWith("/my/business/store-order-chat/")) {
    return trimmed.replace(/^\/my\/business\/store-order-chat\//, `${OWNER_ROUTES_BASE}/order-chat/`);
  }
  if (trimmed.startsWith("/my/business/")) {
    return trimmed.replace(/^\/my\/business\//, `${OWNER_ROUTES_BASE}/`);
  }
  if (trimmed.startsWith("/mypage/business/")) {
    return trimmed.replace(/^\/mypage\/business\//, `${OWNER_ROUTES_BASE}/`);
  }
  return OWNER_ROUTES_BASE;
}

/** 매장 슬러그 충돌 방지를 위한 예약어. `/stores/owner` 와 정적 라우트들을 가린다. */
export const RESERVED_STORE_SLUGS = new Set<string>([
  "owner",
  "browse",
  "cart",
  "checkout",
  "search",
]);
