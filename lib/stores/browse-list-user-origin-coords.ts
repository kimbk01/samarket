/**
 * `/api/stores/browse?user_lat=&user_lng=` 용 사용자 기준 좌표.
 *
 * 우선순위 (저장된 주소를 먼저 — 계정·기기 간 목록 거리/ETA 일치):
 * 1. `GET /api/me/address-defaults` — `pickAddressRowForDeliveryRouting` 과 동일.
 * 2. `GET /api/me/profile`(dedupe) — `profiles.latitude` / `longitude`.
 * 3. `navigator.geolocation` — secure context 일 때만.
 */

import { pickAddressRowForDeliveryRouting } from "@/lib/addresses/user-address-service";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

export type BrowseListUserOriginCoords = { lat: number; lng: number };

function parseLatLng(lat: unknown, lng: unknown): BrowseListUserOriginCoords | null {
  const a = parseFiniteLatitude(lat);
  const b = parseFiniteLongitude(lng);
  if (a == null || b == null) return null;
  return { lat: a, lng: b };
}

function browserAllowsGeolocationProbe(): boolean {
  if (typeof window === "undefined") return false;
  /** `http://192.168.x.x` 등은 `isSecureContext === false` 인 경우가 많아 GPS 를 건너뛴다. */
  return window.isSecureContext === true && !!navigator.geolocation;
}

export function tryBrowserGeolocation(): Promise<BrowseListUserOriginCoords | null> {
  return new Promise((resolve) => {
    if (!browserAllowsGeolocationProbe()) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(parseLatLng(p.coords.latitude, p.coords.longitude)),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 8_000 }
    );
  });
}

export async function tryCoordsFromAddressDefaults(): Promise<BrowseListUserOriginCoords | null> {
  try {
    const res = await fetch("/api/me/address-defaults", { credentials: "include", cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; defaults?: unknown };
    if (!j?.ok || j.defaults == null || typeof j.defaults !== "object") return null;
    const row = pickAddressRowForDeliveryRouting(j.defaults as UserAddressDefaultsDTO);
    if (!row) return null;
    return parseLatLng(row.latitude, row.longitude);
  } catch {
    return null;
  }
}

export async function tryCoordsFromMeProfile(): Promise<BrowseListUserOriginCoords | null> {
  try {
    const { fetchMeProfileDeduped } = await import("@/lib/profile/fetch-me-profile-deduped");
    const { status, json } = await fetchMeProfileDeduped();
    if (status !== 200) return null;
    const profile = (json as { profile?: { latitude?: unknown; longitude?: unknown } | null }).profile;
    if (!profile) return null;
    return parseLatLng(profile.latitude, profile.longitude);
  } catch {
    return null;
  }
}

/**
 * browse 목록 API 에 붙일 `user_lat` / `user_lng` 한 벌.
 * 주소록·프로필에 저장된 좌표를 먼저 써 계정 간·기기 간에 같은 주소면 같은 기준점이 되도록 한다.
 * (HTTPS 에서 GPS 를 먼저 쓰면 기기 위치 편차로 km/분이 갈라질 수 있음)
 */
export async function resolveBrowseListUserOriginCoords(): Promise<BrowseListUserOriginCoords | null> {
  const [a, p] = await Promise.all([tryCoordsFromAddressDefaults(), tryCoordsFromMeProfile()]);
  if (a) return a;
  if (p) return p;
  const g = await tryBrowserGeolocation();
  if (g) return g;
  return null;
}
