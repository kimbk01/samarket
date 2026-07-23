export type SoCustomerListDto = {
  authority: "domain_store_order_customer_list_canary";
  viewerUserId: string;
  surfaceRole: "customer";
  producedAt: string;
  hub: {
    roomCount: number;
    unreadRoomCount: number;
    latestRoomId: string | null;
    previewText: string;
  };
  rows: Array<{
    roomId: string;
    chatDomain: "store_order";
    domainIdentityKey: string;
    orderId: string;
    storeName: string;
    storeImageUrl: string | null;
    previewText: string;
    statusBadge: string | null;
    unreadCount: number;
    lastMessageAt: string;
    href: string;
    exposesMemberIdentity: false;
  }>;
};

/**
 * 주문 채팅 목록(Domain canary) SWR 즉시 페인트용 세션 캐시.
 * Trade list cache와 동일 계약 — cold mount에서 "불러오는 중…" 전체화면을 피한다.
 */

const STORAGE_KEY_PREFIX = "samarket.messenger.domain-so-customer-list-canary.v1.";

type CacheEntry = { at: number; dto: SoCustomerListDto };

function storageKey(viewerUserId: string): string {
  return `${STORAGE_KEY_PREFIX}${viewerUserId}`;
}

export function peekDomainStoreOrderCustomerListCanaryCache(
  viewerUserId: string | null | undefined
): SoCustomerListDto | null {
  const uid = viewerUserId?.trim();
  if (!uid || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.dto || parsed.dto.viewerUserId !== uid) return null;
    const dto = parsed.dto;
    if (typeof dto.hub?.unreadRoomCount !== "number") {
      dto.hub = {
        ...dto.hub,
        unreadRoomCount: dto.rows.filter((r) => r.unreadCount > 0).length,
      };
    }
    return dto;
  } catch {
    return null;
  }
}

export function primeDomainStoreOrderCustomerListCanaryCache(dto: SoCustomerListDto): void {
  const uid = dto.viewerUserId?.trim();
  if (!uid || typeof window === "undefined") return;
  try {
    const entry: CacheEntry = { at: Date.now(), dto };
    sessionStorage.setItem(storageKey(uid), JSON.stringify(entry));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearDomainStoreOrderCustomerListCanaryCache(
  viewerUserId: string | null | undefined
): void {
  const uid = viewerUserId?.trim();
  if (!uid || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(uid));
  } catch {
    /* ignore */
  }
}
