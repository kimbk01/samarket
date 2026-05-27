import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/** API·캐시 JSON — camelCase DTO 또는 DB snake row */
export function coerceUserAddressDTO(raw: unknown): UserAddressDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("appRegionId" in o || "fullAddress" in o) {
    return o as UserAddressDTO;
  }
  return rowToUserAddressDTO(o);
}
