import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  mapUserAddressToAppLocation,
  type DibayAppLocationIds,
} from "@/lib/addresses/map-user-address-to-app-location";

/**
 * @deprecated Prefer `mapUserAddressToAppLocation` — this is the stable alias
 * used by trade/checkout/admin. Implementation is the ONE taxonomy mapper.
 */
export function inferAppLocationIdsFromUserAddress(a: UserAddressDTO): DibayAppLocationIds | null {
  return mapUserAddressToAppLocation(a);
}
