import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { formatPublicAddress } from "@/lib/addresses/user-address-format";

/**
 * COMMUNITY PUBLIC LOCATION SSOT — CITY ONLY (CUT 1).
 *
 * Writer: master structured City (`formatPublicAddress` ← city_municipality / taxonomy).
 * Reader: fail-closed — never invent City via comma/split of TITLE/full address.
 * Forbidden fallback: street / building / unit / detail / TITLE.
 */

const PRIVATE_DETAIL_RE =
  /\b(unit|room|apt|apartment|suite|floor|house\s*no\.?)\b|\bfl(?:oor)?\.?\s*\d+\b|\d+\s*(?:동|호|층)|(?:동|호|층)\s*\d+|호수/i;

/** Street / building / landmark markers — TITLE-like, not City. */
const STREET_OR_BUILDING_RE =
  /\b(avenue|ave\.?|street|st\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|highway|hwy\.?|corner|cor\.?|building|bldg\.?|tower|condo|condominium|village|subdivision|compound|plaza|mall|center|centre|parkway|extension|ext\.?)\b/i;

const PROVINCE_OR_COUNTRY_RE =
  /^(metro\s*manila|ncr|national\s*capital\s*region|philippines|필리핀|republic\s+of\s+the\s+philippines)$/i;

export const COMMUNITY_PUBLIC_REGION_FALLBACK = "동네";

export function publicRegionLabelLeaksPrivateDetail(label: string): boolean {
  return PRIVATE_DETAIL_RE.test(label.trim());
}

/**
 * Accept only City/Municipality-like public labels.
 * Fail-closed: multi-part / street / building / private detail → null (no comma City extraction).
 */
export function sanitizePublicRegionLabel(label: string | null | undefined): string | null {
  const t = (label ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.includes(",") || t.includes("，") || t.includes("\n") || t.includes("·")) return null;
  if (/\s+[–-]\s+/.test(t)) return null;
  if (publicRegionLabelLeaksPrivateDetail(t)) return null;
  if (STREET_OR_BUILDING_RE.test(t)) return null;
  if (PROVINCE_OR_COUNTRY_RE.test(t)) return null;
  if (/^\d/.test(t)) return null;
  if (t.length > 48) return null;
  return t.slice(0, 80);
}

/**
 * Community public display from stored `region_label` and/or `locations.city`.
 * Prefer structured `locations.city`; never promote TITLE-like `region_label`.
 */
export function formatCommunityPublicRegionLabel(input: {
  regionLabel?: string | null;
  locationCity?: string | null;
}): string {
  const fromLocation = sanitizePublicRegionLabel(input.locationCity);
  if (fromLocation) return fromLocation;
  const fromStored = sanitizePublicRegionLabel(input.regionLabel);
  if (fromStored) return fromStored;
  return COMMUNITY_PUBLIC_REGION_FALLBACK;
}

/**
 * Community/Philife `region_label` writer SSOT.
 * Client `region_label` / freeform locationName is not authority.
 * City only — never TITLE / street / building.
 */
export async function resolveCommunityPublicRegionLabelForUser(
  sb: SupabaseClient<any>,
  userId: string,
): Promise<string> {
  const defaults = await getUserAddressDefaults(sb, userId);
  const city = sanitizePublicRegionLabel(formatPublicAddress(defaults.master));
  if (city) return city;
  return COMMUNITY_PUBLIC_REGION_FALLBACK;
}

/** Batch `locations.city` for public City display (existing posts with location_id). */
export async function loadLocationCitiesByIds(
  sb: SupabaseClient<any>,
  locationIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...new Set([...locationIds].map((x) => String(x ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await sb.from("locations").select("id, city").in("id", ids);
  if (error || !Array.isArray(data)) return out;
  for (const row of data as { id?: string; city?: string | null }[]) {
    const id = String(row.id ?? "").trim();
    const city = String(row.city ?? "").trim();
    if (id && city) out.set(id, city);
  }
  return out;
}
