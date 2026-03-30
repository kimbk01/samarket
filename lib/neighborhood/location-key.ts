import type { UserRegion } from "@/lib/regions/types";
import { getRegionCityName, getRegionName } from "@/lib/regions/region-utils";

/** 클라이언트→API 전달용 동네 키 (locations 행 upsert 시 사용) */
export function neighborhoodLocationKeyFromRegion(region: UserRegion | null): string | null {
  if (!region) return null;
  const sanitize = (v: string) => v.replace(/:/g, " ").trim();
  const regionPart = sanitize(region.regionId ?? "") || "ph";
  const cityPart = sanitize(region.cityId ?? "") || sanitize(region.label ?? "");
  if (!cityPart) return null;
  const barangayPart = sanitize(region.barangay ?? "");
  return `${regionPart}:${cityPart}:${barangayPart}`;
}

export function neighborhoodLocationLabelFromRegion(region: UserRegion | null): string {
  if (!region) return "";
  return region.label?.trim() || getRegionName(region.regionId) || "";
}

export function neighborhoodLocationMetaFromRegion(region: UserRegion | null): {
  country: string;
  city: string;
  district: string;
  name: string;
  label: string;
} | null {
  if (!region) return null;
  const city = getRegionName(region.regionId).trim();
  const name = getRegionCityName(region.regionId, region.cityId).trim();
  if (!city || !name) return null;
  const district = (region.barangay ?? "").trim();
  const label = region.label?.trim() || `${city} · ${name}`;
  return {
    country: "Philippines",
    city,
    district,
    name,
    label,
  };
}

/** 상단 부제용 — 광역(지역) · 동(바랑가이) · 시티 등 구간명을 ` · ` 로 이어 붙임 */
export function formatNeighborhoodRegionSubtitle(
  meta: ReturnType<typeof neighborhoodLocationMetaFromRegion>,
  fallbackLabel: string
): string {
  if (meta) {
    const parts = [meta.city, meta.district, meta.name].filter((p) => typeof p === "string" && p.trim().length > 0);
    if (parts.length > 0) return parts.join(" · ");
  }
  const f = fallbackLabel.trim();
  return f || "동네를 설정해 주세요";
}
