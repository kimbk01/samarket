/**
 * `/api/stores/browse?user_lat=&user_lng=` 용 사용자 기준 좌표.
 *
 * 순서 (확실한 폴백 — HTTP LAN 에서 GPS 가 막혀도 동작):
 * 1. `navigator.geolocation` — **secure context** 일 때만 시도(타임아웃으로 첫 페인트 지연 방지).
 * 2. `GET /api/me/address-defaults` — 배달 기본 → 대표 → 거래 → 생활 중 첫 유효 좌표.
 * 3. `GET /api/me/profile`(dedupe) — `profiles.latitude` / `longitude`.
 */

export type BrowseListUserOriginCoords = { lat: number; lng: number };

function parseLatLng(lat: unknown, lng: unknown): BrowseListUserOriginCoords | null {
  const a = Number(lat);
  const b = Number(lng);
  if (Number.isFinite(a) && Number.isFinite(b)) return { lat: a, lng: b };
  return null;
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

import type { UserAddressDefaultsDTO, UserAddressDTO } from "@/lib/addresses/user-address-types";

/** `pickAddressRowForDeliveryRouting` 과 동일 순서 — browse 클라는 서비스 모듈 전체 import 를 피한다. */
function pickAddressRowForBrowseOrigin(defs: UserAddressDefaultsDTO): UserAddressDTO | null {
  return defs.delivery ?? defs.master ?? defs.trade ?? defs.life ?? null;
}

export async function tryCoordsFromAddressDefaults(): Promise<BrowseListUserOriginCoords | null> {
  try {
    const res = await fetch("/api/me/address-defaults", { credentials: "include", cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; defaults?: unknown };
    if (!j?.ok || j.defaults == null || typeof j.defaults !== "object") return null;
    const row = pickAddressRowForBrowseOrigin(j.defaults as UserAddressDefaultsDTO);
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
 */
export async function resolveBrowseListUserOriginCoords(): Promise<BrowseListUserOriginCoords | null> {
  const g = await tryBrowserGeolocation();
  if (g) return g;
  const a = await tryCoordsFromAddressDefaults();
  if (a) return a;
  return await tryCoordsFromMeProfile();
}
