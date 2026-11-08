/**
 * ONE DIBAY LOCATION / TAXONOMY MAPPER
 *
 * Canonical User Address → REGIONS catalog regionId + cityId.
 * Trade posts.region/city, life summary, checkout geo, meet-spot fallback
 * must use this — do not fork matchers per surface.
 *
 * Authority for free-text / Google lines: `matchRegionCityFromFullAddress`.
 * Stored `appRegionId`/`appCityId` win when valid against REGIONS.
 */

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildPublicAllowListAddressLine } from "@/lib/addresses/public-address-allow-list";
import { matchRegionCityFromFullAddress } from "@/lib/profile/match-region-from-full-address";
import {
  getLocationLabelIfValid,
  parseLocationLabelToIds,
} from "@/lib/products/form-options";
import { lookupExactLocationByPhilippinesZip } from "@/lib/products/zip-to-location";

export type DibayAppLocationIds = {
  regionId: string;
  cityId: string;
};

function validPair(regionId: string, cityId: string): DibayAppLocationIds | null {
  const rid = regionId.trim();
  const cid = cityId.trim();
  if (!rid || !cid) return null;
  if (!getLocationLabelIfValid(rid, cid)) return null;
  return { regionId: rid, cityId: cid };
}

/** Build a matchable one-line from structured PH fields (no unit/detail). */
export function buildTaxonomyMatchLineFromUserAddressFields(input: {
  buildingName?: string | null;
  landmark?: string | null;
  barangay?: string | null;
  district?: string | null;
  cityMunicipality?: string | null;
  province?: string | null;
  streetAddress?: string | null;
  neighborhoodName?: string | null;
  formattedAddress?: string | null;
  roadAddress?: string | null;
  fullAddress?: string | null;
}): string {
  const chunks = [
    input.buildingName,
    input.landmark,
    input.barangay,
    input.district,
    input.cityMunicipality,
    input.province,
    input.streetAddress,
    input.neighborhoodName,
    input.formattedAddress,
    input.roadAddress,
    input.fullAddress,
  ]
    .map((x) => (x ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const c of chunks) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(c);
  }
  return uniq.join(", ");
}

const COUNTRY_SEGMENT_RE = /^(philippines|the philippines|republic of the philippines|필리핀|ph)$/i;

/**
 * Google 형식 주소의 우편번호만 꺼낸다 — 「…, Manila, 1001 Metro Manila, 필리핀」의 `1001`.
 * 국가를 뺀 **마지막 쉼표 구간**이 `NNNN 지방명` 또는 `NNNN` 일 때만 우편번호로 본다.
 * 번지(예: `1226 A Lorenzo St`)·도로 번호는 우편번호로 쓰지 않는다 (2026-11-09 매장 Tondo→Makati 오매핑 원인).
 */
export function extractPhilippinesPostalCodeFromAddressLine(line: string): string | null {
  const segments = line
    .split(/[,\n]/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((x) => !COUNTRY_SEGMENT_RE.test(x));
  const last = segments[segments.length - 1];
  if (!last) return null;
  const m = last.match(/^(\d{4})(?:\s+\D.*)?$/);
  return m ? m[1]! : null;
}

/**
 * Map a member address (or draft fields) to DIBAY region/city taxonomy IDs.
 * 순서: 저장된 ID → 동네 라벨 → **우편번호(정확 표만)** → 주소 문장 매칭.
 */
export function mapUserAddressToAppLocation(
  a: Pick<
    UserAddressDTO,
    | "appRegionId"
    | "appCityId"
    | "neighborhoodName"
    | "fullAddress"
    | "formattedAddress"
    | "roadAddress"
    | "buildingName"
    | "landmark"
    | "barangay"
    | "district"
    | "cityMunicipality"
    | "province"
    | "streetAddress"
  >,
): DibayAppLocationIds | null {
  const stored = validPair(a.appRegionId ?? "", a.appCityId ?? "");
  if (stored) return stored;

  const nn = a.neighborhoodName?.trim();
  if (nn?.includes("·")) {
    const p = parseLocationLabelToIds(nn);
    if (p) {
      const v = validPair(p.regionId, p.cityId);
      if (v) return v;
    }
  }

  const postal = extractPhilippinesPostalCodeFromAddressLine(
    a.formattedAddress?.trim() || a.fullAddress?.trim() || a.roadAddress?.trim() || "",
  );
  if (postal) {
    const hit = lookupExactLocationByPhilippinesZip(postal);
    if (hit) {
      const v = validPair(hit.regionId, hit.cityId);
      if (v) return v;
    }
  }

  const publicLine = buildPublicAllowListAddressLine(a as UserAddressDTO);
  const candidates = [
    publicLine,
    buildTaxonomyMatchLineFromUserAddressFields(a),
    a.formattedAddress,
    a.roadAddress,
    a.fullAddress,
    [a.cityMunicipality, a.barangay, a.province].filter(Boolean).join(", "),
    a.cityMunicipality,
  ];

  for (const raw of candidates) {
    const t = raw?.trim();
    if (!t) continue;
    const hit = matchRegionCityFromFullAddress(t);
    if (hit) {
      const v = validPair(hit.regionId, hit.cityId);
      if (v) return v;
    }
  }

  return null;
}

/** Free-text / meet-spot display line → taxonomy (same authority). */
export function mapAddressLineToAppLocation(line: string): DibayAppLocationIds | null {
  const hit = matchRegionCityFromFullAddress(line);
  if (!hit) return null;
  return validPair(hit.regionId, hit.cityId);
}
