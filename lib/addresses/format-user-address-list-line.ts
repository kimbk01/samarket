import type { FormatPhAddressCardOneLineOpts } from "@/lib/addresses/ph-address-display";
import { formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import {
  formatAddressBookCardPresentation,
  type AddressBookCardPresentation,
} from "@/lib/addresses/address-book-card-presentation";

/** PH 주소 행 — `countryCode` 기준 */
export function isPhUserAddressRow(row: UserAddressDTO): boolean {
  return (row.countryCode ?? "PH").trim().toUpperCase() === "PH";
}

/**
 * 사용자 주소 목록·프로필·필라이프·사이드바 — **한 줄 plain**.
 * PH: `formatPhAddressCardOneLine` (상세 gate 먼저). 비PH: `buildAddressManagementListPrimaryLine`.
 */
export function formatUserAddressListPlainLine(
  row: UserAddressDTO,
  opts?: FormatPhAddressCardOneLineOpts | null,
): string {
  if (isPhUserAddressRow(row)) {
    return formatPhAddressCardOneLinePlain(row, opts);
  }
  return stripCountryFromAddressDisplayLine(
    buildAddressManagementListPrimaryLine(row),
    row.countryName,
  );
}

/** PH 카드 본문(gate+street) · 주소 관리·마이페이지·시트 공통 */
export function resolveUserAddressCardPresentation(
  row: UserAddressDTO | null | undefined,
  opts?: FormatPhAddressCardOneLineOpts | null,
): AddressBookCardPresentation | null {
  return formatAddressBookCardPresentation(row, opts);
}
