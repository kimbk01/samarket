import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/**
 * Public Community / Trade display allow-list.
 * Allowed: barangay, city, building_name, landmark, safe road.
 * Forbidden: detail_address, unit_floor_room, Unit/Room/Floor/house interior,
 * and raw formatted_address as the public line.
 */
const PRIVATE_DETAIL_RE =
  /\b(unit|room|apt|apartment|suite|floor|house\s*no\.?)\b|\bfl(?:oor)?\.?\s*\d+\b|\d+\s*(?:동|호|층)|(?:동|호|층)\s*\d+|호수/i;

function clean(s: string | null | undefined): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower === "null" || lower === "undefined") return "";
  return t;
}

function publicSafe(s: string): string {
  if (!s) return "";
  if (PRIVATE_DETAIL_RE.test(s)) return "";
  return s;
}

function uniqKeepOrder(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function stripCountry(line: string, countryName?: string | null): string {
  let t = line.trim();
  if (!t) return t;
  const extras = [
    ...(countryName?.trim() ? [countryName.trim()] : []),
    "필리핀",
    "Philippines",
    "the Philippines",
    "Republic of the Philippines",
  ];
  for (const name of extras) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`[,，]\\s*${escaped}\\s*$`, "i"), "").trim();
    t = t.replace(new RegExp(`\\s+${escaped}\\s*$`, "i"), "").trim();
  }
  return t.replace(/[,，]\s*$/, "").trim();
}

function neighborhoodAsBarangay(neighborhoodName: string): string {
  const n = clean(neighborhoodName);
  if (!n) return "";
  if (n.includes("·")) return "";
  return publicSafe(n);
}

function isSafeRoad(s: string): boolean {
  if (!s) return false;
  if (PRIVATE_DETAIL_RE.test(s)) return false;
  return true;
}

/** Public one-line: region (barangay, city) + building/landmark, optional safe road. */
export function buildPublicAllowListAddressLine(a: UserAddressDTO | null | undefined): string | null {
  if (!a) return null;

  const barangay = publicSafe(clean(a.barangay)) || neighborhoodAsBarangay(a.neighborhoodName ?? "");
  const city = publicSafe(clean(a.cityMunicipality));
  const building = publicSafe(clean(a.buildingName));
  const landmark = publicSafe(clean(a.landmark));
  const roadRaw = clean(a.streetAddress);
  const road = isSafeRoad(roadRaw) ? roadRaw : "";

  const region = uniqKeepOrder([barangay, city].filter(Boolean)).join(", ");
  const place = uniqKeepOrder([building, landmark].filter(Boolean)).join(" · ");

  const parts: string[] = [];
  if (region) parts.push(region);
  if (place) parts.push(place);
  else if (road) parts.push(road);

  const line = parts.join(" · ").trim();
  if (!line) return null;
  if (PRIVATE_DETAIL_RE.test(line)) {
    if (region && !PRIVATE_DETAIL_RE.test(region)) {
      const regionOnly = stripCountry(region, a.countryName);
      return regionOnly || null;
    }
    return null;
  }
  return stripCountry(line, a.countryName) || line;
}
