import { readCachedMeAddressList } from "@/lib/addresses/address-list-client-cache";
import type { StoreCommerceCartBucket } from "@/lib/stores/store-commerce-cart-types";
import { parseStoreSummaryPayload } from "@/lib/stores/store-detail-split-types";
import {
  peekStorePublicCache,
  peekStoreSummaryPublicCache,
  type StoreApiJsonResponse,
} from "@/lib/stores/store-delivery-api-client";
import { peekMeProfileCached } from "@/lib/profile/fetch-me-profile-deduped";
import { resolveProfilePhoneDb09 } from "@/lib/profile/resolve-profile-phone";
import type { ProfileRow } from "@/lib/profile/types";
import { parsePhMobileInput } from "@/lib/utils/ph-mobile";

/** 장바구니 `loadStore` 와 동일 최소 필드 — API 응답·캐시 히트용 */
export type StoreCartHead = {
  id: string;
  store_name: string;
  slug: string;
  profile_image_url: string | null;
  business_hours_json: unknown;
  is_open: boolean | null;
  pickup_available: boolean | null;
  delivery_available: boolean | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
  can_order_store?: boolean;
  owner_block_message?: string | null;
};

export function storeCartHeadFromCommerceBucket(bucket: StoreCommerceCartBucket): StoreCartHead {
  return {
    id: bucket.storeId,
    store_name: bucket.storeName,
    slug: bucket.storeSlug,
    profile_image_url: null,
    business_hours_json: null,
    is_open: true,
    pickup_available: true,
    delivery_available: true,
    region: null,
    city: null,
    district: null,
    address_line1: null,
    address_line2: null,
    can_order_store: true,
    owner_block_message: null,
  };
}

export function parseStoreCartHeadFromPublicJson(
  storeSlug: string,
  raw: Record<string, unknown>,
  meta?: Record<string, unknown> | null
): StoreCartHead {
  return {
    id: raw.id as string,
    store_name: raw.store_name as string,
    slug: (raw.slug as string) ?? storeSlug,
    profile_image_url:
      typeof raw.profile_image_url === "string" && raw.profile_image_url.trim()
        ? raw.profile_image_url.trim()
        : null,
    business_hours_json: raw.business_hours_json,
    is_open: (raw.is_open as boolean | null | undefined) ?? null,
    pickup_available: (raw.pickup_available as boolean | null | undefined) ?? null,
    delivery_available: (raw.delivery_available as boolean | null | undefined) ?? null,
    region: typeof raw.region === "string" ? raw.region : null,
    city: typeof raw.city === "string" ? raw.city : null,
    district: typeof raw.district === "string" ? raw.district : null,
    address_line1: typeof raw.address_line1 === "string" ? raw.address_line1 : null,
    address_line2: typeof raw.address_line2 === "string" ? raw.address_line2 : null,
    can_order_store: meta?.can_order_store !== false,
    owner_block_message:
      typeof meta?.owner_block_message === "string" ? meta.owner_block_message : null,
  };
}

export function peekStoreCartHeadFromPublicCache(storeSlug: string): StoreCartHead | null {
  const fromSummary = peekStoreCartHeadFromSummaryCache(storeSlug);
  if (fromSummary) return fromSummary;
  const hit: StoreApiJsonResponse | null = peekStorePublicCache(storeSlug);
  if (!hit || hit.status !== 200) return null;
  const j = hit.json as {
    ok?: boolean;
    store?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };
  if (!j?.ok || !j.store) return null;
  return parseStoreCartHeadFromPublicJson(storeSlug, j.store, j.meta);
}

/** 상세 `/summary` prewarm·캐시 — monolith GET 없이 카트 헤더 즉시 표시 */
export function peekStoreCartHeadFromSummaryCache(storeSlug: string): StoreCartHead | null {
  const hit = peekStoreSummaryPublicCache(storeSlug);
  if (!hit || hit.status !== 200) return null;
  const parsed = parseStoreSummaryPayload(hit.json);
  if (!parsed.ok || !parsed.store?.id) return null;
  const s = parsed.store as Record<string, unknown>;
  const meta = parsed.meta as Record<string, unknown> | undefined;
  return parseStoreCartHeadFromPublicJson(storeSlug, s, meta);
}

export function readProfilePhoneDigitsFromMeProfileCache(): string {
  const cached = peekMeProfileCached();
  if (!cached || cached.status < 200 || cached.status >= 300) return "";
  const json = cached.json as { ok?: boolean; profile?: ProfileRow | null };
  if (!json?.ok || !json.profile) return "";
  return parsePhMobileInput(resolveProfilePhoneDb09(json.profile) ?? "");
}

/** 첫 페인트용 — 네트워크 전 sessionStorage·프로필 캐시 */
export function readStoreCartCheckoutCachePaint() {
  return {
    cachedAddresses: readCachedMeAddressList(),
    profileDigits: readProfilePhoneDigitsFromMeProfileCache(),
  };
}

export function scheduleStoreCartIdleTask(task: () => void): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(() => task(), { timeout: 2500 });
    return;
  }
  window.setTimeout(task, 400);
}
