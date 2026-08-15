import type { AddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";

/** 주소 행·프로필 공통 — 유효 위경도만 */
export function parseLatLngRow(row: unknown): { lat: number; lng: number } | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const latRaw = o.latitude;
  const lngRaw = o.longitude;
  const lat = typeof latRaw === "number" ? latRaw : typeof latRaw === "string" ? Number(latRaw) : NaN;
  const lng = typeof lngRaw === "number" ? lngRaw : typeof lngRaw === "string" ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * 거래 희망 장소 지도 초기 핀 좌표 — current USER address authority인 master만.
 */
export function pickTradeMeetSpotCenterFromAddressDefaults(
  snapshot: AddressDefaultsSnapshot | null | undefined
): { lat: number; lng: number } | null {
  if (!snapshot?.ok || !snapshot.defaults) return null;
  const defs = snapshot.defaults as Record<string, unknown>;
  return parseLatLngRow(defs.master);
}

/** 프로필 지도 핀(위치 선택) — 주소록 좌표가 없을 때 보조 */
export async function fetchProfileLatLngForMeetSpotMap(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status, json } = await fetchMeProfileDeduped("meet_spot_map_fallback");
    const j = json as { ok?: boolean; profile?: unknown };
    if (status !== 200 || !j.ok || j.profile == null) return null;
    return parseLatLngRow(j.profile);
  } catch {
    return null;
  }
}

/** 지도 핀 폴백 — 주소록 기본 → 프로필 (`TradeMeetSpotPickClient` · 지오코딩 실패 시) */
export async function fetchMeetSpotPinFallbackCenter(): Promise<{ lat: number; lng: number } | null> {
  try {
    const snap = await fetchAddressDefaultsSnapshot({
      caller: "trade_meet_spot_pick",
      reason: "meet_spot_seed",
    });
    const fromBook = pickTradeMeetSpotCenterFromAddressDefaults(snap);
    if (fromBook) return fromBook;
    return fetchProfileLatLngForMeetSpotMap();
  } catch {
    return null;
  }
}
