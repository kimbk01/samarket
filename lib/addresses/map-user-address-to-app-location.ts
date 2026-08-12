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
import { lookupLocationByPhilippinesZip } from "@/lib/products/zip-to-location";

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

/**
 * Map a member address (or draft fields) to DIBAY region/city taxonomy IDs.
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

  const full = a.fullAddress?.trim() ?? a.formattedAddress?.trim() ?? "";
  const zipMatch = full.match(/\b([0-9]{4})\b/);
  if (zipMatch) {
    const hit = lookupLocationByPhilippinesZip(zipMatch[1]!);
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
