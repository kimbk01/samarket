import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { REGIONS } from "@/lib/products/form-options";

/**
 * PUBLIC ADDRESS SSOT — Community / Trade / open surfaces.
 *
 * Contract (PH): City / Municipality ONLY.
 * Forbidden: unit, street, barangay, building, landmark, province, country, formatted dump.
 */

const PRIVATE_DETAIL_RE =
  /\b(unit|room|apt|apartment|suite|floor|house\s*no\.?)\b|\bfl(?:oor)?\.?\s*\d+\b|\d+\s*(?:동|호|층)|(?:동|호|층)\s*\d+|호수/i;

const PROVINCE_OR_COUNTRY_RE =
  /^(metro\s*manila|ncr|national\s*capital\s*region|philippines|필리핀|republic\s+of\s+the\s+philippines)$/i;

const BARANGAY_PREFIX_RE = /^(barangay|brgy\.?)\b/i;

function clean(s: string | null | undefined): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower === "null" || lower === "undefined") return "";
  return t;
}

function isUsableCityMunicipalityLabel(s: string): boolean {
  if (!s) return false;
  if (PRIVATE_DETAIL_RE.test(s)) return false;
  if (PROVINCE_OR_COUNTRY_RE.test(s)) return false;
  if (BARANGAY_PREFIX_RE.test(s)) return false;
  return true;
}

/** Taxonomy city catalog label → leading LGU token (`Pasay – MOA Area` → `Pasay`). */
function taxonomyCityLeadingLabel(appRegionId: string | null | undefined, appCityId: string | null | undefined): string {
  const rid = (appRegionId ?? "").trim();
  const cid = (appCityId ?? "").trim();
  if (!rid || !cid) return "";
  const region = REGIONS.find((r) => r.id === rid);
  const city = region?.cities.find((c) => c.id === cid);
  const raw = (city?.name ?? "").trim();
  if (!raw) return "";
  const leading = raw.split(/\s+[–-]\s+/)[0]?.trim() ?? raw;
  return leading;
}

/**
 * City / Municipality authority for PUBLIC surfaces.
 * 1) `city_municipality` column
 * 2) app_city_id taxonomy leading label
 */
export function resolvePublicCityMunicipalityLabel(a: UserAddressDTO | null | undefined): string | null {
  if (!a) return null;
  const fromColumn = clean(a.cityMunicipality);
  if (isUsableCityMunicipalityLabel(fromColumn)) return fromColumn;

  const fromTaxonomy = clean(taxonomyCityLeadingLabel(a.appRegionId, a.appCityId));
  if (isUsableCityMunicipalityLabel(fromTaxonomy)) return fromTaxonomy;

  return null;
}

/** @deprecated Prefer `formatPublicAddress` — kept as the allow-list implementation name. */
export function buildPublicAllowListAddressLine(a: UserAddressDTO | null | undefined): string | null {
  return resolvePublicCityMunicipalityLabel(a);
}
