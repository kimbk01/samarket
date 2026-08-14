import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

export type UserAddressMasterLocation = {
  regionId: string;
  cityId: string;
};

export type UserAddressMasterSsot = {
  row: UserAddressDTO | null;
  location: UserAddressMasterLocation | null;
  missing: boolean;
};

export function pickUserAddressMasterRow(defaults: unknown): UserAddressDTO | null {
  const bag = defaults && typeof defaults === "object" ? (defaults as { master?: unknown }) : null;
  const master = coerceUserAddressDTO(bag?.master ?? null);
  return master?.id ? master : null;
}

export function resolveUserAddressMasterLocation(
  row: UserAddressDTO | null | undefined,
): UserAddressMasterLocation | null {
  if (!row?.id) return null;
  const inferred = mapUserAddressToAppLocation(row);
  if (!inferred?.regionId || !inferred?.cityId) return null;
  return { regionId: inferred.regionId, cityId: inferred.cityId };
}

export function resolveUserAddressMasterSsotFromSnapshot(
  snapshot: AddressDefaultsSnapshot | null | undefined,
): UserAddressMasterSsot {
  if (!snapshot?.ok || !snapshot.defaults) {
    return { row: null, location: null, missing: true };
  }
  const row = pickUserAddressMasterRow(snapshot.defaults);
  return {
    row,
    location: resolveUserAddressMasterLocation(row),
    missing: !row,
  };
}
