/**
 * 매장 목록/피드 카드 → 상세 PASS1(summary) 즉시 표시용 session seed.
 * API summary 수신 전 헤더·히어로 자리를 채우고 QuickShell 체류를 줄인다.
 */

const KEY_PREFIX = "dibay:store-detail-list-seed:";
const TTL_MS = 45_000;

export type StoreDetailListSeedWriteInput = {
  slug: string;
  store_name: string;
  profile_image_url?: string | null;
  rating_avg?: number;
  review_count?: number;
  delivery_available?: boolean;
  pickup_available?: boolean;
  tagline?: string | null;
  region_badge?: string | null;
};

export type StoreDetailListSeed = {
  slug: string;
  store_name: string;
  profile_image_url: string | null;
  rating_avg: number;
  review_count: number;
  delivery_available: boolean;
  pickup_available: boolean;
  tagline: string | null;
  region_badge: string | null;
  saved_at: number;
};

function ssKey(slug: string): string {
  return KEY_PREFIX + slug.trim().toLowerCase();
}

export function writeStoreDetailListSeed(input: StoreDetailListSeedWriteInput): void {
  if (typeof sessionStorage === "undefined") return;
  const slug = input.slug.trim();
  if (!slug) return;
  const seed: StoreDetailListSeed = {
    slug,
    store_name: input.store_name.trim() || slug,
    profile_image_url: input.profile_image_url?.trim() || null,
    rating_avg: Number.isFinite(input.rating_avg) ? Number(input.rating_avg) : 0,
    review_count: Math.max(0, Math.floor(input.review_count ?? 0) || 0),
    delivery_available: input.delivery_available === true,
    pickup_available: input.pickup_available !== false,
    tagline: input.tagline?.trim() || null,
    region_badge: input.region_badge?.trim() || null,
    saved_at: Date.now(),
  };
  try {
    sessionStorage.setItem(ssKey(slug), JSON.stringify(seed));
  } catch {
    /* quota */
  }
}

export function readStoreDetailListSeed(slug: string): StoreDetailListSeed | null {
  if (typeof sessionStorage === "undefined") return null;
  const s = slug.trim();
  if (!s) return null;
  try {
    const raw = sessionStorage.getItem(ssKey(s));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreDetailListSeed;
    if (!parsed?.slug || parsed.saved_at + TTL_MS < Date.now()) {
      sessionStorage.removeItem(ssKey(s));
      return null;
    }
    if (parsed.slug.trim().toLowerCase() !== s.toLowerCase()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isStoreDetailListSeedId(storeId: string | null | undefined): boolean {
  return String(storeId ?? "").startsWith("seed:");
}

/** `StoreDetailPublic` 초기 summary 행 — summary API 전 PASS1 */
export function storeDetailPartialFromListSeed(seed: StoreDetailListSeed): {
  id: string;
  store_name: string;
  slug: string;
  business_type: string | null;
  description: string | null;
  phone: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
  lat: number | null;
  lng: number | null;
  profile_image_url: string | null;
  gallery_images_json: unknown;
  is_open: boolean | null;
  business_hours_json: unknown;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
  rating_avg: number | null;
  review_count: number | null;
} {
  return {
    id: `seed:${seed.slug}`,
    store_name: seed.store_name,
    slug: seed.slug,
    business_type: null,
    description: seed.tagline,
    phone: null,
    region: seed.region_badge,
    city: null,
    district: null,
    address_line1: null,
    address_line2: null,
    lat: null,
    lng: null,
    profile_image_url: seed.profile_image_url,
    gallery_images_json: null,
    is_open: true,
    business_hours_json: null,
    delivery_available: seed.delivery_available,
    pickup_available: seed.pickup_available,
    rating_avg: seed.rating_avg,
    review_count: seed.review_count,
  };
}
