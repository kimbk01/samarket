import { resolveTradeNationalLgu } from "@/lib/trade/location/national/resolve-trade-national-lgu";
import type { NationalLguResolution } from "@/lib/trade/location/national/types";

/** Structured address fields → national LGU (server). Does not use formatted_address. */
export function resolveTradeNationalLguFromAddressFields(input: {
  cityMunicipality?: string | null;
  province?: string | null;
  placeId?: string | null;
}): NationalLguResolution {
  return resolveTradeNationalLgu({
    cityMunicipality: input.cityMunicipality,
    province: input.province,
    placeId: input.placeId,
  });
}
