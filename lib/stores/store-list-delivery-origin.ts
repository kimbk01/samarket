import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isDeliveryRoutableMasterAddress } from "@/lib/addresses/delivery-routable-address";
import { pickAddressRowForDeliveryRouting, getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import { haversineKm } from "@/lib/geo/haversine-km";

export type StoreListDeliveryOrigin = {
  source: "saved_address" | "explicit_coords" | "none";
  userId: string | null;
  addressId: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  addressIdentity: string | null;
  cacheKeyPart: string;
};

export type StoreAddressIdentityInput = {
  owner_user_id?: unknown;
  place_id?: unknown;
  formatted_address?: unknown;
  detail_address?: unknown;
  address_line1?: unknown;
  address_line2?: unknown;
  lat?: unknown;
  lng?: unknown;
};

export type OwnerDefaultAddressForStoreRouting = {
  user_id: string;
  place_id: string | null;
  formatted_address: string | null;
  road_address: string | null;
  full_address: string | null;
  detail_address: string | null;
  unit_floor_room: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default_delivery: boolean;
  is_default_master: boolean;
  is_default_trade: boolean;
  is_default_life: boolean;
  last_used_at: string | null;
  updated_at: string | null;
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function normalizeDeliveryAddressIdentity(...parts: unknown[]): string | null {
  const joined = parts
    .map(text)
    .filter(Boolean)
    .join(" ");
  if (!joined) return null;
  const normalized = joined
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(the\s+)?philippines\b/g, " ")
    .replace(/\b필리핀\b/g, " ")
    .replace(/\bmetro\s+manila\b/g, " ")
    .replace(/\b\d{3,5}\b/g, " ")
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length >= 8 ? normalized : null;
}

export function buildStoreAddressIdentity(store: StoreAddressIdentityInput): string | null {
  return normalizeDeliveryAddressIdentity(
    store.formatted_address,
    store.detail_address,
    store.address_line1,
    store.address_line2,
  );
}

export async function loadOwnerDefaultAddressByUserId(
  sb: SupabaseClient<any>,
  ownerUserIds: string[],
): Promise<Map<string, OwnerDefaultAddressForStoreRouting>> {
  void sb;
  void ownerUserIds;
  // Store physical addresses are independent from user address book masters.
  // Do not runtime-substitute stores.address_* with user_addresses.
  return new Map();
}

export function resolveEffectiveStoreRouteAddress<T extends StoreAddressIdentityInput>(
  store: T,
  ownerDefault: OwnerDefaultAddressForStoreRouting | null | undefined,
): T & StoreAddressIdentityInput {
  void ownerDefault;
  return store;
}

export function isSameDeliveryAddressForList(
  origin: StoreListDeliveryOrigin,
  store: StoreAddressIdentityInput,
): boolean {
  // place_id alone is not address equality: user POI identity and store place_id
  // can match while coordinates diverge (mixed place_id semantics). Require coords.
  const slat = parseFiniteLatitude(store.lat);
  const slng = parseFiniteLongitude(store.lng);
  if (origin.lat != null && origin.lng != null && slat != null && slng != null) {
    const km = haversineKm(origin.lat, origin.lng, slat, slng);
    if (km != null && Number.isFinite(km) && km * 1000 <= 50) return true;
  }

  const storeIdentity = buildStoreAddressIdentity(store);
  if (!origin.addressIdentity || !storeIdentity) return false;
  if (origin.addressIdentity === storeIdentity) return true;
  const minLen = Math.min(origin.addressIdentity.length, storeIdentity.length);
  if (minLen < 18) return false;
  return origin.addressIdentity.includes(storeIdentity) || storeIdentity.includes(origin.addressIdentity);
}

function explicitCoordsFromSearchParams(searchParams: URLSearchParams): Pick<StoreListDeliveryOrigin, "lat" | "lng"> {
  const lat = parseFiniteLatitude(searchParams.get("user_lat"));
  const lng = parseFiniteLongitude(searchParams.get("user_lng"));
  return { lat, lng };
}

function noneOrigin(userId: string | null): StoreListDeliveryOrigin {
  return {
    source: "none",
    userId,
    addressId: null,
    placeId: null,
    lat: null,
    lng: null,
    addressIdentity: null,
    cacheKeyPart: "none",
  };
}

export async function resolveStoreListDeliveryOrigin(
  sb: SupabaseClient<any>,
  searchParams: URLSearchParams,
): Promise<StoreListDeliveryOrigin> {
  const userId = await getRouteUserId();
  /**
   * CUT 5 — logged-in member: master routable coords only.
   * Do not fall through to query GPS/explicit coords (no silent override).
   */
  if (userId) {
    try {
      const defs = await getUserAddressDefaults(sb, userId);
      const addr = pickAddressRowForDeliveryRouting(defs);
      if (!addr?.id || !isDeliveryRoutableMasterAddress(addr)) {
        return noneOrigin(userId);
      }
      const lat = parseFiniteLatitude(addr.latitude);
      const lng = parseFiniteLongitude(addr.longitude);
      if (lat == null || lng == null) {
        return noneOrigin(userId);
      }
      const placeId = addr.placeId?.trim() || null;
      const addressIdentity = normalizeDeliveryAddressIdentity(
        addr.formattedAddress,
        addr.roadAddress,
        addr.fullAddress,
        addr.detailAddress,
        addr.unitFloorRoom,
      );
      return {
        source: "saved_address",
        userId,
        addressId: addr.id,
        placeId,
        lat,
        lng,
        addressIdentity,
        cacheKeyPart: ["addr", userId, addr.id, placeId ?? "", lat.toFixed(6), lng.toFixed(6), addressIdentity ?? ""].join(":"),
      };
    } catch {
      return noneOrigin(userId);
    }
  }

  const explicit = explicitCoordsFromSearchParams(searchParams);
  if (explicit.lat != null && explicit.lng != null) {
    return {
      source: "explicit_coords",
      userId: null,
      addressId: null,
      placeId: null,
      lat: explicit.lat,
      lng: explicit.lng,
      addressIdentity: null,
      cacheKeyPart: ["coords", explicit.lat.toFixed(6), explicit.lng.toFixed(6)].join(":"),
    };
  }

  return noneOrigin(null);
}
