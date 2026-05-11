/**
 * Google Maps 길찾기 — 공식 Maps URL API (`dir` + `api=1`).
 * 모바일에서 앱이 있으면 열리고, 없으면 웹으로 이어짐.
 *
 * 출발지: 사용자 제스처(탭) 안에서 `navigator.geolocation` 으로 받은 좌표를
 * `origin` 에 넣는 것이 가장 정확함. 거부·타임아웃 시에는 `origin` 없이
 * 열어 Google 쪽이 현재 위치를 쓰도록 함(문서상 동작).
 *
 * @see https://developers.google.com/maps/documentation/urls/get-directions
 */

export type StoreDetailDirectionsTarget = {
  destinationCoords: { lat: number; lng: number } | null;
  destinationQuery: string | null;
};

export type GoogleMapsDirectionsDestination =
  | { kind: "coords"; lat: number; lng: number }
  | { kind: "query"; text: string };

function buildDrivingDirectionsUrl(
  origin: { lat: number; lng: number } | null,
  destination: GoogleMapsDirectionsDestination
): string {
  const travel = "travelmode=driving";
  const base = "https://www.google.com/maps/dir/?api=1";
  const o =
    origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? `&origin=${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`
      : "";

  if (destination.kind === "coords") {
    const d = `${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`;
    return `${base}${o}&destination=${d}&${travel}`;
  }
  const q = destination.text.replace(/\s+/g, " ").trim();
  return `${base}${o}&destination=${encodeURIComponent(q)}&${travel}`;
}

/**
 * 길찾기: 가능하면 **내 위치 좌표(origin)** + **매장 좌표 또는 주소(destination)**.
 * `window.open` 은 반드시 사용자 클릭 핸들러에서 호출할 것(iOS·권한 UX).
 */
export function openGoogleMapsDrivingDirectionsFromUserTo(
  destination: GoogleMapsDirectionsDestination,
  options?: { geoTimeoutMs?: number; geoMaximumAgeMs?: number }
): void {
  if (typeof window === "undefined") return;

  const open = (origin: { lat: number; lng: number } | null) => {
    const url = buildDrivingDirectionsUrl(origin, destination);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
  if (geo && typeof geo.getCurrentPosition === "function") {
    geo.getCurrentPosition(
      (pos) => {
        open({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        open(null);
      },
      {
        enableHighAccuracy: true,
        timeout: options?.geoTimeoutMs ?? 12_000,
        maximumAge: options?.geoMaximumAgeMs ?? 120_000,
      }
    );
  } else {
    open(null);
  }
}

/** 정적 링크용(위치 권한 없음) — 목적지만 고정 */
export function buildGoogleMapsDirectionsUrl(input: {
  lat?: number | null;
  lng?: number | null;
  query?: string | null;
}): string | null {
  const laRaw = input.lat;
  const lnRaw = input.lng;
  const la = typeof laRaw === "number" ? laRaw : Number(laRaw);
  const ln = typeof lnRaw === "number" ? lnRaw : Number(lnRaw);
  if (Number.isFinite(la) && Number.isFinite(ln)) {
    return buildDrivingDirectionsUrl(null, { kind: "coords", lat: la, lng: ln });
  }
  const q = typeof input.query === "string" ? input.query.replace(/\s+/g, " ").trim() : "";
  if (!q) return null;
  return buildDrivingDirectionsUrl(null, { kind: "query", text: q });
}
