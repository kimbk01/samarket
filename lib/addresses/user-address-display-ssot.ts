import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  formatCanonicalFullLineFromDto,
  resolveCanonicalChipLineFromDto,
} from "@/lib/addresses/canonical-address-display";
import { formatPublicAddress } from "@/lib/addresses/user-address-format";

export type UserAddressDisplayMode = "SHORT" | "FULL" | "PUBLIC";

function normalizeDisplayLine(line: string | null | undefined): string | null {
  const t = line?.replace(/\s+/g, " ").trim();
  if (!t || t === "—" || t === "-" || t === "주소 미입력") return null;
  return t;
}

export function formatUserAddressShort(row: UserAddressDTO | null | undefined): string | null {
  if (!row?.id) return null;
  return normalizeDisplayLine(resolveCanonicalChipLineFromDto(row));
}

export function formatUserAddressFull(row: UserAddressDTO | null | undefined): string | null {
  if (!row?.id) return null;
  return normalizeDisplayLine(formatCanonicalFullLineFromDto(row));
}

export function formatUserAddressPublic(row: UserAddressDTO | null | undefined): string | null {
  if (!row?.id) return null;
  return normalizeDisplayLine(formatPublicAddress(row));
}

export function formatUserAddressForMode(
  row: UserAddressDTO | null | undefined,
  mode: UserAddressDisplayMode,
): string | null {
  switch (mode) {
    case "FULL":
      return formatUserAddressFull(row);
    case "PUBLIC":
      return formatUserAddressPublic(row);
    case "SHORT":
    default:
      return formatUserAddressShort(row);
  }
}
