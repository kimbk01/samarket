/**
 * Master address → national LGU resolve inputs (structured fields only).
 * Falls back from legacy appRegionId/appCityId when city_municipality is empty.
 */
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

export function resolveMasterCityMunicipalityForNationalLgu(
  master: UserAddressDTO
): { cityMunicipality: string; province: string } | null {
  const cityMunicipality = (master.cityMunicipality ?? "").trim();
  const province = (master.province ?? "").trim();
  if (cityMunicipality) return { cityMunicipality, province };

  const regionId = (master.appRegionId ?? "").trim();
  const cityId = (master.appCityId ?? "").trim();
  if (!regionId || !cityId) return null;

  const region = REGIONS.find((r) => r.id === regionId);
  const legacyCityName = region?.cities.find((c) => c.id === cityId)?.name?.trim() ?? "";
  if (!legacyCityName) return null;

  const derived = legacyRegionCityToMunicipality(legacyCityName);
  if (!derived) return null;

  return {
    cityMunicipality: derived,
    province: province || (region?.name ?? "").trim(),
  };
}
