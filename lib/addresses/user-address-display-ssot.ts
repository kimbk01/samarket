import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  formatCanonicalFullLineFromDto,
  formattedHeadline,
  realPlaceNameFromStoredBuilding,
} from "@/lib/addresses/canonical-address-display";
import { formatPublicAddress } from "@/lib/addresses/user-address-format";
import {
  addressDisplayPartsFromUserAddress,
  formatAddressFullOneLine,
} from "@/lib/addresses/address-display-levels";

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
  /** 주소 SSOT 5단계: 주소관리 목록 제목과 같은 규칙(한국어 순서 주소의 국가·우편번호 구간 제외) */
  return formattedHeadline(row.formattedAddress?.trim() || row.roadAddress?.trim() || row.fullAddress?.trim() || "");
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
  /** 주소 SSOT 5단계: 필리핀 주소 = ③ 전체 주소(세부, 장소, 도로, 바랑가이, 시/군) — 결제·주소록과 같은 문장 */
  if ((row.countryCode ?? "PH").trim().toUpperCase() === "PH") {
    return normalizeDisplayLine(formatAddressFullOneLine(addressDisplayPartsFromUserAddress(row)));
  }
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
