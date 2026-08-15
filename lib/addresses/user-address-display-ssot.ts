import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  formatCanonicalFullLineFromDto,
  realPlaceNameFromStoredBuilding,
} from "@/lib/addresses/canonical-address-display";
import { formatPublicAddress } from "@/lib/addresses/user-address-format";

export type UserAddressDisplayMode = "TITLE" | "FULL" | "PUBLIC" | "SHORT";

function normalizeDisplayLine(line: string | null | undefined): string | null {
  const t = line?.replace(/\s+/g, " ").trim();
  if (!t || t === "—" || t === "-" || t === "주소 미입력") return null;
  return t;
}

export function formatUserAddressShort(row: UserAddressDTO | null | undefined): string | null {
  return resolveUserAddressTitle(row);
}

export function formatUserAddressTitle(row: UserAddressDTO | null | undefined): string | null {
  return resolveUserAddressTitle(row);
}

function firstFormattedHeadline(row: UserAddressDTO): string {
  const raw = row.formattedAddress?.trim() || row.roadAddress?.trim() || row.fullAddress?.trim() || "";
  if (!raw) return "";
  const withoutCountry = raw.replace(/,\s*Philippines\s*$/i, "").trim();
  return withoutCountry.split(",")[0]?.trim() || withoutCountry;
}

function barangayTitle(row: UserAddressDTO): string {
  const b = row.barangay?.replace(/\s+/g, " ").trim() ?? "";
  if (!b) return "";
  return /^(barangay|brgy\.?)\b/i.test(b) ? b : `Barangay ${b}`;
}

export function resolveUserAddressTitle(row: UserAddressDTO | null | undefined): string | null {
  if (!row?.id) return null;
  const place = realPlaceNameFromStoredBuilding(row.buildingName, row.streetAddress);
  return normalizeDisplayLine(
    place ||
      row.streetAddress ||
      row.roadAddress ||
      barangayTitle(row) ||
      row.neighborhoodName ||
      firstFormattedHeadline(row),
  );
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
    case "TITLE":
      return formatUserAddressTitle(row);
    case "PUBLIC":
      return formatUserAddressPublic(row);
    case "SHORT":
    default:
      return formatUserAddressShort(row);
  }
}
