import type { EnsureLocationInput } from "@/lib/neighborhood/ensure-location";

/**
 * `neighborhood-posts`(POST)와 `neighborhood-feed`(GET)에서 동일하게 쓰는
 * locationKey + 클라이언트가 넘긴 city/district/name 보강.
 * POST는 이미 이 규칙과 맞춰 두었고, GET이 `city || split(':')[0]`만 쓰던 불일치를 제거한다.
 */
export function coalesceNeighborhoodLocationInput(
  locationKey: string,
  partial: { city?: string; district?: string; name?: string }
): EnsureLocationInput {
  const parts = locationKey.split(":").map((p) => p.trim()).filter(Boolean);
  const cityFromKey = parts.length >= 2 ? parts[1]! : "";
  const city = (partial.city ?? "").trim() || cityFromKey || parts[0] || "";
  const name = (partial.name ?? "").trim() || city || "동네";
  return {
    country: "Philippines",
    city: city || "unknown",
    /** City 단위만 — 클라가 보낸 district·키 3구간(상세주소 가능)은 저장하지 않는다 (ADDR-PRIV-002). */
    district: "",
    name: name || "동네",
  };
}
