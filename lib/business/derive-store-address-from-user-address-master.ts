import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

export type DerivedStoreAddressFromMaster = {
  regionId: string;
  cityId: string;
  regionName: string;
  cityName: string;
  addressStreetLine: string;
  addressDetail: string;
};

/**
 * STORE DOMAIN EXCLUDED.
 * User address book rows must not seed, sync, or runtime-substitute store physical address fields.
 * The function remains only so existing callers can safely receive "no derived store address".
 */
export function deriveStoreAddressFieldsFromUserAddressMaster(
  master: UserAddressDTO | null | undefined
): DerivedStoreAddressFromMaster | null {
  void master;
  return null;
}
