import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
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

function ownerAddressRank(a: OwnerDefaultAddressForStoreRouting): number {
  if (a.is_default_delivery) return 0;
  if (a.is_default_master) return 1;
  if (a.is_default_trade) return 2;
  if (a.is_default_life) return 3;
  return 4;
}

export async function loadOwnerDefaultAddressByUserId(
  sb: SupabaseClient<any>,
  ownerUserIds: string[],
): Promise<Map<string, OwnerDefaultAddressForStoreRouting>> {
  const ids = [...new Set(ownerUserIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await sb
    .from("user_addresses")
    .select("user_id,place_id,formatted_address,road_address,full_address,detail_address,unit_floor_room,latitude,longitude,is_default_delivery,is_default_master,is_default_trade,is_default_life,last_used_at,updated_at")
    .in("user_id", ids)
    .eq("is_active", true);
  if (error) return new Map();
  const rows = (data ?? []) as OwnerDefaultAddressForStoreRouting[];
  rows.sort((a, b) => {
    const r = ownerAddressRank(a) - ownerAddressRank(b);
    if (r !== 0) return r;
    const bu = b.last_used_at ? Date.parse(b.last_used_at) : 0;
    const au = a.last_used_at ? Date.parse(a.last_used_at) : 0;
    if (bu !== au) return bu - au;
    const bp = b.updated_at ? Date.parse(b.updated_at) : 0;
    const ap = a.updated_at ? Date.parse(a.updated_at) : 0;
    return bp - ap;
  });
  const out = new Map<string, OwnerDefaultAddressForStoreRouting>();
  for (const row of rows) {
    const uid = text(row.user_id);
    if (!uid || out.has(uid)) continue;
    const lat = parseFiniteLatitude(row.latitude);
    const lng = parseFiniteLongitude(row.longitude);
    if (lat == null || lng == null) continue;
    out.set(uid, { ...row, latitude: lat, longitude: lng });
  }
  return out;
}

export function resolveEffectiveStoreRouteAddress<T extends StoreAddressIdentityInput>(
  store: T,
  ownerDefault: OwnerDefaultAddressForStoreRouting | null | undefined,
): T & StoreAddressIdentityInput {
  if (!ownerDefault) return store;
  const storePlaceId = text(store.place_id);
  const storeIdentity = buildStoreAddressIdentity(store);
  const ownerIdentity = normalizeDeliveryAddressIdentity(
    ownerDefault.formatted_address,
    ownerDefault.road_address,
    ownerDefault.full_address,
    ownerDefault.detail_address,
    ownerDefault.unit_floor_room,
  );
  const shouldUseOwnerDefault =
    !storePlaceId ||
    (!!storeIdentity &&
      !!ownerIdentity &&
      (storeIdentity === ownerIdentity ||
        (Math.min(storeIdentity.length, ownerIdentity.length) >= 18 &&
          (storeIdentity.includes(ownerIdentity) || ownerIdentity.includes(storeIdentity)))));
  if (!shouldUseOwnerDefault) return store;
  return {
    ...store,
    place_id: ownerDefault.place_id,
    formatted_address: ownerDefault.formatted_address ?? ownerDefault.full_address,
    detail_address: ownerDefault.detail_address ?? ownerDefault.unit_floor_room,
    address_line1: ownerDefault.road_address ?? ownerDefault.formatted_address ?? ownerDefault.full_address,
    address_line2: ownerDefault.detail_address ?? ownerDefault.unit_floor_room,
    lat: ownerDefault.latitude,
    lng: ownerDefault.longitude,
  };
}

export function isSameDeliveryAddressForList(
  origin: StoreListDeliveryOrigin,
  store: StoreAddressIdentityInput,
): boolean {
  const storePlaceId = text(store.place_id);
  if (origin.placeId && storePlaceId && origin.placeId === storePlaceId) return true;

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

export async function resolveStoreListDeliveryOrigin(
  sb: SupabaseClient<any>,
  searchParams: URLSearchParams,
): Promise<StoreListDeliveryOrigin> {
  const userId = await getRouteUserId();
  if (userId) {
    try {
      const defs = await getUserAddressDefaults(sb, userId);
      const addr = pickAddressRowForDeliveryRouting(defs);
      const lat = parseFiniteLatitude(addr?.latitude);
      const lng = parseFiniteLongitude(addr?.longitude);
      if (addr && lat != null && lng != null) {
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
      }
    } catch {
      // Fallback below keeps public lists usable if the address table is temporarily unavailable.
    }
  }

  const explicit = explicitCoordsFromSearchParams(searchParams);
  if (explicit.lat != null && explicit.lng != null) {
    return {
      source: "explicit_coords",
      userId: userId ?? null,
      addressId: null,
      placeId: null,
      lat: explicit.lat,
      lng: explicit.lng,
      addressIdentity: null,
      cacheKeyPart: ["coords", explicit.lat.toFixed(6), explicit.lng.toFixed(6)].join(":"),
    };
  }

  return {
    source: "none",
    userId: userId ?? null,
    addressId: null,
    placeId: null,
    lat: null,
    lng: null,
    addressIdentity: null,
    cacheKeyPart: "none",
  };
}
