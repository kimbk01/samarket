import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/** Current USER address authority: active master only. */
export function pickMasterUserAddressRow(rows: UserAddressDTO[]): UserAddressDTO | null {
  let best: UserAddressDTO | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const cur = rows[i];
    if (!cur.isDefaultMaster) continue;
    if (!best) best = cur;
  }
  return best;
}
