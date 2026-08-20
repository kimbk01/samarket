/**
 * Master address → national LGU resolve inputs (structured fields only).
 * Uses the same taxonomy mapper as trade write / delivery (`mapUserAddressToAppLocation`).
 */
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { REGIONS } from "@/lib/products/form-options";

/** Legacy REGIONS city label → municipality string for national LGU resolver. */
function legacyRegionCityToMunicipality(cityName: string): string {
  const trimmed = cityName.trim();
  if (!trimmed) return "";
  const head = trimmed.split(/\s*[–-]\s*/)[0]?.trim() ?? trimmed;
  if (/city$/i.test(head)) return head;
  return `${head} City`;
}

function pushUniqueCandidate(
  out: Array<{ cityMunicipality: string; province: string }>,
  seen: Set<string>,
  cityMunicipality: string,
  province: string
): void {
  const city = cityMunicipality.trim();
  if (!city) return;
  const prov = province.trim();
  const key = `${city.toLowerCase()}|${prov.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ cityMunicipality: city, province: prov });
}

function municipalityFromLegacyRegionCity(regionId: string, cityId: string): {
  cityMunicipality: string;
  province: string;
} | null {
  const region = REGIONS.find((r) => r.id === regionId);
  const legacyCityName = region?.cities.find((c) => c.id === cityId)?.name?.trim() ?? "";
  if (!legacyCityName) return null;
  const cityMunicipality = legacyRegionCityToMunicipality(legacyCityName);
  if (!cityMunicipality) return null;
  return { cityMunicipality, province: (region?.name ?? "").trim() };
}

/** Ordered candidates — first hit wins at national LGU resolve layer. */
export function collectMasterCityMunicipalityCandidatesForNationalLgu(
  master: UserAddressDTO
): Array<{ cityMunicipality: string; province: string }> {
  const out: Array<{ cityMunicipality: string; province: string }> = [];
  const seen = new Set<string>();
  const province = (master.province ?? "").trim();

  pushUniqueCandidate(out, seen, master.cityMunicipality ?? "", province);
  pushUniqueCandidate(out, seen, master.district ?? "", province);

  const appLoc = mapUserAddressToAppLocation(master);
  if (appLoc) {
    const mapped = municipalityFromLegacyRegionCity(appLoc.regionId, appLoc.cityId);
    if (mapped) {
      pushUniqueCandidate(out, seen, mapped.cityMunicipality, province || mapped.province);
    }
  }

  const regionId = (master.appRegionId ?? "").trim();
  const cityId = (master.appCityId ?? "").trim();
  if (regionId && cityId) {
    const mapped = municipalityFromLegacyRegionCity(regionId, cityId);
    if (mapped) {
      pushUniqueCandidate(out, seen, mapped.cityMunicipality, province || mapped.province);
    }
  }

  return out;
}

/** @deprecated use collectMasterCityMunicipalityCandidatesForNationalLgu */
export function resolveMasterCityMunicipalityForNationalLgu(
  master: UserAddressDTO
): { cityMunicipality: string; province: string } | null {
  return collectMasterCityMunicipalityCandidatesForNationalLgu(master)[0] ?? null;
}
