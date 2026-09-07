/**
 * `/api/stores/browse?user_lat=&user_lng=&user_address_id=` 용 사용자 기준 좌표.
 *
 * CUT 4 — Delivery browse origin authority:
 * - Logged-in + valid master → MASTER lat/lng + addressId only (same row).
 * - Logged-in + master missing coords / no master → null (no profiles/GPS silent override).
 * - Guest / unauthenticated → device GPS only (picker/discovery for guests; not member authority).
 *
 * PRESERVE: Address picker / Map GPS for creating addresses (separate surfaces).
 * REMOVED from Delivery browse authority: profiles.latitude/longitude.
 */

import { isDeliveryRoutableMasterAddress } from "@/lib/addresses/delivery-routable-address";
import { pickAddressRowForDeliveryRouting } from "@/lib/addresses/user-address-service";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type BrowseListOriginSource = "master" | "gps" | "none";

export type BrowseListUserOriginCoords = {
  lat: number;
  lng: number;
  /** Master `user_addresses.id` when source=master; else null */
  addressId: string | null;
  source: BrowseListOriginSource;
};

const RESOLVE_ORIGIN_FLIGHT = "browse:list-user-origin-coords" as const;

function parseMasterOrigin(
  lat: unknown,
  lng: unknown,
  addressId: string | null | undefined,
): BrowseListUserOriginCoords | null {
  const id = typeof addressId === "string" && addressId.trim() ? addressId.trim() : null;
  if (!id || !isDeliveryRoutableMasterAddress({ id, latitude: lat, longitude: lng })) {
    return null;
  }
  const a = parseFiniteLatitude(lat);
  const b = parseFiniteLongitude(lng);
  if (a == null || b == null) return null;
  return { lat: a, lng: b, addressId: id, source: "master" };
}

function parseGpsOrigin(lat: unknown, lng: unknown): BrowseListUserOriginCoords | null {
  const a = parseFiniteLatitude(lat);
  const b = parseFiniteLongitude(lng);
  if (a == null || b == null) return null;
  return { lat: a, lng: b, addressId: null, source: "gps" };
}

/** browse 목록·geo effect — 동일 origin이면 state 갱신·context key 변경 생략 */
export function browseListUserOriginCoordsEqual(
  a: BrowseListUserOriginCoords | null,
  b: BrowseListUserOriginCoords | null
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.lat === b.lat &&
    a.lng === b.lng &&
    (a.addressId ?? null) === (b.addressId ?? null) &&
    a.source === b.source
  );
}

function browserAllowsGeolocationProbe(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true && !!navigator.geolocation;
}

/** Guest / unauthenticated browse only — never attach addressId. */
export function tryBrowserGeolocation(): Promise<BrowseListUserOriginCoords | null> {
  return new Promise((resolve) => {
    if (!browserAllowsGeolocationProbe()) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(parseGpsOrigin(p.coords.latitude, p.coords.longitude)),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 8_000 }
    );
  });
}

/**
 * Member Delivery discovery origin from address-defaults master only.
 * Returns:
 * - master origin when master has valid lat/lng
 * - `null` when authenticated but master missing / coords invalid (fail-closed)
 * - `{ guest: true }` signal via status 401 path handled by caller
 */
export async function tryMasterOriginFromAddressDefaults(): Promise<{
  auth: "member" | "guest" | "unknown";
  origin: BrowseListUserOriginCoords | null;
  masterPresent: boolean;
}> {
  try {
    const snapshot = await fetchAddressDefaultsSnapshot({
      caller: "browse_list_user_origin",
      reason: "browse_origin",
    });
    if (snapshot == null) {
      return { auth: "unknown", origin: null, masterPresent: false };
    }
    if (snapshot.status === 401) {
      return { auth: "guest", origin: null, masterPresent: false };
    }
    if (!snapshot.ok || snapshot.defaults == null) {
      /** Authenticated but defaults load incomplete — do not invent profiles/GPS origin. */
      return { auth: "member", origin: null, masterPresent: false };
    }
    const row = pickAddressRowForDeliveryRouting(snapshot.defaults as UserAddressDefaultsDTO);
    if (!row?.id) {
      return { auth: "member", origin: null, masterPresent: false };
    }
    const origin = parseMasterOrigin(row.latitude, row.longitude, row.id);
    return { auth: "member", origin, masterPresent: true };
  } catch {
    return { auth: "unknown", origin: null, masterPresent: false };
  }
}

async function resolveBrowseListUserOriginCoordsInner(): Promise<BrowseListUserOriginCoords | null> {
  const localUserId = getCurrentUser()?.id?.trim() || null;
  const resolved = await tryMasterOriginFromAddressDefaults();

  if (resolved.origin) {
    return resolved.origin;
  }

  /** Logged-in member: never silent profiles/GPS override. */
  if (resolved.auth === "member" || localUserId) {
    return null;
  }

  /** Guest / unauthenticated only. */
  if (resolved.auth === "guest" || !localUserId) {
    return tryBrowserGeolocation();
  }

  return null;
}

/**
 * browse 목록 API 에 붙일 `user_lat` / `user_lng` (+ `user_address_id` when master).
 * Member: master row only. Guest: GPS. Profiles geo is not Delivery authority.
 */
export function resolveBrowseListUserOriginCoords(): Promise<BrowseListUserOriginCoords | null> {
  return runSingleFlight(RESOLVE_ORIGIN_FLIGHT, resolveBrowseListUserOriginCoordsInner);
}

/** @deprecated CUT 4 — profiles geo removed from Delivery browse authority. */
export async function tryCoordsFromMeProfile(): Promise<BrowseListUserOriginCoords | null> {
  return null;
}

/** @deprecated Prefer tryMasterOriginFromAddressDefaults — kept for call-site migration safety. */
export async function tryCoordsFromAddressDefaults(): Promise<BrowseListUserOriginCoords | null> {
  const r = await tryMasterOriginFromAddressDefaults();
  return r.origin;
}
