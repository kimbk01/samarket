import type { UserAddressDefaultsDTO, UserAddressDTO } from "@/lib/addresses/user-address-types";

/**
 * 배달 ETA·checkout 자동 채움에 쓸 주소 한 건.
 * Current USER delivery address authority is the master row.
 * Client-safe — keep free of server/fs LGU dataset imports.
 */
export function pickAddressRowForDeliveryRouting(defs: UserAddressDefaultsDTO): UserAddressDTO | null {
  return defs.master?.id ? defs.master : null;
}
